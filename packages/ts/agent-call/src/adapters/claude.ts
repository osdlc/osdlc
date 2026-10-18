import {
  CONVERSATION_SCHEMA,
  type Conversation,
  type ConversationMessage,
  type Part,
  type Usage,
} from '../conversation.js'
import { note, TMP_TOKEN, type CapabilityNote, type PlannedCall, type TempFile } from '../plan.js'
import type { AgentCallSpec, OutputFormat, PluginSpec } from '../spec.js'
import {
  applyPermissionMode,
  asNumber,
  asString,
  buildEffectivePrompt,
  get,
  modelFlag,
  parseJsonLines,
  tryParseJson,
  commandPrefix,
  type CommandOptions,
} from './shared.js'
import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './types.js'

const MCP_CONFIG_FILE = 'mcp.json'

/** Options for {@link claudeAdapter}. */
/** Options for `claudeAdapter`: `binary`, or a `command` prefix. */
export interface ClaudeAdapterOptions extends CommandOptions {}

/**
 * Claude Code (`claude -p`). The richest surface: permissions, tool rules,
 * system prompts, structured output, sessions, and budget are all native.
 */
export function claudeAdapter(options: ClaudeAdapterOptions = {}): AgentAdapter {
  const command = commandPrefix(options, 'claude')
  const binary = command[0]!
  return {
    name: 'claude',
    binary,
    command,
    plan(spec) {
      return planClaude(command, spec)
    },
    parseResult(planned, raw) {
      return parseClaude(planned, raw)
    },
    toConversation(planned, raw) {
      return claudeConversation(planned, raw)
    },
  }
}

/**
 * `--resume=<id>`: `--resume` takes an optional value, so the `=` form keeps an
 * id that starts with `-` bound to it.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function claudeResumeFlag(id: string): string {
  return `--resume=${id}`
}

/** `--effort <level>`: passed through as given, so a level the CLI adds later needs no change here. */
export function claudeEffortArgv(effort: string): string[] {
  return ['--effort', effort]
}

/**
 * Claude argv for session-only plugins: `--plugin-dir` per dir, then a
 * `--settings` disable map. For callers that build claude's command line
 * themselves.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function claudePluginArgv(plugins: PluginSpec): string[] {
  const argv = plugins.dirs.flatMap((dir) => ['--plugin-dir', dir])
  if (plugins.disable.length > 0) {
    const enabledPlugins = Object.fromEntries(plugins.disable.map((id) => [id, false]))
    argv.push('--settings', JSON.stringify({ enabledPlugins }))
  }
  return argv
}

function planClaude(command: readonly string[], spec: AgentCallSpec): PlannedCall {
  const notes: CapabilityNote[] = []
  const tempFiles: TempFile[] = []
  const argv = [...command, '-p']

  // Prefer the JSON envelope when the caller didn't ask for a specific
  // format: same answer, plus usage/cost/session metadata.
  let format: OutputFormat = spec.output?.format ?? 'json'
  if (spec.output?.schema !== undefined && format === 'text') {
    format = 'json'
    note(
      notes,
      'output.format',
      'approximated',
      'structured output requires the json envelope; text was upgraded to json',
    )
  }
  argv.push('--output-format', format)
  if (format === 'stream-json') argv.push('--verbose')

  if (spec.model !== undefined) argv.push(...modelFlag(spec.model))

  if (spec.effort !== undefined) {
    argv.push(...claudeEffortArgv(spec.effort))
    note(notes, 'effort', 'native', '--effort')
  }

  if (spec.mcp?.servers !== undefined) {
    // A file, not inline JSON: server `env` holds tokens, and argv is readable
    // by any local user.
    tempFiles.push({
      name: MCP_CONFIG_FILE,
      content: JSON.stringify({ mcpServers: spec.mcp.servers }),
    })
    argv.push('--mcp-config', `${TMP_TOKEN}/${MCP_CONFIG_FILE}`)
    note(notes, 'mcp.servers', 'native', '--mcp-config')
    if (spec.mcp.strict === true) argv.push('--strict-mcp-config')
  }

  if (spec.plugins !== undefined) {
    argv.push(...claudePluginArgv(spec.plugins))
    note(notes, 'plugins', 'native', '--plugin-dir / --settings enabledPlugins')
  }

  if (spec.systemPrompt !== undefined) {
    argv.push('--system-prompt', spec.systemPrompt)
    note(notes, 'systemPrompt', 'native', '--system-prompt')
  }
  if (spec.appendSystemPrompt !== undefined) {
    argv.push('--append-system-prompt', spec.appendSystemPrompt)
    note(notes, 'appendSystemPrompt', 'native', '--append-system-prompt')
  }

  const permissions = spec.permissions
  applyPermissionMode(argv, notes, permissions?.mode, {
    'read-only': {
      argv: ['--permission-mode', 'plan'],
      support: 'approximated',
      detail: 'read-only mapped to --permission-mode plan (analysis only, no mutations)',
    },
    edits: {
      argv: ['--permission-mode', 'acceptEdits'],
      support: 'native',
      detail: '--permission-mode acceptEdits',
    },
    'full-auto': {
      argv: ['--permission-mode', 'acceptEdits', '--allowedTools', 'Bash WebFetch WebSearch'],
      support: 'approximated',
      detail:
        'full-auto mapped to acceptEdits plus pre-approved Bash/WebFetch/WebSearch (claude has no workspace sandbox)',
    },
    bypass: {
      argv: ['--dangerously-skip-permissions'],
      support: 'native',
      detail: '--dangerously-skip-permissions',
    },
  })
  if (permissions?.allowTools !== undefined && permissions.allowTools.length > 0) {
    argv.push('--allowedTools', permissions.allowTools.join(','))
    note(notes, 'permissions.allowTools', 'native', '--allowedTools')
  }
  if (permissions?.denyTools !== undefined && permissions.denyTools.length > 0) {
    argv.push('--disallowedTools', permissions.denyTools.join(','))
    note(notes, 'permissions.denyTools', 'native', '--disallowedTools')
  }

  for (const dir of spec.context?.dirs ?? []) {
    argv.push('--add-dir', dir)
  }
  if ((spec.context?.dirs ?? []).length > 0) {
    note(notes, 'context.dirs', 'native', '--add-dir')
  }

  if (spec.output?.schema !== undefined) {
    argv.push('--json-schema', JSON.stringify(spec.output.schema))
    note(notes, 'output.schema', 'native', '--json-schema')
  }

  const session = spec.session
  if (session?.id !== undefined) argv.push('--session-id', session.id)
  if (session?.resume !== undefined) argv.push(claudeResumeFlag(session.resume))
  if (session?.continueLast === true) argv.push('--continue')
  if (session?.persist === false) {
    argv.push('--no-session-persistence')
    note(notes, 'session.persist', 'native', '--no-session-persistence')
  }

  if (spec.budgetUsd !== undefined) {
    argv.push('--max-budget-usd', String(spec.budgetUsd))
    note(notes, 'budgetUsd', 'native', '--max-budget-usd')
  }

  argv.push(...(spec.extraArgs ?? []))

  const stdin = buildEffectivePrompt(
    spec,
    { systemNative: true, appendSystemNative: true, schemaNative: true },
    notes,
  )

  return {
    agent: 'claude',
    argv,
    stdin,
    env: { ...spec.env },
    cwd: spec.cwd,
    outputFormat: format,
    tempFiles,
    notes,
    spec,
  }
}

function parseClaude(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  if (planned.outputFormat === 'text') {
    return { text: raw.stdout.trim() }
  }

  if (planned.outputFormat === 'stream-json') {
    const events = parseJsonLines(raw.stdout)
    const result = events.find((e) => get(e, 'type') === 'result')
    if (result === undefined) {
      // The stream ended without its terminal envelope (crash, kill, truncated
      // output). Mirrors the `json` arm's missing-envelope guard below; the
      // events are still returned so callers can mine them, and the exit code
      // and stderr stay on the AgentResult.
      return {
        text: '',
        isError: true,
        errorDetail: 'claude --output-format stream-json produced no result event',
        events,
      }
    }
    return {
      ...envelopeFields(result, planned),
      events,
    }
  }

  const envelope = tryParseJson(raw.stdout)
  if (envelope === undefined) {
    return {
      text: raw.stdout.trim(),
      isError: true,
      errorDetail: 'claude --output-format json produced no parseable envelope',
    }
  }
  return envelopeFields(envelope, planned)
}

/** Shared between the `json` envelope and the `stream-json` result event. */
function envelopeFields(envelope: unknown, planned: PlannedCall): ParsedOutput {
  const text = asString(get(envelope, 'result')) ?? ''
  const subtype = asString(get(envelope, 'subtype'))
  const isError = get(envelope, 'is_error') === true || subtype === 'error'
  const parsed: ParsedOutput = {
    text,
    sessionId: asString(get(envelope, 'session_id')),
    costUsd: asNumber(get(envelope, 'total_cost_usd')),
    usage: claudeUsage(get(envelope, 'usage')),
    stopReason: subtype,
    isError,
    errorDetail: isError ? text || subtype : undefined,
  }
  if (planned.spec.output?.schema !== undefined) {
    parsed.structured = get(envelope, 'structured_output') ?? tryParseJson(text)
  }
  return parsed
}

function claudeUsage(usage: unknown): Usage | undefined {
  if (usage === null || typeof usage !== 'object') return undefined
  return {
    inputTokens: asNumber(get(usage, 'input_tokens')),
    outputTokens: asNumber(get(usage, 'output_tokens')),
    cacheReadTokens: asNumber(get(usage, 'cache_read_input_tokens')),
    cacheWriteTokens: asNumber(get(usage, 'cache_creation_input_tokens')),
  }
}

function claudeConversation(planned: PlannedCall, raw: RawProcessOutput): Conversation | undefined {
  const parsed = parseClaude(planned, raw)
  const messages: ConversationMessage[] = [
    { role: 'user', parts: [{ type: 'text', text: planned.stdin ?? '' }] },
  ]

  if (planned.outputFormat === 'stream-json') {
    for (const event of parsed.events ?? []) {
      const type = get(event, 'type')
      if (type !== 'assistant' && type !== 'user') continue
      const content = get(event, 'message', 'content')
      const parts = anthropicContentParts(content)
      if (parts.length > 0) {
        messages.push({ role: type === 'assistant' ? 'assistant' : 'tool', parts })
      }
    }
  } else if (parsed.text !== '') {
    messages.push({
      role: 'assistant',
      parts: [{ type: 'text', text: parsed.text }],
    })
  }

  const model = firstAssistantModel(parsed.events ?? [])
  return {
    schema: CONVERSATION_SCHEMA,
    agent: 'claude',
    model,
    sessionId: parsed.sessionId,
    messages,
    usage: parsed.usage,
    costUsd: parsed.costUsd,
    stopReason: parsed.stopReason,
    raw: {
      format: `claude/${planned.outputFormat}`,
      data:
        planned.outputFormat === 'stream-json'
          ? parsed.events
          : (tryParseJson(raw.stdout) ?? raw.stdout),
    },
  }
}

/** Anthropic message content blocks → normalized parts. */
function anthropicContentParts(content: unknown): Part[] {
  if (!Array.isArray(content)) return []
  const parts: Part[] = []
  for (const block of content) {
    const type = get(block, 'type')
    if (type === 'text') {
      const text = asString(get(block, 'text'))
      if (text !== undefined && text !== '') parts.push({ type: 'text', text })
    } else if (type === 'thinking') {
      const text = asString(get(block, 'thinking'))
      if (text !== undefined) parts.push({ type: 'reasoning', text })
    } else if (type === 'tool_use') {
      parts.push({
        type: 'tool-call',
        callId: asString(get(block, 'id')),
        name: asString(get(block, 'name')) ?? 'unknown',
        input: get(block, 'input'),
      })
    } else if (type === 'tool_result') {
      parts.push({
        type: 'tool-result',
        callId: asString(get(block, 'tool_use_id')),
        output: get(block, 'content'),
        isError: get(block, 'is_error') === true,
      })
    }
  }
  return parts
}

function firstAssistantModel(events: unknown[]): string | undefined {
  for (const event of events) {
    const model = asString(get(event, 'message', 'model'))
    if (model !== undefined) return model
  }
  return undefined
}
