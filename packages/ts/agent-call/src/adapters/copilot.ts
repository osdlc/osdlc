import {
  CONVERSATION_SCHEMA,
  type Conversation,
  type ConversationMessage,
  type Usage,
} from '../conversation.js'
import { isBelowLow } from '../models.js'
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
  withStructured,
  commandPrefix,
  type CommandOptions,
} from './shared.js'
import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './types.js'

/** Options for {@link copilotAdapter}. */
export interface CopilotAdapterOptions extends CommandOptions {}

const USAGE_FILE = 'usage.json'
const MCP_CONFIG_FILE = 'mcp.json'
const INSTRUCTIONS_FILE = 'agent-call.instructions.md'
const INSTRUCTIONS_ENV = 'COPILOT_CUSTOM_INSTRUCTIONS_DIRS'

/**
 * GitHub Copilot CLI (`copilot`). Headless when the prompt arrives on piped
 * stdin; `--output-format json` is a JSONL event stream backing both json and
 * stream-json requests. Its stream carries no token counts, so usage is read
 * back from `--usage-output-file`. Tool rules (`--allow-tool`/`--deny-tool`),
 * effort, extra directories, MCP servers and sessions are native flags;
 * `appendSystemPrompt` travels as a custom-instructions file; the system
 * prompt and output schema are emulated. Without an allow flag, any tool call
 * that needs approval is denied headless rather than prompting.
 */
export function copilotAdapter(options: CopilotAdapterOptions = {}): AgentAdapter {
  const command = commandPrefix(options, 'copilot')
  const binary = command[0]!
  return {
    name: 'copilot',
    binary,
    command,
    plan(spec) {
      return planCopilot(command, spec)
    },
    parseResult(planned, raw) {
      return parseCopilot(planned, raw)
    },
    toConversation(planned, raw) {
      return copilotConversation(planned, raw)
    },
  }
}

function planCopilot(command: readonly string[], spec: AgentCallSpec): PlannedCall {
  const notes: CapabilityNote[] = []
  const tempFiles: TempFile[] = []
  const env: Record<string, string> = { ...spec.env }
  const argv = [...command]

  // `--output-format json` is a JSONL event stream, so it backs both "json"
  // (we aggregate) and "stream-json" (events exposed). Text needs `-s`, or the
  // CLI appends a stats footer to the answer.
  const format: OutputFormat = spec.output?.format ?? 'json'
  if (format === 'text') {
    argv.push('-s')
  } else {
    argv.push('--output-format', 'json')
    if (format === 'json') {
      note(
        notes,
        'output.format',
        'approximated',
        'copilot emits JSONL events; aggregated into a single result',
      )
    }
  }
  // The event stream drops assistant.usage, so token counts come from this
  // file in every format.
  argv.push('--usage-output-file', `${TMP_TOKEN}/${USAGE_FILE}`)
  tempFiles.push({ name: USAGE_FILE, content: '', readBack: true })

  if (spec.model !== undefined) argv.push(...modelFlag(spec.model))

  if (spec.effort !== undefined) {
    if (isBelowLow(spec.effort)) {
      argv.push('--reasoning-effort', 'low')
      note(
        notes,
        'effort',
        'approximated',
        '--reasoning-effort low (copilot has no level below low)',
      )
    } else {
      argv.push('--reasoning-effort', spec.effort)
      note(notes, 'effort', 'native', '--reasoning-effort')
    }
  }

  if (spec.mcp?.servers !== undefined) {
    // A file, not inline JSON: server `env` holds tokens, and argv is readable
    // by any local user.
    tempFiles.push({
      name: MCP_CONFIG_FILE,
      content: JSON.stringify({ mcpServers: spec.mcp.servers }),
    })
    argv.push('--additional-mcp-config', `@${TMP_TOKEN}/${MCP_CONFIG_FILE}`)
    note(notes, 'mcp.servers', 'native', '--additional-mcp-config')
    if (spec.mcp.strict === true) {
      argv.push('--disable-builtin-mcps')
      note(
        notes,
        'mcp.strict',
        'approximated',
        '--disable-builtin-mcps (servers in ~/.copilot/mcp-config.json still load)',
      )
    }
  }

  if (spec.plugins !== undefined) {
    for (const dir of spec.plugins.dirs) argv.push('--plugin-dir', dir)
    note(
      notes,
      'plugins',
      spec.plugins.disable.length > 0 ? 'approximated' : 'native',
      spec.plugins.disable.length > 0
        ? '--plugin-dir; copilot has no flag to disable an installed plugin'
        : '--plugin-dir',
    )
  }

  if (spec.appendSystemPrompt !== undefined) {
    // copilot loads `*.instructions.md` from each directory in this env var
    // into the system prompt, after its own sections.
    tempFiles.push({ name: INSTRUCTIONS_FILE, content: `${spec.appendSystemPrompt}\n` })
    const extra = env[INSTRUCTIONS_ENV]
    env[INSTRUCTIONS_ENV] = extra === undefined ? TMP_TOKEN : `${TMP_TOKEN},${extra}`
    note(
      notes,
      'appendSystemPrompt',
      'approximated',
      `written to a custom-instructions file loaded via ${INSTRUCTIONS_ENV} (appended to the system prompt; replaces a ${INSTRUCTIONS_ENV} from the parent environment, so pass that in spec.env to keep it)`,
    )
  }

  const permissions = spec.permissions
  applyPermissionMode(argv, notes, permissions?.mode, {
    'read-only': {
      argv: ['--deny-tool=write'],
      support: 'approximated',
      detail:
        'read-only mapped to --deny-tool=write (shell commands copilot judges read-only still run; others are denied headless)',
    },
    edits: {
      argv: ['--allow-tool=write'],
      support: 'native',
      detail: '--allow-tool=write',
    },
    'full-auto': {
      argv: ['--allow-all-tools'],
      support: 'approximated',
      detail:
        'full-auto mapped to --allow-all-tools (path checks keep files to the workspace; no OS sandbox)',
    },
    bypass: {
      argv: ['--allow-all'],
      support: 'native',
      detail: '--allow-all',
    },
  })
  // `=` binds one pattern per flag: both flags are variadic, so a bare value
  // list would swallow the arguments after it.
  for (const tool of permissions?.allowTools ?? []) argv.push(`--allow-tool=${tool}`)
  if ((permissions?.allowTools ?? []).length > 0) {
    note(notes, 'permissions.allowTools', 'native', '--allow-tool')
  }
  for (const tool of permissions?.denyTools ?? []) argv.push(`--deny-tool=${tool}`)
  if ((permissions?.denyTools ?? []).length > 0) {
    note(notes, 'permissions.denyTools', 'native', '--deny-tool')
  }

  for (const dir of spec.context?.dirs ?? []) {
    argv.push('--add-dir', dir)
  }
  if ((spec.context?.dirs ?? []).length > 0) {
    note(notes, 'context.dirs', 'native', '--add-dir')
  }

  const session = spec.session
  if (session?.resume !== undefined) {
    // `--resume` takes an optional value; `=` keeps an id bound to it.
    argv.push(`--resume=${session.resume}`)
    note(notes, 'session.resume', 'native', '--resume=<id>')
  } else if (session?.continueLast === true) {
    argv.push('--continue')
    note(notes, 'session.continueLast', 'native', '--continue')
  }
  if (session?.id !== undefined) {
    argv.push(`--session-id=${session.id}`)
    note(
      notes,
      'session.id',
      'native',
      '--session-id (a UUID; an id that already exists resumes that session)',
    )
  }
  if (session?.persist === false) {
    note(
      notes,
      'session.persist',
      'dropped',
      'copilot always records sessions under ~/.copilot/session-state',
    )
  }
  if (spec.budgetUsd !== undefined) {
    note(notes, 'budgetUsd', 'dropped', 'copilot caps AI credits (--max-ai-credits), not dollars')
  }

  argv.push(...(spec.extraArgs ?? []))

  // `@path` is not expanded in prompt mode and --attachment takes only images
  // and documents, so files are listed in the preamble.
  const stdin = buildEffectivePrompt(spec, { appendSystemNative: true }, notes)

  return {
    agent: 'copilot',
    argv,
    stdin,
    env,
    cwd: spec.cwd,
    outputFormat: format,
    tempFiles,
    notes,
    spec,
  }
}

function parseCopilot(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  const usageFile = tryParseJson(raw.files?.[USAGE_FILE] ?? '')
  const usage = copilotUsage(usageFile)
  const fileModel = asString(get(usageFile, 'currentModel'))

  if (planned.outputFormat === 'text') {
    return withStructured(planned, { text: raw.stdout.trim(), usage, model: fileModel })
  }

  const events = parseJsonLines(raw.stdout)
  let text = ''
  let model: string | undefined
  let sessionId: string | undefined
  let errorDetail: string | undefined
  let result: unknown

  for (const event of events) {
    const type = get(event, 'type')
    if (type === 'session.start') {
      sessionId = asString(get(event, 'data', 'sessionId')) ?? sessionId
    } else if (type === 'assistant.message') {
      // Sub-agent messages carry parentToolCallId; the answer is the main agent's.
      if (get(event, 'data', 'parentToolCallId') !== undefined) continue
      model = asString(get(event, 'data', 'model')) ?? model
      const content = asString(get(event, 'data', 'content'))
      if (content !== undefined && content !== '') text = content
    } else if (type === 'session.error') {
      errorDetail = asString(get(event, 'data', 'message')) ?? 'copilot reported an error'
    } else if (type === 'result') {
      result = event
    }
  }

  const parsed: ParsedOutput = {
    text: text.trim(),
    sessionId: asString(get(result, 'sessionId')) ?? sessionId,
    model: model ?? fileModel,
    usage,
    events,
  }
  const exitCode = asNumber(get(result, 'exitCode'))
  const blocker = get(result, 'outcome') === 'blocked' ? get(result, 'blocker') : undefined
  if (result === undefined) {
    parsed.isError = true
    parsed.errorDetail = errorDetail ?? 'copilot --output-format json produced no result event'
  } else if (
    errorDetail !== undefined ||
    (exitCode !== undefined && exitCode !== 0) ||
    blocker !== undefined
  ) {
    parsed.isError = true
    parsed.errorDetail =
      errorDetail ??
      (blocker !== undefined
        ? `copilot was blocked: ${asString(blocker) ?? JSON.stringify(blocker)}`
        : `copilot finished with exit code ${exitCode}`)
  } else {
    parsed.isError = false
  }
  return withStructured(planned, parsed)
}

/**
 * The `--usage-output-file` report: per-model counts under `modelMetrics`,
 * summed here. Its `cost` and `totalNanoAiu` are request multipliers and AI
 * credits, not dollars, so no `costUsd` is derived.
 */
function copilotUsage(report: unknown): Usage | undefined {
  const metrics = get(report, 'modelMetrics')
  if (metrics === null || typeof metrics !== 'object') return undefined
  const totals: Usage = {}
  const add = (key: keyof Usage, value: unknown): void => {
    const n = asNumber(value)
    if (n !== undefined) totals[key] = (totals[key] ?? 0) + n
  }
  for (const entry of Object.values(metrics as Record<string, unknown>)) {
    add('inputTokens', get(entry, 'usage', 'inputTokens'))
    add('outputTokens', get(entry, 'usage', 'outputTokens'))
    add('cacheReadTokens', get(entry, 'usage', 'cacheReadTokens'))
    add('cacheWriteTokens', get(entry, 'usage', 'cacheWriteTokens'))
  }
  return Object.keys(totals).length > 0 ? totals : undefined
}

function copilotConversation(
  planned: PlannedCall,
  raw: RawProcessOutput,
): Conversation | undefined {
  const parsed = parseCopilot(planned, raw)
  const messages: ConversationMessage[] = [
    { role: 'user', parts: [{ type: 'text', text: planned.stdin ?? '' }] },
  ]
  const toolNames = new Map<string, string>()

  for (const event of parsed.events ?? []) {
    const type = get(event, 'type')
    const data = get(event, 'data')
    // Sub-agent traffic (parentToolCallId) stays in raw; the main thread is lifted.
    if (get(data, 'parentToolCallId') !== undefined) continue
    const timestamp = asString(get(event, 'timestamp'))

    if (type === 'assistant.reasoning') {
      const text = asString(get(data, 'content'))
      if (text !== undefined && text !== '') {
        messages.push({ role: 'assistant', parts: [{ type: 'reasoning', text }], timestamp })
      }
    } else if (type === 'assistant.message') {
      const message: ConversationMessage = { role: 'assistant', parts: [], timestamp }
      const content = asString(get(data, 'content'))
      if (content !== undefined && content !== '') {
        message.parts.push({ type: 'text', text: content })
      }
      const requests = get(data, 'toolRequests')
      for (const request of Array.isArray(requests) ? requests : []) {
        const callId = asString(get(request, 'toolCallId'))
        const name = asString(get(request, 'name')) ?? 'unknown'
        if (callId !== undefined) toolNames.set(callId, name)
        message.parts.push({ type: 'tool-call', callId, name, input: get(request, 'arguments') })
      }
      if (message.parts.length > 0) messages.push(message)
    } else if (type === 'tool.execution_complete') {
      const callId = asString(get(data, 'toolCallId'))
      const success = get(data, 'success') === true
      messages.push({
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            callId,
            name: callId === undefined ? undefined : toolNames.get(callId),
            output: success
              ? (get(data, 'result', 'content') ?? get(data, 'result'))
              : (get(data, 'error', 'message') ?? get(data, 'error')),
            isError: !success,
          },
        ],
        timestamp,
      })
    }
  }

  // No events (text format): still record the final answer.
  if (messages.length === 1 && parsed.text !== '') {
    messages.push({ role: 'assistant', parts: [{ type: 'text', text: parsed.text }] })
  }

  return {
    schema: CONVERSATION_SCHEMA,
    agent: 'copilot',
    model: parsed.model,
    sessionId: parsed.sessionId,
    messages,
    usage: parsed.usage,
    stopReason: parsed.isError === true ? 'error' : undefined,
    raw: {
      format: 'copilot/jsonl',
      data: (parsed.events?.length ?? 0) > 0 ? parsed.events : raw.stdout,
    },
  }
}
