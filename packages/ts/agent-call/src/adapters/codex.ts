import {
  CONVERSATION_SCHEMA,
  type Conversation,
  type ConversationMessage,
  type Usage,
} from '../conversation.js'
import { note, TMP_TOKEN, type CapabilityNote, type PlannedCall, type TempFile } from '../plan.js'
import type { AgentCallSpec, OutputFormat } from '../spec.js'
import {
  applyPermissionMode,
  asNumber,
  asString,
  buildEffectivePrompt,
  get,
  modelFlag,
  parseJsonLines,
  tryParseJson,
} from './shared.js'
import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './types.js'

/** Options for {@link codexAdapter}. */
export interface CodexAdapterOptions {
  /** Binary to spawn. Default: the CLI's own name. */
  binary?: string
}

const LAST_MESSAGE_FILE = 'last-message.txt'
const SCHEMA_FILE = 'output-schema.json'

/**
 * OpenAI Codex CLI (`codex exec`). Sandbox modes map cleanly onto the
 * canonical permission postures; structured output is native via
 * `--output-schema`; tool-level rules are not expressible.
 */
export function codexAdapter(options: CodexAdapterOptions = {}): AgentAdapter {
  const binary = options.binary ?? 'codex'
  return {
    name: 'codex',
    binary,
    plan(spec) {
      return planCodex(binary, spec)
    },
    parseResult(planned, raw) {
      return parseCodex(planned, raw)
    },
    toConversation(planned, raw) {
      return codexConversation(planned, raw)
    },
  }
}

/**
 * `-c model_reasoning_effort="<level>"`, quoted as codex's TOML override
 * expects. The level passes through as given; which levels a model takes
 * is the caller's to know (`codex debug models` lists them).
 */
export function codexEffortArgv(effort: string): string[] {
  return ['-c', `model_reasoning_effort="${effort}"`]
}

function planCodex(binary: string, spec: AgentCallSpec): PlannedCall {
  const notes: CapabilityNote[] = []
  const tempFiles: TempFile[] = []
  const argv = [binary, 'exec']

  const session = spec.session
  const resuming = session?.resume !== undefined || session?.continueLast === true
  if (resuming) {
    argv.push('resume')
    if (session?.resume !== undefined) argv.push(session.resume)
    else argv.push('--last')
    note(
      notes,
      session?.resume !== undefined ? 'session.resume' : 'session.continueLast',
      'native',
      'codex exec resume',
    )
  }
  if (session?.id !== undefined) {
    note(notes, 'session.id', 'dropped', 'codex assigns thread ids itself')
  }
  if (session?.persist === false) {
    argv.push('--ephemeral')
    note(notes, 'session.persist', 'native', '--ephemeral')
  }

  // Requested format → CLI reality: `--json` is a JSONL event stream, so it
  // backs both "json" (we aggregate) and "stream-json" (events exposed).
  const format: OutputFormat = spec.output?.format ?? 'json'
  if (format !== 'text') {
    argv.push('--json')
    if (format === 'json') {
      note(
        notes,
        'output.format',
        'approximated',
        'codex emits JSONL events; aggregated into a single result',
      )
    }
  } else {
    note(
      notes,
      'output.format',
      'approximated',
      'codex text output interleaves progress logs; final answer read from --output-last-message',
    )
  }
  // Clean final answer regardless of format.
  argv.push('--output-last-message', `${TMP_TOKEN}/${LAST_MESSAGE_FILE}`)
  tempFiles.push({ name: LAST_MESSAGE_FILE, content: '', readBack: true })
  argv.push('--color', 'never')
  // The canonical spec is directory-driven, not git-driven; don't refuse
  // to run in non-repo working directories.
  argv.push('--skip-git-repo-check')

  if (spec.model !== undefined) argv.push(...modelFlag(spec.model))

  if (spec.effort !== undefined) {
    argv.push(...codexEffortArgv(spec.effort))
    note(notes, 'effort', 'native', `model_reasoning_effort="${spec.effort}"`)
  }

  if (spec.mcp?.servers !== undefined) {
    for (const [name, server] of Object.entries(spec.mcp.servers)) {
      for (const [key, value] of Object.entries(server)) {
        if (value === null || value === undefined) continue
        argv.push('-c', `mcp_servers.${name}.${key}=${toToml(value)}`)
      }
    }
    note(notes, 'mcp.servers', 'approximated', 'rendered as -c mcp_servers.* config overrides')
    if (spec.mcp.strict === true) {
      note(
        notes,
        'mcp.strict',
        'dropped',
        'codex has no ignore-other-servers flag; overrides merge with config.toml',
      )
    }
  }

  const permissions = spec.permissions
  applyPermissionMode(argv, notes, permissions?.mode, {
    'read-only': {
      argv: ['--sandbox', 'read-only'],
      support: 'native',
      detail: '--sandbox read-only',
    },
    edits: {
      argv: ['--sandbox', 'workspace-write'],
      support: 'approximated',
      detail: 'edits mapped to --sandbox workspace-write (also permits workspace commands)',
    },
    'full-auto': {
      argv: ['--sandbox', 'workspace-write'],
      support: 'native',
      detail: '--sandbox workspace-write',
    },
    bypass: {
      argv: ['--dangerously-bypass-approvals-and-sandbox'],
      support: 'native',
      detail: '--dangerously-bypass-approvals-and-sandbox',
    },
  })
  if ((permissions?.allowTools ?? []).length > 0) {
    note(
      notes,
      'permissions.allowTools',
      'dropped',
      'codex has no per-tool allow rules; use permissions.mode',
    )
  }
  if ((permissions?.denyTools ?? []).length > 0) {
    note(
      notes,
      'permissions.denyTools',
      'dropped',
      'codex has no per-tool deny rules; use permissions.mode',
    )
  }

  for (const dir of spec.context?.dirs ?? []) {
    argv.push('--add-dir', dir)
  }
  if ((spec.context?.dirs ?? []).length > 0) {
    note(notes, 'context.dirs', 'native', '--add-dir')
  }

  if (spec.output?.schema !== undefined) {
    tempFiles.push({
      name: SCHEMA_FILE,
      content: JSON.stringify(spec.output.schema),
    })
    argv.push('--output-schema', `${TMP_TOKEN}/${SCHEMA_FILE}`)
    note(notes, 'output.schema', 'native', '--output-schema')
  }

  if (spec.plugins !== undefined) {
    note(notes, 'plugins', 'dropped', 'session-only plugins are claude only')
  }
  if (spec.budgetUsd !== undefined) {
    note(notes, 'budgetUsd', 'dropped', 'codex has no budget cap flag')
  }

  argv.push(...(spec.extraArgs ?? []))

  const prompt = buildEffectivePrompt(spec, { schemaNative: true }, notes)
  // `-` reads the prompt from stdin — avoids argv length limits.
  argv.push('-')

  return {
    agent: 'codex',
    argv,
    stdin: prompt,
    env: { ...spec.env },
    cwd: spec.cwd,
    outputFormat: format,
    tempFiles,
    notes,
    spec,
  }
}

/** Render a JSON value as a TOML literal for `-c key=value` overrides. */
function toToml(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(toToml).join(', ')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k} = ${toToml(v)}`)
      .join(', ')
    return `{${entries}}`
  }
  return JSON.stringify(value)
}

function parseCodex(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  const lastMessage = raw.files?.[LAST_MESSAGE_FILE]?.trim()

  if (planned.outputFormat === 'text') {
    const text = lastMessage !== undefined && lastMessage !== '' ? lastMessage : raw.stdout.trim()
    return withStructured(planned, { text })
  }

  const events = parseJsonLines(raw.stdout)
  let text = lastMessage ?? ''
  let answered = lastMessage !== undefined && lastMessage !== ''
  let sessionId: string | undefined
  let usage: Usage | undefined
  let errorDetail: string | undefined
  let turnFailed = false

  for (const event of events) {
    const type = get(event, 'type')
    if (type === 'thread.started') {
      sessionId = asString(get(event, 'thread_id'))
    } else if (type === 'turn.completed') {
      usage = codexUsage(get(event, 'usage'))
    } else if (type === 'turn.failed') {
      turnFailed = true
      errorDetail = asString(get(event, 'error', 'message')) ?? errorDetail ?? 'turn failed'
    } else if (type === 'item.completed') {
      const item = get(event, 'item')
      const itemType = get(item, 'item_type') ?? get(item, 'type')
      if (itemType === 'agent_message') {
        const itemText = asString(get(item, 'text'))
        if (itemText !== undefined) {
          text = itemText
          answered = true
        }
      } else if (itemType === 'error') {
        errorDetail = asString(get(item, 'message'))
      }
    } else if (type === 'error') {
      errorDetail = asString(get(event, 'message')) ?? 'codex reported an error'
    } else {
      // Legacy event shape: {"id": ..., "msg": {"type": "agent_message", ...}}
      const msgType = get(event, 'msg', 'type')
      if (msgType === 'agent_message') {
        const legacyText = asString(get(event, 'msg', 'message'))
        if (legacyText !== undefined) {
          text = legacyText
          answered = true
        }
      } else if (msgType === 'token_count') {
        usage = codexUsage(get(event, 'msg', 'info', 'total_token_usage')) ?? usage
      } else if (msgType === 'error') {
        errorDetail = asString(get(event, 'msg', 'message'))
      }
    }
  }

  // codex emits warning-level `error` items (e.g. config deprecations) on
  // runs that still answer; only fail when the turn failed or nothing came back.
  const isError = turnFailed || (errorDetail !== undefined && !answered)
  return withStructured(planned, {
    text,
    sessionId,
    usage,
    events,
    isError,
    errorDetail,
  })
}

function withStructured(planned: PlannedCall, parsed: ParsedOutput): ParsedOutput {
  if (planned.spec.output?.schema !== undefined && parsed.text !== '') {
    parsed.structured = tryParseJson(parsed.text)
  }
  return parsed
}

function codexUsage(usage: unknown): Usage | undefined {
  if (usage === null || typeof usage !== 'object') return undefined
  return {
    inputTokens: asNumber(get(usage, 'input_tokens')),
    outputTokens: asNumber(get(usage, 'output_tokens')),
    cacheReadTokens: asNumber(get(usage, 'cached_input_tokens')),
  }
}

function codexConversation(planned: PlannedCall, raw: RawProcessOutput): Conversation | undefined {
  const parsed = parseCodex(planned, raw)
  const messages: ConversationMessage[] = [
    { role: 'user', parts: [{ type: 'text', text: planned.stdin ?? '' }] },
  ]

  for (const event of parsed.events ?? []) {
    if (get(event, 'type') !== 'item.completed') continue
    const item = get(event, 'item')
    const itemType = get(item, 'item_type') ?? get(item, 'type')
    if (itemType === 'agent_message') {
      const text = asString(get(item, 'text'))
      if (text !== undefined) {
        messages.push({ role: 'assistant', parts: [{ type: 'text', text }] })
      }
    } else if (itemType === 'reasoning') {
      const text = asString(get(item, 'text'))
      if (text !== undefined) {
        messages.push({ role: 'assistant', parts: [{ type: 'reasoning', text }] })
      }
    } else if (itemType === 'command_execution') {
      const callId = asString(get(item, 'id'))
      messages.push({
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            callId,
            name: 'shell',
            input: { command: get(item, 'command') },
          },
        ],
      })
      messages.push({
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            callId,
            name: 'shell',
            output: {
              output: get(item, 'aggregated_output'),
              exitCode: get(item, 'exit_code'),
            },
            isError: asNumber(get(item, 'exit_code')) !== 0,
          },
        ],
      })
    } else if (itemType === 'file_change') {
      messages.push({
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            callId: asString(get(item, 'id')),
            name: 'apply_patch',
            input: { changes: get(item, 'changes') },
          },
        ],
      })
    } else if (itemType === 'mcp_tool_call') {
      messages.push({
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            callId: asString(get(item, 'id')),
            name: asString(get(item, 'tool')) ?? 'mcp',
            input: get(item, 'arguments'),
          },
        ],
      })
    } else if (itemType === 'web_search') {
      messages.push({
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            callId: asString(get(item, 'id')),
            name: 'web_search',
            input: { query: get(item, 'query') },
          },
        ],
      })
    }
  }

  // No events (text format): still record the final answer.
  if (messages.length === 1 && parsed.text !== '') {
    messages.push({
      role: 'assistant',
      parts: [{ type: 'text', text: parsed.text }],
    })
  }

  return {
    schema: CONVERSATION_SCHEMA,
    agent: 'codex',
    sessionId: parsed.sessionId,
    messages,
    usage: parsed.usage,
    stopReason: parsed.isError === true ? 'error' : undefined,
    raw: {
      format: 'codex/jsonl',
      data: (parsed.events?.length ?? 0) > 0 ? parsed.events : raw.stdout,
    },
  }
}
