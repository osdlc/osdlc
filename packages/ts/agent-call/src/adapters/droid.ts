import {
  CONVERSATION_SCHEMA,
  type Conversation,
  type ConversationMessage,
  type Part,
} from '../conversation.js'
import { note, TMP_TOKEN, type CapabilityNote, type PlannedCall, type TempFile } from '../plan.js'
import type { AgentCallSpec, OutputFormat } from '../spec.js'
import { claudeStyleConversation, claudeStyleUsage, parseClaudeStyle } from './claude-style.js'
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

const APPEND_SYSTEM_PROMPT_FILE = 'append-system-prompt.md'

/** Options for {@link droidAdapter}. */
export interface DroidAdapterOptions {
  /** Binary to spawn. Default: the CLI's own name. */
  binary?: string
}

/**
 * Factory Droid (`droid exec`). The prompt travels on stdin. Runs are
 * read-only unless `--auto low|medium|high` or `--skip-permissions-unsafe`
 * is given, so the canonical postures map onto those flags. Effort, appended
 * system prompts, session continuation (`-s`) and tool removal are native;
 * the system prompt, context files and the output schema are emulated in the
 * prompt. `--output-format json` prints a claude-style result envelope;
 * `stream-json` is droid's own event stream closed by a `completion` event.
 * BYOK models are addressed as `custom:<id>`; `model` passes through as given.
 */
export function droidAdapter(options: DroidAdapterOptions = {}): AgentAdapter {
  const binary = options.binary ?? 'droid'
  return {
    name: 'droid',
    binary,
    plan(spec) {
      return planDroid(binary, spec)
    },
    parseResult(planned, raw) {
      return parseDroid(planned, raw)
    },
    toConversation(planned, raw) {
      return droidConversation(planned, raw)
    },
  }
}

function planDroid(binary: string, spec: AgentCallSpec): PlannedCall {
  const notes: CapabilityNote[] = []
  const tempFiles: TempFile[] = []
  const argv = [binary, 'exec']

  // The json envelope carries usage and the session id; text is the CLI's
  // own default, so it is passed explicitly for every format.
  const format: OutputFormat = spec.output?.format ?? 'json'
  argv.push('--output-format', format)

  if (spec.model !== undefined) argv.push(...modelFlag(spec.model))

  if (spec.effort !== undefined) {
    // droid takes low..max; which levels a model accepts is per model
    // (`droid exec --help` lists them).
    argv.push('--reasoning-effort', spec.effort)
    note(notes, 'effort', 'native', '--reasoning-effort')
  }

  if (spec.mcp?.servers !== undefined) {
    // `--settings` overlays do not load mcpServers (checked on 0.244.0).
    note(
      notes,
      'mcp.servers',
      'dropped',
      'droid takes MCP servers from ~/.factory/mcp.json or .factory/mcp.json, not a flag',
    )
  }

  if (spec.appendSystemPrompt !== undefined) {
    // A file keeps the text out of the process list.
    tempFiles.push({ name: APPEND_SYSTEM_PROMPT_FILE, content: spec.appendSystemPrompt })
    argv.push('--append-system-prompt-file', `${TMP_TOKEN}/${APPEND_SYSTEM_PROMPT_FILE}`)
    note(notes, 'appendSystemPrompt', 'native', '--append-system-prompt-file <temp file>')
  }

  // Exec ignores the autonomy level in settings.json, so no flag is read-only.
  // A command above the granted level ends the run with an error instead of
  // prompting. --auto and --skip-permissions-unsafe cannot be combined; only
  // one is ever planned.
  const permissions = spec.permissions
  if (permissions?.mode === 'read-only') {
    note(
      notes,
      'permissions.mode',
      'native',
      'droid exec is read-only without --auto (file-mutating tools are withheld)',
    )
  }
  applyPermissionMode(argv, notes, permissions?.mode, {
    edits: {
      argv: ['--auto', 'low'],
      support: 'approximated',
      detail:
        'edits mapped to --auto low (file edits plus low-risk commands such as mkdir, mv, cp)',
    },
    'full-auto': {
      argv: ['--auto', 'medium'],
      support: 'approximated',
      detail:
        'full-auto mapped to --auto medium (builds, package installs, local git; no push or sudo; droid has no workspace sandbox)',
    },
    bypass: {
      argv: ['--skip-permissions-unsafe'],
      support: 'native',
      detail: '--skip-permissions-unsafe',
    },
  })
  if (permissions?.allowTools !== undefined && permissions.allowTools.length > 0) {
    argv.push('--add-tools', permissions.allowTools.join(','))
    note(
      notes,
      'permissions.allowTools',
      'approximated',
      '--add-tools (droid tool ids such as Create or MCP:<server>, not patterns; enables the tool, shell commands stay gated by --auto)',
    )
  }
  if (permissions?.denyTools !== undefined && permissions.denyTools.length > 0) {
    argv.push('--remove-tools', permissions.denyTools.join(','))
    note(
      notes,
      'permissions.denyTools',
      'approximated',
      '--remove-tools (droid tool ids, not patterns; an unknown id fails the run)',
    )
  }

  if ((spec.context?.dirs ?? []).length > 0) {
    note(notes, 'context.dirs', 'dropped', 'droid documents no extra-directory flag')
  }

  const session = spec.session
  if (session?.resume !== undefined) {
    argv.push('--session-id', session.resume)
    note(notes, 'session.resume', 'native', '--session-id')
  } else if (session?.id !== undefined) {
    // `-s` with an unknown id starts a new session under that id.
    argv.push('--session-id', session.id)
    note(
      notes,
      'session.id',
      'approximated',
      '--session-id (starts a session under this id, or continues it if it already exists)',
    )
  }
  if (session?.resume !== undefined && session.id !== undefined) {
    note(notes, 'session.id', 'dropped', 'droid takes one --session-id; session.resume wins')
  }
  if (session?.continueLast === true && session.resume === undefined) {
    note(
      notes,
      'session.continueLast',
      'dropped',
      'droid exec has no continue-last flag; resume by id instead',
    )
  }
  if (session?.persist === false) {
    note(notes, 'session.persist', 'dropped', 'droid always writes sessions to ~/.factory/sessions')
  }
  if (spec.plugins !== undefined) {
    note(notes, 'plugins', 'dropped', 'droid has no session-only plugin flag')
  }
  if (spec.budgetUsd !== undefined) {
    note(notes, 'budgetUsd', 'dropped', 'droid has no budget cap flag')
  }

  argv.push(...(spec.extraArgs ?? []))

  // droid exec reads the prompt from stdin when no positional prompt is
  // given, which keeps it out of the process list.
  const stdin = buildEffectivePrompt(spec, { appendSystemNative: true }, notes)

  return {
    agent: 'droid',
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

function parseDroid(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  if (planned.outputFormat === 'stream-json') return parseDroidStream(planned, raw)
  return parseClaudeStyle(planned, raw, { label: 'droid --output-format' })
}

/**
 * droid's stream: `system`/`init` (model, tools), `message` (user and
 * assistant text), `reasoning`, `tool_call`, `tool_result`, `error`, and a
 * closing `completion` with the final text, session id and usage. A failed
 * run ends with an `error` event (`source: "cli"`) and no `completion`.
 */
function parseDroidStream(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  const events = parseJsonLines(raw.stdout)
  let model: string | undefined
  let sessionId: string | undefined
  let completion: unknown
  let lastError: string | undefined
  const assistantText: string[] = []

  for (const event of events) {
    const type = get(event, 'type')
    sessionId = asString(get(event, 'session_id')) ?? sessionId
    if (type === 'system' && get(event, 'subtype') === 'init') {
      model = asString(get(event, 'model'))
    } else if (type === 'message' && get(event, 'role') === 'assistant') {
      const text = asString(get(event, 'text'))
      if (text !== undefined) assistantText.push(text)
    } else if (type === 'error') {
      lastError = asString(get(event, 'message')) ?? 'droid reported an error'
    } else if (type === 'completion') {
      completion = event
    }
  }

  if (completion === undefined) {
    return {
      text: assistantText.join('\n').trim(),
      sessionId,
      model,
      events,
      isError: true,
      errorDetail: lastError ?? 'droid stream-json ended without a completion event',
    }
  }

  const text = asString(get(completion, 'finalText')) ?? assistantText.join('\n').trim()
  const parsed: ParsedOutput = {
    text,
    sessionId: asString(get(completion, 'session_id')) ?? sessionId,
    usage: claudeStyleUsage(get(completion, 'usage')),
    model,
    events,
    isError: false,
  }
  if (planned.spec.output?.schema !== undefined) parsed.structured = tryParseJson(text)
  return parsed
}

function droidConversation(planned: PlannedCall, raw: RawProcessOutput): Conversation | undefined {
  const parsed = parseDroid(planned, raw)
  if (planned.outputFormat !== 'stream-json') {
    return claudeStyleConversation('droid', planned, raw, parsed)
  }

  const messages: ConversationMessage[] = [
    { role: 'user', parts: [{ type: 'text', text: planned.stdin ?? '' }] },
  ]
  let completion: unknown
  for (const event of parsed.events ?? []) {
    const type = get(event, 'type')
    const timestamp = isoTimestamp(get(event, 'timestamp'))
    let message: ConversationMessage | undefined
    if (type === 'message' && get(event, 'role') === 'assistant') {
      const text = asString(get(event, 'text'))
      if (text !== undefined) message = { role: 'assistant', parts: [{ type: 'text', text }] }
    } else if (type === 'reasoning') {
      const text = asString(get(event, 'text'))
      if (text !== undefined) message = { role: 'assistant', parts: [{ type: 'reasoning', text }] }
    } else if (type === 'tool_call') {
      message = {
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            callId: asString(get(event, 'id')),
            name: asString(get(event, 'toolName')) ?? asString(get(event, 'toolId')) ?? 'unknown',
            input: get(event, 'parameters'),
          },
        ],
      }
    } else if (type === 'tool_result') {
      const isError = get(event, 'isError') === true
      const part: Part = {
        type: 'tool-result',
        callId: asString(get(event, 'id')),
        name: asString(get(event, 'toolId')),
        output: isError ? get(event, 'error', 'message') : get(event, 'value'),
        isError,
      }
      message = { role: 'tool', parts: [part] }
    } else if (type === 'completion') {
      completion = event
    }
    if (message !== undefined) {
      if (timestamp !== undefined) message.timestamp = timestamp
      messages.push(message)
    }
  }

  return {
    schema: CONVERSATION_SCHEMA,
    agent: 'droid',
    model: parsed.model,
    sessionId: parsed.sessionId,
    messages,
    usage: parsed.usage,
    durationMs: asNumber(get(completion, 'durationMs')),
    stopReason: parsed.isError === true ? 'error' : undefined,
    raw: { format: 'droid/stream-json', data: parsed.events },
  }
}

/** droid stamps events in epoch milliseconds. */
function isoTimestamp(value: unknown): string | undefined {
  const ms = asNumber(value)
  return ms === undefined ? undefined : new Date(ms).toISOString()
}
