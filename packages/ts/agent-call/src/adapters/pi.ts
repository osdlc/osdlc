import {
  CONVERSATION_SCHEMA,
  type Conversation,
  type ConversationMessage,
  type Part,
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
  commandPrefix,
  type CommandOptions,
  withStructured,
} from './shared.js'
import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './types.js'

/** Options for {@link piAdapter}. */
export interface PiAdapterOptions extends CommandOptions {}

const SYSTEM_PROMPT_FILE = 'system-prompt.md'
const APPEND_SYSTEM_PROMPT_FILE = 'append-system-prompt.md'

/** pi's read-only built-in tools (`grep`, `find` and `ls` are off by default). */
const READ_ONLY_TOOLS = ['read', 'grep', 'find', 'ls']
const EDIT_TOOLS = [...READ_ONLY_TOOLS, 'edit', 'write']
/** Every built-in but `powershell` (Windows only), as `+name` entries that add to the default selection. */
const ALL_TOOLS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'].map((t) => `+${t}`)

/**
 * pi coding agent (`pi`). Runs headless with `--mode json` (a JSONL event
 * stream, used for both json and stream-json) or `-p` for text. The prompt
 * travels on stdin. Effort (`--thinking`), both system prompts (read from
 * temp files), context files (`@path`), sessions and tool deny rules have
 * flags. pi never asks for approval: the permission posture is the set of
 * enabled tools.
 */
export function piAdapter(options: PiAdapterOptions = {}): AgentAdapter {
  const command = commandPrefix(options, 'pi')
  const binary = command[0]!
  return {
    name: 'pi',
    binary,
    command,
    plan(spec) {
      return planPi(command, spec)
    },
    parseResult(planned, raw) {
      return parsePi(planned, raw)
    },
    toConversation(planned, raw) {
      return piConversation(planned, raw)
    },
  }
}

/** `--thinking <level>`: pi takes `off` through `max`. `none` is pi's `off`; the rest pass through. */
export function piThinkingArgv(effort: string): string[] {
  return ['--thinking', effort === 'none' ? 'off' : effort]
}

function planPi(command: readonly string[], spec: AgentCallSpec): PlannedCall {
  const notes: CapabilityNote[] = []
  const tempFiles: TempFile[] = []
  const argv = [...command]

  // `--mode json` runs once and exits. `-p` prints the final answer as text.
  const format: OutputFormat = spec.output?.format ?? 'json'
  if (format !== 'text') {
    argv.push('--mode', 'json')
    if (format === 'json') {
      note(
        notes,
        'output.format',
        'approximated',
        'pi emits JSONL events; aggregated into a single result',
      )
    }
  } else {
    argv.push('-p')
  }

  if (spec.model !== undefined) argv.push(...modelFlag(spec.model))

  if (spec.effort !== undefined) {
    // pi takes off|minimal|low|medium|high|xhigh|max. `none` is its `off`, and the rest pass through.
    argv.push(...piThinkingArgv(spec.effort))
    note(notes, 'effort', 'native', '--thinking (pi clamps it to what the model supports)')
  }

  // Both flags take a file path or literal text, and read the file when it
  // exists. A temp file keeps the prompt out of argv and avoids that guess.
  if (spec.systemPrompt !== undefined) {
    tempFiles.push({ name: SYSTEM_PROMPT_FILE, content: spec.systemPrompt })
    argv.push('--system-prompt', `${TMP_TOKEN}/${SYSTEM_PROMPT_FILE}`)
    note(notes, 'systemPrompt', 'native', '--system-prompt <temp file>')
  }
  if (spec.appendSystemPrompt !== undefined) {
    tempFiles.push({ name: APPEND_SYSTEM_PROMPT_FILE, content: spec.appendSystemPrompt })
    argv.push('--append-system-prompt', `${TMP_TOKEN}/${APPEND_SYSTEM_PROMPT_FILE}`)
    note(notes, 'appendSystemPrompt', 'native', '--append-system-prompt <temp file>')
  }

  if (spec.mcp?.servers !== undefined) {
    note(
      notes,
      'mcp.servers',
      'dropped',
      'pi takes MCP servers from mcp.json (agent dir, or a trusted project .pi/), not a flag',
    )
  }

  // pi has no approval prompt, so a posture is a tool selection. `--tools`
  // takes one list (the last flag wins), so allowTools merge into it. Plain
  // names form an allowlist, and `+name` entries add to the default
  // selection. pi rejects a list that mixes the two, so each side is
  // normalized.
  const permissions = spec.permissions
  const allow = permissions?.allowTools ?? []
  const plus = (tools: string[]): string[] => tools.map((t) => (t.startsWith('+') ? t : `+${t}`))
  const plain = (tools: string[]): string[] => tools.map((t) => t.replace(/^\+/, ''))
  const toolsArgv = (tools: string[]): string[] => ['--tools', tools.join(',')]
  applyPermissionMode(argv, notes, permissions?.mode, {
    'read-only': {
      argv: toolsArgv([...READ_ONLY_TOOLS, ...plain(allow)]),
      support: 'approximated',
      detail: `read-only mapped to --tools ${READ_ONLY_TOOLS.join(',')} (no bash, edit or write; MCP tools stay enabled)`,
    },
    edits: {
      argv: toolsArgv([...EDIT_TOOLS, ...plain(allow)]),
      support: 'approximated',
      detail: `edits mapped to --tools ${EDIT_TOOLS.join(',')} (no bash; MCP tools stay enabled)`,
    },
    'full-auto': {
      argv: toolsArgv([...ALL_TOOLS, ...plus(allow)]),
      support: 'approximated',
      detail: `full-auto mapped to --tools ${ALL_TOOLS.join(',')} (pi never prompts and has no sandbox; commands are not scoped to the workspace)`,
    },
    bypass: {
      argv: toolsArgv([...ALL_TOOLS, ...plus(allow)]),
      support: 'native',
      detail: `--tools ${ALL_TOOLS.join(',')} (pi never prompts and has no sandbox)`,
    },
  })
  if (allow.length > 0) {
    if (permissions?.mode === undefined || permissions.mode === 'default') {
      argv.push(...toolsArgv(plus(allow)))
    }
    note(
      notes,
      'permissions.allowTools',
      'approximated',
      '--tools: the named pi tools are enabled, and pi runs every enabled tool without asking',
    )
  }
  if ((permissions?.denyTools ?? []).length > 0) {
    argv.push('--exclude-tools', (permissions?.denyTools ?? []).join(','))
    note(notes, 'permissions.denyTools', 'native', '--exclude-tools (pi tool names or * patterns)')
  }

  if ((spec.context?.dirs ?? []).length > 0) {
    note(
      notes,
      'context.dirs',
      'dropped',
      'pi has no add-dir flag; its tools are not scoped to the working directory',
    )
  }

  const session = spec.session
  const resuming = session?.resume !== undefined || session?.continueLast === true
  if (session?.resume !== undefined) {
    argv.push('--session', session.resume)
    note(notes, 'session.resume', 'native', '--session')
  } else if (session?.continueLast === true) {
    argv.push('--continue')
    note(notes, 'session.continueLast', 'native', '--continue')
  }
  if (session?.id !== undefined) {
    if (resuming) {
      note(notes, 'session.id', 'dropped', 'pi rejects --session-id with --session or --continue')
    } else {
      argv.push('--session-id', session.id)
      note(notes, 'session.id', 'native', '--session-id (opens the session if that id exists)')
    }
  }
  if (session?.persist === false) {
    if (resuming) {
      note(
        notes,
        'session.persist',
        'dropped',
        '--no-session would start a fresh session instead of resuming',
      )
    } else {
      argv.push('--no-session')
      note(notes, 'session.persist', 'native', '--no-session')
    }
  }
  if (spec.plugins !== undefined) {
    note(notes, 'plugins', 'dropped', 'pi has no session-only plugin flag')
  }
  if (spec.budgetUsd !== undefined) {
    note(notes, 'budgetUsd', 'dropped', 'pi has no budget cap flag')
  }

  // pi appends each `@path` file's text to the first prompt in a <file> block
  // (images attach). A missing file fails the run before the model is called.
  const files = spec.context?.files ?? []
  for (const file of files) argv.push(`@${file}`)
  if (files.length > 0) {
    note(notes, 'context.files', 'native', '@path arguments')
  }

  argv.push(...(spec.extraArgs ?? []))

  // Piped stdin becomes the first prompt (trimmed), so the prompt stays out
  // of argv. The schema has no flag and is emulated.
  const prompt = buildEffectivePrompt(
    spec,
    { filesNative: true, systemNative: true, appendSystemNative: true },
    notes,
  )

  return {
    agent: 'pi',
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

function parsePi(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  if (planned.outputFormat === 'text') {
    return withStructured(planned, { text: raw.stdout.trim() })
  }

  const events = parseJsonLines(raw.stdout)
  let sessionId: string | undefined
  let last: unknown
  let text = ''
  let retryError: string | undefined
  let aborted = false
  let costUsd: number | undefined
  const usage: Usage = {}
  let sawUsage = false

  for (const event of events) {
    const type = get(event, 'type')
    if (type === 'session') {
      sessionId = asString(get(event, 'id'))
    } else if (type === 'message_end' && get(event, 'message', 'role') === 'assistant') {
      // Each assistant message carries the usage of its own model call, so the
      // run's usage is the sum over messages, as claude's result envelope reports it.
      const message = get(event, 'message')
      last = message
      const messageText = assistantText(message)
      if (messageText !== '') text = messageText
      const messageUsage = get(message, 'usage')
      if (messageUsage !== null && typeof messageUsage === 'object') {
        sawUsage = true
        addUsage(usage, messageUsage)
        const cost = asNumber(get(messageUsage, 'cost', 'total'))
        if (cost !== undefined) costUsd = (costUsd ?? 0) + cost
      }
    } else if (type === 'auto_retry_end' && get(event, 'success') === false) {
      retryError = asString(get(event, 'finalError')) ?? 'pi gave up retrying'
    } else if (type === 'agent_settled' && get(event, 'aborted') === true) {
      aborted = true
    }
  }

  // `--mode json` exits 0 when the provider fails. The error is the stop reason
  // of the last assistant message. Startup failures (unknown model, missing
  // @file) exit 1 with no events and the reason on stderr.
  const stopReason = asString(get(last, 'stopReason'))
  const parsed: ParsedOutput = {
    text,
    sessionId,
    usage: sawUsage ? usage : undefined,
    costUsd,
    model: asString(get(last, 'responseModel')) ?? asString(get(last, 'model')),
    stopReason,
    events,
    isError: false,
  }
  if (last === undefined) {
    parsed.isError = true
    parsed.errorDetail = raw.stderr.trim() || 'pi --mode json ended without an assistant message'
  } else if (stopReason === 'error' || stopReason === 'aborted' || aborted || retryError) {
    parsed.isError = true
    parsed.errorDetail =
      retryError ?? asString(get(last, 'errorMessage')) ?? `pi stopped with ${stopReason}`
  }
  return withStructured(planned, parsed)
}

function assistantText(message: unknown): string {
  const content = get(message, 'content')
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => get(block, 'type') === 'text')
    .map((block) => asString(get(block, 'text')) ?? '')
    .join('')
    .trim()
}

/** pi's `input` excludes cache reads, as claude's does. `reasoning` is already counted in `output`. */
function addUsage(total: Usage, usage: unknown): void {
  const add = (key: keyof Usage, value: unknown): void => {
    const n = asNumber(value)
    if (n !== undefined) total[key] = (total[key] ?? 0) + n
  }
  add('inputTokens', get(usage, 'input'))
  add('outputTokens', get(usage, 'output'))
  add('cacheReadTokens', get(usage, 'cacheRead'))
  add('cacheWriteTokens', get(usage, 'cacheWrite'))
  add('totalTokens', get(usage, 'totalTokens'))
}

function piConversation(planned: PlannedCall, raw: RawProcessOutput): Conversation | undefined {
  const parsed = parsePi(planned, raw)
  const messages: ConversationMessage[] = []

  // message_end holds the final copy of each message. The leading system
  // message (prompt sections and tool declarations) stays in `raw` only.
  for (const event of parsed.events ?? []) {
    if (get(event, 'type') !== 'message_end') continue
    const message = get(event, 'message')
    const role = get(message, 'role')
    const ms = asNumber(get(message, 'timestamp'))
    const timestamp = ms === undefined ? undefined : new Date(ms).toISOString()
    const content = get(message, 'content')
    if (role === 'user') {
      const text =
        typeof content === 'string'
          ? content
          : (Array.isArray(content) ? content : [])
              .map((block) => asString(get(block, 'text')) ?? '')
              .join('')
      messages.push({ role: 'user', parts: [{ type: 'text', text }], timestamp })
    } else if (role === 'assistant') {
      const parts: Part[] = []
      for (const block of Array.isArray(content) ? content : []) {
        const blockType = get(block, 'type')
        if (blockType === 'text') {
          const text = asString(get(block, 'text'))
          if (text !== undefined && text !== '') parts.push({ type: 'text', text })
        } else if (blockType === 'thinking') {
          const text = asString(get(block, 'thinking'))
          if (text !== undefined && text !== '') parts.push({ type: 'reasoning', text })
        } else if (blockType === 'toolCall') {
          parts.push({
            type: 'tool-call',
            callId: asString(get(block, 'id')),
            name: asString(get(block, 'name')) ?? 'unknown',
            input: get(block, 'arguments'),
          })
        }
      }
      if (parts.length > 0) messages.push({ role: 'assistant', parts, timestamp })
    } else if (role === 'toolResult') {
      const blocks = Array.isArray(content) ? content : []
      const allText = blocks.every((block) => get(block, 'type') === 'text')
      messages.push({
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            callId: asString(get(message, 'toolCallId')),
            name: asString(get(message, 'toolName')),
            output: allText
              ? blocks.map((block) => asString(get(block, 'text')) ?? '').join('')
              : content,
            isError: get(message, 'isError') === true,
          },
        ],
        timestamp,
      })
    }
  }

  // No events (text format, or a startup failure): still record the exchange.
  if (messages.length === 0) {
    messages.push({ role: 'user', parts: [{ type: 'text', text: planned.stdin ?? '' }] })
    if (parsed.text !== '') {
      messages.push({ role: 'assistant', parts: [{ type: 'text', text: parsed.text }] })
    }
  }

  return {
    schema: CONVERSATION_SCHEMA,
    agent: 'pi',
    model: parsed.model,
    sessionId: parsed.sessionId,
    messages,
    usage: parsed.usage,
    costUsd: parsed.costUsd,
    stopReason: parsed.isError === true ? 'error' : parsed.stopReason,
    raw: {
      format: `pi/${planned.outputFormat === 'text' ? 'text' : 'jsonl'}`,
      data: (parsed.events?.length ?? 0) > 0 ? parsed.events : raw.stdout,
    },
  }
}
