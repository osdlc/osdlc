import {
  CONVERSATION_SCHEMA,
  type Conversation,
  type ConversationMessage,
  type Usage,
} from '../conversation.js'
import { note, type CapabilityNote, type PlannedCall } from '../plan.js'
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
  commandPrefix,
  type CommandOptions,
} from './shared.js'
import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './types.js'

/** Options for {@link antigravityAdapter}. */
/** Options for `antigravityAdapter`: `binary`, or a `command` prefix. */
export interface AntigravityAdapterOptions extends CommandOptions {}

/**
 * Google Antigravity CLI (`agy`). Headless via `-p <prompt>` with
 * `--output-format text|json|stream-json`. Effort, the output schema,
 * session continuation and the full-auto posture are native flags; the CLI
 * documents no system-prompt flag, so system prompts are emulated; `cwd` and
 * `env` apply to the process. Model slugs are not documented (`agy models`
 * lists them), so `model` passes through as given.
 */
export function antigravityAdapter(options: AntigravityAdapterOptions = {}): AgentAdapter {
  const command = commandPrefix(options, 'agy')
  const binary = command[0]!
  return {
    name: 'antigravity',
    binary,
    command,
    plan(spec) {
      return planAntigravity(command, spec)
    },
    parseResult(planned, raw) {
      return parseAntigravity(planned, raw)
    },
    toConversation(planned, raw) {
      return antigravityConversation(planned, raw)
    },
  }
}

function planAntigravity(command: readonly string[], spec: AgentCallSpec): PlannedCall {
  const notes: CapabilityNote[] = []
  const env: Record<string, string> = { ...spec.env }
  const argv = [...command]

  const format: OutputFormat = spec.output?.format ?? 'json'
  if (format !== 'text') argv.push('--output-format', format)

  if (spec.model !== undefined) argv.push(...modelFlag(spec.model))

  if (spec.effort !== undefined) {
    // agy documents low|medium|high; `xhigh` and `max` clamp to the top rung.
    const clamped = spec.effort === 'xhigh' || spec.effort === 'max'
    argv.push('--effort', clamped ? 'high' : spec.effort)
    note(
      notes,
      'effort',
      clamped ? 'approximated' : 'native',
      clamped ? '--effort high (agy tops out at high)' : '--effort',
    )
  }
  if (spec.mcp?.servers !== undefined) {
    note(
      notes,
      'mcp.servers',
      'dropped',
      'antigravity takes MCP servers from mcp_config.json, not a flag',
    )
  }

  const permissions = spec.permissions
  applyPermissionMode(argv, notes, permissions?.mode, {
    'read-only': {
      argv: ['--sandbox'],
      support: 'approximated',
      detail: 'read-only mapped to --sandbox (agy documents no read-only approval mode)',
    },
    'full-auto': {
      argv: ['--dangerously-skip-permissions'],
      support: 'approximated',
      detail:
        'full-auto mapped to --dangerously-skip-permissions (agy approves everything; no workspace scoping)',
    },
    bypass: {
      argv: ['--dangerously-skip-permissions'],
      support: 'native',
      detail: '--dangerously-skip-permissions',
    },
  })
  if (permissions?.mode === 'edits') {
    note(
      notes,
      'permissions.mode',
      'dropped',
      'antigravity documents no edits-only approval mode; unapproved tool calls are denied headless',
    )
  }
  if ((permissions?.allowTools ?? []).length > 0) {
    note(
      notes,
      'permissions.allowTools',
      'dropped',
      'no CLI flag; configure permissions.allow in antigravity-cli/settings.json',
    )
  }
  if ((permissions?.denyTools ?? []).length > 0) {
    note(
      notes,
      'permissions.denyTools',
      'dropped',
      'no CLI flag; configure permission rules in antigravity-cli/settings.json',
    )
  }

  if ((spec.context?.dirs ?? []).length > 0) {
    note(notes, 'context.dirs', 'dropped', 'antigravity documents no extra-directory flag')
  }

  if (spec.output?.schema !== undefined) {
    argv.push('--json-schema', JSON.stringify(spec.output.schema))
    note(notes, 'output.schema', 'native', '--json-schema')
  }

  const session = spec.session
  if (session?.resume !== undefined) {
    argv.push('--conversation', session.resume)
    note(notes, 'session.resume', 'native', '--conversation')
  } else if (session?.continueLast === true) {
    argv.push('--continue')
    note(notes, 'session.continueLast', 'native', '--continue')
  }
  if (session?.id !== undefined) {
    note(notes, 'session.id', 'dropped', 'antigravity assigns conversation ids itself')
  }
  if (session?.persist === false) {
    note(notes, 'session.persist', 'dropped', 'antigravity always persists conversations')
  }
  if (spec.plugins !== undefined) {
    note(notes, 'plugins', 'dropped', 'session-only plugins are claude only')
  }
  if (spec.budgetUsd !== undefined) {
    note(notes, 'budgetUsd', 'dropped', 'antigravity has no budget cap flag')
  }

  argv.push(...(spec.extraArgs ?? []))

  // The prompt is the value of -p, so it travels in argv, not stdin. The schema
  // is native (--json-schema); both system prompts have no flag and are emulated.
  const prompt = buildEffectivePrompt(spec, { filesAtSyntax: true, schemaNative: true }, notes)
  argv.push('-p', prompt)

  return {
    agent: 'antigravity',
    argv,
    prompt,
    env,
    cwd: spec.cwd,
    outputFormat: format,
    tempFiles: [],
    notes,
    spec,
  }
}

function parseAntigravity(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  if (planned.outputFormat === 'text') {
    const parsed: ParsedOutput = { text: raw.stdout.trim() }
    if (planned.spec.output?.schema !== undefined) {
      parsed.structured = tryParseJson(parsed.text)
    }
    return parsed
  }

  if (planned.outputFormat === 'stream-json') {
    return parseAntigravityStream(planned, raw)
  }

  const envelope = tryParseJson(raw.stdout)
  if (envelope === undefined) {
    return {
      text: raw.stdout.trim(),
      isError: true,
      errorDetail: 'agy --output-format json produced no parseable envelope',
    }
  }
  return fromResultEnvelope(planned, envelope)
}

/** Shared by the json envelope and the stream's closing `result` event, which carries the same shape. */
function fromResultEnvelope(planned: PlannedCall, envelope: unknown): ParsedOutput {
  const text = asString(get(envelope, 'response')) ?? ''
  const status = asString(get(envelope, 'status'))
  const error = get(envelope, 'error')
  const hasError = error !== undefined && error !== null && error !== ''
  const parsed: ParsedOutput = {
    text,
    sessionId: asString(get(envelope, 'conversation_id')),
    usage: antigravityUsage(get(envelope, 'usage')),
    isError: hasError || (status !== undefined && status !== 'SUCCESS'),
  }
  if (parsed.isError === true) {
    parsed.errorDetail =
      asString(error) ?? asString(get(error, 'message')) ?? `agy finished with status ${status}`
  }
  if (planned.spec.output?.schema !== undefined) {
    parsed.structured = get(envelope, 'structured_output') ?? tryParseJson(text)
  }
  return parsed
}

function parseAntigravityStream(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  const events = parseJsonLines(raw.stdout)
  const textChunks: string[] = []
  let model: string | undefined
  let result: ParsedOutput | undefined

  for (const event of events) {
    const kind = get(event, 'event')
    if (kind === 'init') {
      model = asString(get(event, 'model'))
    } else if (kind === 'step_update') {
      const delta = asString(get(event, 'text_delta'))
      if (get(event, 'step_type') === 'agent_response' && delta !== undefined) {
        textChunks.push(delta)
      }
    } else if (kind === 'result') {
      result = fromResultEnvelope(planned, event)
    }
  }

  const streamed = textChunks.join('').trim()
  const parsed: ParsedOutput = {
    ...result,
    text: result !== undefined && result.text !== '' ? result.text : streamed,
    model,
    events,
  }
  if (result === undefined) {
    parsed.isError = true
    parsed.errorDetail = 'agy stream-json ended without a result event'
  }
  if (planned.spec.output?.schema !== undefined && parsed.structured === undefined) {
    parsed.structured = tryParseJson(parsed.text)
  }
  return parsed
}

/**
 * agy reports `thinking_tokens` beside `output_tokens` (its `total_tokens` is
 * input + output + thinking + cache reads). claude's and codex's output counts
 * already include reasoning, so thinking folds into `outputTokens` here and a
 * sum of the parts matches `totalTokens`. `input_tokens` excludes cache reads,
 * as claude's does.
 */
function antigravityUsage(usage: unknown): Usage | undefined {
  if (usage === null || typeof usage !== 'object') return undefined
  const output = asNumber(get(usage, 'output_tokens'))
  const thinking = asNumber(get(usage, 'thinking_tokens'))
  return {
    inputTokens: asNumber(get(usage, 'input_tokens')),
    outputTokens:
      output === undefined && thinking === undefined ? undefined : (output ?? 0) + (thinking ?? 0),
    cacheReadTokens: asNumber(get(usage, 'cache_read_tokens')),
    totalTokens: asNumber(get(usage, 'total_tokens')),
  }
}

function antigravityConversation(
  planned: PlannedCall,
  raw: RawProcessOutput,
): Conversation | undefined {
  const parsed = parseAntigravity(planned, raw)
  const messages: ConversationMessage[] = [
    { role: 'user', parts: [{ type: 'text', text: planned.prompt ?? '' }] },
  ]

  if (planned.outputFormat === 'stream-json') {
    // Tool steps are reported as step_update events; the CLI documents no
    // tool-result payload, so only the call is surfaced (once, when DONE).
    for (const event of parsed.events ?? []) {
      if (
        get(event, 'event') === 'step_update' &&
        get(event, 'step_type') === 'tool' &&
        get(event, 'state') === 'DONE'
      ) {
        messages.push({
          role: 'assistant',
          parts: [
            {
              type: 'tool-call',
              callId: String(get(event, 'step_index') ?? ''),
              name: asString(get(event, 'tool_name')) ?? 'unknown',
              input: get(event, 'tool_info'),
            },
          ],
        })
      }
    }
  }
  if (parsed.text !== '') {
    messages.push({
      role: 'assistant',
      parts: [{ type: 'text', text: parsed.text }],
    })
  }

  return {
    schema: CONVERSATION_SCHEMA,
    agent: 'antigravity',
    model: parsed.model,
    sessionId: parsed.sessionId,
    messages,
    usage: parsed.usage,
    stopReason: parsed.isError === true ? 'error' : undefined,
    raw: {
      format: `antigravity/${planned.outputFormat}`,
      data:
        planned.outputFormat === 'stream-json'
          ? parsed.events
          : (tryParseJson(raw.stdout) ?? raw.stdout),
    },
  }
}
