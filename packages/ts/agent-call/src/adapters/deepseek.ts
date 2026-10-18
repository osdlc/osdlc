import {
  CONVERSATION_SCHEMA,
  type Conversation,
  type ConversationMessage,
  type Part,
  type Usage,
} from '../conversation.js'
import { note, TMP_TOKEN, type CapabilityNote, type PlannedCall, type TempFile } from '../plan.js'
import type { AgentCallSpec, OutputFormat, PermissionMode } from '../spec.js'
import {
  asNumber,
  asString,
  buildEffectivePrompt,
  get,
  parseJsonLines,
  tryParseJson,
} from './shared.js'
import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './types.js'

/** Options for {@link deepseekAdapter}. */
export interface DeepseekAdapterOptions {
  /** Binary to spawn. Default: the CLI's own name. */
  binary?: string
}

const PATCH_FILE = 'dsh-patch.yml'

/** The shipped default model, restated when only the effort changes (a patch replaces the whole row). */
const DEFAULT_PROVIDER = 'deepseek-official'
const DEFAULT_MODEL = 'deepseek-flash'
/** The headless bundle's persona prefix, restated when only the suffix changes. */
const HEADLESS_PERSONA_PREFIX = 'You are a coding agent powered by the {{model}} model.'

/** permissions.mode → `DSH_PERMISSION_MODE`, the preset the sandbox and approval rows read. */
const PERMISSION_ENV: Record<Exclude<PermissionMode, 'default'>, string> = {
  'read-only': 'read-only',
  edits: 'workspace-write',
  'full-auto': 'workspace-write',
  bypass: 'danger-full-access',
}

/**
 * DeepSeek Harness (`dsh --profile headless`). The prompt travels on stdin
 * (`-`); `--json` is an NDJSON event stream backing both json and
 * stream-json requests. The CLI has no model, effort or system-prompt flags,
 * so those (and MCP servers) are rows of a `--patch` overlay file the
 * launcher layers over the profile; permission postures ride the
 * `DSH_PERMISSION_MODE` env preset. Headless denies any tool call that needs
 * approval (there is no approval channel), so no posture can hang a run.
 */
export function deepseekAdapter(options: DeepseekAdapterOptions = {}): AgentAdapter {
  const binary = options.binary ?? 'dsh'
  return {
    name: 'deepseek',
    binary,
    plan(spec) {
      return planDeepseek(binary, spec)
    },
    parseResult(planned, raw) {
      return parseDeepseek(planned, raw)
    },
    toConversation(planned, raw) {
      return deepseekConversation(planned, raw)
    },
  }
}

/**
 * dsh's reasoning efforts are `off | low | high | max`. `medium` rounds up to
 * dsh's own default `high`, and `xhigh` to `max`.
 */
function dshEffort(effort: string): { value: string; clamped: boolean } {
  if (effort === 'medium') return { value: 'high', clamped: true }
  if (effort === 'xhigh') return { value: 'max', clamped: true }
  return { value: effort, clamped: false }
}

function planDeepseek(binary: string, spec: AgentCallSpec): PlannedCall {
  const notes: CapabilityNote[] = []
  const tempFiles: TempFile[] = []
  const env: Record<string, string> = { ...spec.env }
  // Launcher flags (`--patch`) must precede the app's own flags.
  const argv = [binary, '--profile', 'headless']
  // Rows of the --patch overlay. A row's `config` replaces the profile's whole
  // config for that row id, so each row restates every field it keeps.
  const patch: Record<string, unknown>[] = []

  if (spec.model !== undefined || spec.effort !== undefined) {
    const config: Record<string, unknown> = {
      provider: DEFAULT_PROVIDER,
      model: spec.model ?? DEFAULT_MODEL,
    }
    if (spec.effort !== undefined) {
      const effort = dshEffort(spec.effort)
      config['reasoningEffort'] = effort.value
      note(
        notes,
        'effort',
        'approximated',
        effort.clamped
          ? `reasoningEffort: ${effort.value} in a --patch overlay (dsh takes off|low|high|max)`
          : 'reasoningEffort in a --patch overlay of the agent-default-model row',
      )
    }
    patch.push({ id: 'agent-default-model', config })
    if (spec.model !== undefined) {
      note(
        notes,
        'model',
        'approximated',
        `no model flag; set on the agent-default-model row of a --patch overlay (provider ${DEFAULT_PROVIDER})`,
      )
    }
  }

  // The system-prompt row owns the persona around dsh's first-party tool
  // guidance: personaPrefix opens the prompt, personaSuffix closes it.
  if (spec.systemPrompt !== undefined || spec.appendSystemPrompt !== undefined) {
    const config: Record<string, unknown> = {}
    if (spec.systemPrompt !== undefined) {
      config['includeHarnessIdentity'] = false
      config['personaPrefix'] = spec.systemPrompt
      note(
        notes,
        'systemPrompt',
        'approximated',
        'personaPrefix (harness identity off) in a --patch overlay; dsh tool guidance still follows it, and {{name}} groups interpolate',
      )
    } else {
      config['personaPrefix'] = HEADLESS_PERSONA_PREFIX
    }
    if (spec.appendSystemPrompt !== undefined) {
      config['personaSuffix'] = spec.appendSystemPrompt
      note(notes, 'appendSystemPrompt', 'native', 'personaSuffix in a --patch overlay')
    }
    patch.push({ id: 'system-prompt', config })
  }

  if (spec.mcp?.servers !== undefined) {
    const rows: Record<string, unknown>[] = []
    const skipped: string[] = []
    for (const [name, server] of Object.entries(spec.mcp.servers)) {
      const config = mcpClientConfig(name, server)
      if (config === undefined) skipped.push(name)
      else rows.push({ id: `agent-call-mcp-${name}`, name: '@deepseek-ai/dsh-mcp-client', config })
    }
    if (rows.length > 0) patch.push({ insert: rows })
    note(
      notes,
      'mcp.servers',
      'approximated',
      'rendered as dsh-mcp-client rows in a --patch overlay file (env stays off argv)' +
        (skipped.length > 0 ? `; skipped (no command or url): ${skipped.join(', ')}` : ''),
    )
    if (spec.mcp.strict === true) {
      note(
        notes,
        'mcp.strict',
        'dropped',
        'dsh has no ignore-other-servers switch; profile mcp-client rows still load',
      )
    }
  }

  if (patch.length > 0) {
    // JSON is YAML, so the patch list needs no YAML serializer.
    tempFiles.push({ name: PATCH_FILE, content: JSON.stringify(patch, null, 2) })
    argv.push('--patch', `${TMP_TOKEN}/${PATCH_FILE}`)
  }

  // `--json` is an NDJSON event stream, so it backs both "json" (we
  // aggregate) and "stream-json" (events exposed).
  const format: OutputFormat = spec.output?.format ?? 'json'
  if (format !== 'text') {
    argv.push('--json')
    if (format === 'json') {
      note(
        notes,
        'output.format',
        'approximated',
        'dsh --json emits NDJSON events; aggregated into a single result',
      )
    }
  }

  const permissions = spec.permissions
  const mode = permissions?.mode
  if (mode !== undefined && mode !== 'default') {
    env['DSH_PERMISSION_MODE'] = PERMISSION_ENV[mode]
    if (mode === 'edits') {
      note(
        notes,
        'permissions.mode',
        'approximated',
        'edits mapped to DSH_PERMISSION_MODE=workspace-write (also permits workspace commands)',
      )
    } else {
      note(notes, 'permissions.mode', 'native', `DSH_PERMISSION_MODE=${env['DSH_PERMISSION_MODE']}`)
    }
  }
  if ((permissions?.allowTools ?? []).length > 0) {
    note(
      notes,
      'permissions.allowTools',
      'dropped',
      'dsh has no per-tool allow rules; use permissions.mode',
    )
  }
  if ((permissions?.denyTools ?? []).length > 0) {
    note(
      notes,
      'permissions.denyTools',
      'dropped',
      'dsh has no per-tool deny rules; use permissions.mode',
    )
  }

  if ((spec.context?.dirs ?? []).length > 0) {
    note(
      notes,
      'context.dirs',
      'dropped',
      'dsh scopes the sandbox to the session working directory; no add-dir option',
    )
  }

  const session = spec.session
  if (session?.resume !== undefined) {
    // The `=` form keeps an id that starts with `-` bound to the option.
    argv.push(`--session-id=${session.resume}`)
    note(
      notes,
      'session.resume',
      'native',
      '--session-id (adopts the persisted session; it must exist and share the cwd)',
    )
  } else if (session?.continueLast === true) {
    note(
      notes,
      'session.continueLast',
      'dropped',
      'dsh headless resumes only a named session (--session-id)',
    )
  }
  if (session?.id !== undefined) {
    note(
      notes,
      'session.id',
      'dropped',
      'dsh assigns session ids itself; --session-id only adopts an existing one',
    )
  }
  if (session?.persist === false) {
    note(notes, 'session.persist', 'dropped', 'dsh always persists sessions under $DSH_HOME')
  }
  if (spec.plugins !== undefined) {
    note(notes, 'plugins', 'dropped', 'session-only plugins are claude and copilot only')
  }
  if (spec.budgetUsd !== undefined) {
    note(notes, 'budgetUsd', 'dropped', 'dsh has no budget cap')
  }

  argv.push(...(spec.extraArgs ?? []))

  // The system prompts ride the system-prompt row, so neither is folded in.
  const prompt = buildEffectivePrompt(spec, { systemNative: true, appendSystemNative: true }, notes)
  // A lone `-` reads the task from stdin, keeping it out of argv.
  argv.push('-')

  return {
    agent: 'deepseek',
    argv,
    stdin: prompt,
    env,
    cwd: spec.cwd,
    outputFormat: format,
    tempFiles,
    notes,
    spec,
  }
}

/**
 * The common `mcpServers` entry → a dsh-mcp-client config: `command` runs over
 * stdio, `url` over Streamable HTTP (dsh has no SSE transport).
 */
function mcpClientConfig(
  name: string,
  server: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const command = asString(server['command'])
  if (command !== undefined) {
    const config: Record<string, unknown> = { serverName: name, transport: 'stdio', command }
    if (server['args'] !== undefined) config['args'] = server['args']
    if (server['env'] !== undefined) config['env'] = server['env']
    if (server['cwd'] !== undefined) config['cwd'] = server['cwd']
    return config
  }
  const url = asString(server['url'])
  if (url !== undefined) {
    const config: Record<string, unknown> = { serverName: name, transport: 'streamable-http', url }
    if (server['headers'] !== undefined) config['headers'] = server['headers']
    return config
  }
  return undefined
}

function parseDeepseek(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  if (planned.outputFormat === 'text') {
    // Default mode: the final answer on stdout, `dsh: <code>: <message>` on
    // stderr when the run fails (exit 1).
    const parsed: ParsedOutput = { text: raw.stdout.trim() }
    if (raw.exitCode !== null && raw.exitCode !== 0) {
      parsed.isError = true
      parsed.errorDetail = lastDiagnostic(raw.stderr) ?? `dsh exited ${raw.exitCode}`
    }
    return withStructured(planned, parsed)
  }

  const events = parseJsonLines(raw.stdout)
  let text: string | undefined
  let lastText: string | undefined
  let sessionId: string | undefined
  let usage: Usage | undefined
  let reason: unknown
  let errorDetail: string | undefined

  for (const event of events) {
    const type = get(event, 'type')
    if (type === 'session') {
      sessionId = asString(get(event, 'sessionId'))
    } else if (type === 'text') {
      lastText = asString(get(event, 'text')) ?? lastText
    } else if (type === 'final') {
      text = asString(get(event, 'text'))
    } else if (type === 'status') {
      const phase = get(event, 'phase')
      if (phase === 'step_end') usage = addUsage(usage, get(event, 'usage'))
      else if (phase === 'turn_end') reason = get(event, 'reason')
    } else if (type === 'error') {
      // Raised outside a turn (bad --session-id, usage error): no final follows.
      errorDetail = asString(get(event, 'message')) ?? 'dsh reported an error'
    }
  }

  // An in-turn failure still ends with `final` (often empty) and no `error`
  // event; the turn_end reason is the failure signal.
  const kind = asString(get(reason, 'kind'))
  if (errorDetail === undefined && kind !== undefined && kind !== 'completed') {
    const code = asString(get(reason, 'error', 'code'))
    const message = asString(get(reason, 'error', 'message'))
    errorDetail =
      message === undefined
        ? `dsh turn ended: ${kind}`
        : code === undefined
          ? message
          : `${code}: ${message}`
  }
  if (errorDetail === undefined && kind === undefined) {
    errorDetail = 'dsh --json ended without a turn_end event'
  }

  return withStructured(planned, {
    // `final` is the lossless answer; `text` events are capped at 8 KiB.
    text: (text ?? lastText ?? '').trim(),
    sessionId,
    usage,
    stopReason: kind,
    events,
    isError: errorDetail !== undefined,
    errorDetail,
  })
}

function withStructured(planned: PlannedCall, parsed: ParsedOutput): ParsedOutput {
  if (planned.spec.output?.schema !== undefined && parsed.text !== '') {
    parsed.structured = tryParseJson(parsed.text)
  }
  return parsed
}

/** The last `dsh: ...` diagnostic on stderr, without its prefix. */
function lastDiagnostic(stderr: string): string | undefined {
  let found: string | undefined
  for (const line of stderr.split('\n')) {
    if (line.startsWith('dsh: ') && !line.startsWith('dsh: reasoning:')) {
      found = line.slice('dsh: '.length).trim()
    }
  }
  return found
}

/**
 * Usage arrives per step (`status` step_end), already summed over a step's
 * retried attempts; the run total is the sum over steps. Counts are disjoint
 * (input excludes cache reads, as claude's does), and the Messages output count
 * already includes thinking, so `reasoningTokens` is not added again.
 */
function addUsage(total: Usage | undefined, step: unknown): Usage | undefined {
  if (step === null || typeof step !== 'object') return total
  const sum = (a: number | undefined, b: number | undefined): number | undefined =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)
  return {
    inputTokens: sum(total?.inputTokens, asNumber(get(step, 'inputTokens'))),
    outputTokens: sum(total?.outputTokens, asNumber(get(step, 'outputTokens'))),
    cacheReadTokens: sum(total?.cacheReadTokens, asNumber(get(step, 'cacheReadTokens'))),
    cacheWriteTokens: sum(total?.cacheWriteTokens, asNumber(get(step, 'cacheWriteTokens'))),
    totalTokens: sum(total?.totalTokens, asNumber(get(step, 'totalTokens'))),
  }
}

/** Default-mode reasoning: each `dsh: reasoning:` heading opens a section on stderr. */
function stderrReasoning(stderr: string): string[] {
  const sections: string[] = []
  let current: string[] | undefined
  for (const line of stderr.split('\n')) {
    if (line === 'dsh: reasoning:') {
      if (current !== undefined) sections.push(current.join('\n'))
      current = []
    } else if (line.startsWith('dsh: ')) {
      if (current !== undefined) sections.push(current.join('\n'))
      current = undefined
    } else if (current !== undefined) {
      current.push(line)
    }
  }
  if (current !== undefined) sections.push(current.join('\n'))
  return sections.map((section) => section.trim()).filter((section) => section !== '')
}

function deepseekConversation(
  planned: PlannedCall,
  raw: RawProcessOutput,
): Conversation | undefined {
  const parsed = parseDeepseek(planned, raw)
  const messages: ConversationMessage[] = [
    { role: 'user', parts: [{ type: 'text', text: planned.stdin ?? '' }] },
  ]

  if (planned.outputFormat === 'text') {
    const parts: Part[] = stderrReasoning(raw.stderr).map((text) => ({ type: 'reasoning', text }))
    if (parsed.text !== '') parts.push({ type: 'text', text: parsed.text })
    if (parts.length > 0) messages.push({ role: 'assistant', parts })
  } else {
    // One assistant message per step (reasoning, text, tool calls), with the
    // step's tool results in a following tool message.
    let assistant: Part[] = []
    let results: Part[] = []
    let sawText = false
    const flush = (): void => {
      if (assistant.length > 0) messages.push({ role: 'assistant', parts: assistant })
      if (results.length > 0) messages.push({ role: 'tool', parts: results })
      assistant = []
      results = []
    }
    for (const event of parsed.events ?? []) {
      const type = get(event, 'type')
      if (type === 'thinking' || type === 'text') {
        const text = asString(get(event, 'text'))
        if (text === undefined) continue
        if (results.length > 0) flush()
        assistant.push({ type: type === 'thinking' ? 'reasoning' : 'text', text })
        if (type === 'text') sawText = true
      } else if (type === 'tool_call') {
        if (results.length > 0) flush()
        assistant.push({
          type: 'tool-call',
          callId: asString(get(event, 'callId')),
          name: asString(get(event, 'tool')) ?? 'unknown',
          input: get(event, 'input'),
        })
      } else if (type === 'tool_result') {
        results.push({
          type: 'tool-result',
          callId: asString(get(event, 'callId')),
          output: get(event, 'result'),
          isError: get(event, 'status') === 'error',
        })
      } else if (type === 'status' && get(event, 'phase') === 'step_end') {
        flush()
      }
    }
    flush()
    // No text event survived (none committed): still record the final answer.
    if (!sawText && parsed.text !== '') {
      messages.push({ role: 'assistant', parts: [{ type: 'text', text: parsed.text }] })
    }
  }

  return {
    schema: CONVERSATION_SCHEMA,
    agent: 'deepseek',
    sessionId: parsed.sessionId,
    messages,
    usage: parsed.usage,
    stopReason: parsed.isError === true ? 'error' : parsed.stopReason,
    raw: {
      format: planned.outputFormat === 'text' ? 'deepseek/text' : 'deepseek/json-events',
      data: (parsed.events?.length ?? 0) > 0 ? parsed.events : raw.stdout,
    },
  }
}
