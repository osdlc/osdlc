import {
  CONVERSATION_SCHEMA,
  type Conversation,
  type ConversationMessage,
  type Part,
  type Usage,
} from '../conversation.js'
import { note, TMP_TOKEN, type CapabilityNote, type PlannedCall, type TempFile } from '../plan.js'
import type { AgentCallSpec, OutputFormat } from '../spec.js'
import { parseClaudeStyle } from './claude-style.js'
import {
  applyPermissionMode,
  asNumber,
  asString,
  buildEffectivePrompt,
  get,
  modelFlag,
  tryParseJson,
} from './shared.js'
import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './types.js'

/** Plugin manifest and MCP config written to the per-call temp dir, loaded with `--plugin-dir`. */
const PLUGIN_MANIFEST_FILE = 'plugin.json'
const MCP_CONFIG_FILE = 'mcp.json'
const PLUGIN_NAME = 'agent-call'

/** Options for {@link cursorAdapter}. */
export interface CursorAdapterOptions {
  /** Binary to spawn. Default: the CLI's own name. */
  binary?: string
  /**
   * Pass `--trust`, which permanently marks the working directory (and each
   * `context.dirs` entry) trusted under `~/.cursor/projects/`, for later
   * interactive sessions too. Default: false, so a headless call in a
   * workspace Cursor does not trust yet fails with the CLI's own error.
   */
  trustWorkspace?: boolean
}

/**
 * Cursor Agent CLI (`agent -p`). The install script links both `agent` and
 * the older `cursor-agent`; `--help` and the CLI's own error messages name
 * `agent`, so that is the default. The prompt travels on stdin (read when no
 * prompt argument is given), `--output-format text|json|stream-json` prints
 * a claude-style result envelope or event stream. A headless run in a
 * workspace Cursor does not trust exits 1 instead of asking; pass
 * `trustWorkspace: true` to trust it (persistently) with `--trust`. The CLI has no effort, system-prompt or schema flag; system prompts
 * and the schema are emulated. Verified against agent 2026.08.11-e8db854
 * driven by a fake Cursor backend (`--endpoint`), not a live account.
 */
export function cursorAdapter(options: CursorAdapterOptions = {}): AgentAdapter {
  const binary = options.binary ?? 'agent'
  return {
    name: 'cursor',
    binary,
    plan(spec) {
      return planCursor(binary, options.trustWorkspace === true, spec)
    },
    parseResult(planned, raw) {
      return parseCursor(planned, raw)
    },
    toConversation(planned, raw) {
      return cursorConversation(planned, raw)
    },
  }
}

function planCursor(binary: string, trust: boolean, spec: AgentCallSpec): PlannedCall {
  const notes: CapabilityNote[] = []
  const tempFiles: TempFile[] = []
  // --trust marks the workspace trusted (a lasting marker under
  // ~/.cursor/projects/) instead of exiting with "Workspace Trust Required".
  // It approves nothing else: commands and MCP servers keep their own gates.
  // Opt-in, since the trust outlives the call.
  const argv = [binary, '-p']
  if (trust) argv.push('--trust')

  // Explicit even for text: the documented default has changed between releases.
  const format: OutputFormat = spec.output?.format ?? 'json'
  argv.push('--output-format', format)

  if (spec.model !== undefined) argv.push(...modelFlag(spec.model))

  if (spec.effort !== undefined) {
    note(
      notes,
      'effort',
      'dropped',
      "cursor has no effort flag; parameterized models take it in the slug (--model 'name[effort=high]')",
    )
  }

  if (spec.mcp?.servers !== undefined) {
    // MCP servers come from mcp.json files only. A plugin directory may carry
    // one, so the servers go in a session-only plugin in the temp dir: their
    // `env` stays off argv, and plugin servers start without --approve-mcps
    // (which would also approve every project server).
    tempFiles.push(
      { name: PLUGIN_MANIFEST_FILE, content: JSON.stringify({ name: PLUGIN_NAME }) },
      { name: MCP_CONFIG_FILE, content: JSON.stringify({ mcpServers: spec.mcp.servers }) },
    )
    argv.push('--plugin-dir', TMP_TOKEN)
    note(
      notes,
      'mcp.servers',
      'approximated',
      '--plugin-dir with a temp plugin holding mcp.json; user and project mcp.json servers still load',
    )
  }

  if (spec.plugins !== undefined) {
    for (const dir of spec.plugins.dirs) argv.push('--plugin-dir', dir)
    if (spec.plugins.disable.length > 0) {
      note(
        notes,
        'plugins',
        'approximated',
        '--plugin-dir loads the dirs; cursor has no flag to disable an installed plugin',
      )
    } else {
      note(notes, 'plugins', 'native', '--plugin-dir')
    }
  }

  const permissions = spec.permissions
  // Observed headless postures: with no flag, file writes apply and shell
  // commands come back `rejected` (nothing waits on a prompt). --sandbox
  // enabled auto-runs commands in a workspace-write sandbox without network;
  // --force runs them unsandboxed.
  applyPermissionMode(argv, notes, permissions?.mode, {
    'read-only': {
      argv: ['--mode', 'ask'],
      support: 'approximated',
      detail:
        'read-only mapped to --mode ask (Q&A mode; the backend withholds edit tools, the CLI itself does not block writes)',
    },
    edits: {
      argv: [],
      support: 'native',
      detail: 'no flag: print mode applies file writes and rejects shell commands',
    },
    'full-auto': {
      argv: ['--sandbox', 'enabled'],
      support: 'native',
      detail: '--sandbox enabled (commands auto-run in a workspace-write sandbox, no network)',
    },
    bypass: {
      argv: ['--force', '--sandbox', 'disabled'],
      support: 'native',
      detail: '--force --sandbox disabled',
    },
  })
  if ((permissions?.allowTools ?? []).length > 0) {
    note(
      notes,
      'permissions.allowTools',
      'dropped',
      'no public flag; configure permissions.allow in ~/.cursor/cli-config.json or .cursor/cli.json',
    )
  }
  if ((permissions?.denyTools ?? []).length > 0) {
    note(
      notes,
      'permissions.denyTools',
      'dropped',
      'no public flag; configure permissions.deny in ~/.cursor/cli-config.json or .cursor/cli.json',
    )
  }

  for (const dir of spec.context?.dirs ?? []) {
    argv.push('--add-dir', dir)
  }
  if ((spec.context?.dirs ?? []).length > 0) {
    note(notes, 'context.dirs', 'native', '--add-dir')
  }

  const session = spec.session
  if (session?.resume !== undefined) {
    // `--resume` takes an optional value; the `=` form keeps the id bound to it.
    // An unknown id is not an error: the CLI starts a new chat under that id.
    argv.push(`--resume=${session.resume}`)
    note(notes, 'session.resume', 'native', '--resume=<id>')
  } else if (session?.continueLast === true) {
    argv.push('--continue')
    note(notes, 'session.continueLast', 'native', '--continue')
  }
  if (session?.id !== undefined) {
    argv.push('--new-session-id', session.id)
    note(
      notes,
      'session.id',
      'approximated',
      '--new-session-id (hidden from --help; the CLI rejects an id that is not a UUIDv4)',
    )
  }
  if (session?.persist === false) {
    note(notes, 'session.persist', 'dropped', 'cursor always writes chats under ~/.cursor')
  }
  if (spec.budgetUsd !== undefined) {
    note(notes, 'budgetUsd', 'dropped', 'cursor has no budget cap flag')
  }

  argv.push(...(spec.extraArgs ?? []))

  // No prompt argument, so the CLI reads the prompt from stdin (it trims it).
  // The CLI's --system-prompt is internal-only, so both system prompts are
  // emulated, as is the schema.
  const stdin = buildEffectivePrompt(spec, {}, notes)

  return {
    agent: 'cursor',
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

function parseCursor(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  const parsed = parseClaudeStyle(planned, raw, { label: 'agent --output-format' })
  if (planned.outputFormat !== 'text') {
    const envelope =
      planned.outputFormat === 'json'
        ? tryParseJson(raw.stdout)
        : [...(parsed.events ?? [])].reverse().find((e) => get(e, 'type') === 'result')
    parsed.usage = cursorUsage(get(envelope, 'usage'))
  }
  // A failed run prints no result at all: the reason is on stderr (exit 1).
  if (parsed.isError === true && parsed.text === '') {
    const reason = lastLine(raw.stderr)
    if (reason !== undefined) parsed.errorDetail = reason
  }
  return parsed
}

function lastLine(text: string): string | undefined {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
  return lines[lines.length - 1]
}

/**
 * cursor's usage is camelCase. Its `inputTokens` already has cache reads and
 * writes taken out (the CLI subtracts them), as claude's `input_tokens` does.
 */
function cursorUsage(usage: unknown): Usage | undefined {
  if (usage === null || typeof usage !== 'object') return undefined
  return {
    inputTokens: asNumber(get(usage, 'inputTokens')),
    outputTokens: asNumber(get(usage, 'outputTokens')),
    cacheReadTokens: asNumber(get(usage, 'cacheReadTokens')),
    cacheWriteTokens: asNumber(get(usage, 'cacheWriteTokens')),
  }
}

/**
 * The stream's tool events carry the CLI's protobuf ToolCall as JSON: one
 * key such as `shellToolCall` or `editToolCall` holding `args` and, once
 * completed, `result` (`success`, or `rejected`, `spawnError`, ...).
 */
function toolPayload(event: unknown): { name: string; body: unknown } {
  const call = get(event, 'tool_call')
  if (call !== null && typeof call === 'object') {
    for (const [key, body] of Object.entries(call)) {
      if (key.endsWith('ToolCall')) return { name: key.slice(0, -'ToolCall'.length), body }
    }
  }
  return { name: 'unknown', body: undefined }
}

function cursorConversation(planned: PlannedCall, raw: RawProcessOutput): Conversation {
  const parsed = parseCursor(planned, raw)
  const messages: ConversationMessage[] = [
    { role: 'user', parts: [{ type: 'text', text: planned.stdin ?? '' }] },
  ]

  if (planned.outputFormat === 'stream-json') {
    let thinking = ''
    for (const event of parsed.events ?? []) {
      const type = get(event, 'type')
      const subtype = get(event, 'subtype')
      if (type === 'thinking') {
        // Deltas, then a `completed` marker that carries no text.
        if (subtype === 'delta') thinking += asString(get(event, 'text')) ?? ''
        else if (subtype === 'completed' && thinking !== '') {
          messages.push({ role: 'assistant', parts: [{ type: 'reasoning', text: thinking }] })
          thinking = ''
        }
      } else if (type === 'assistant') {
        const parts: Part[] = []
        const content = get(event, 'message', 'content')
        for (const block of Array.isArray(content) ? content : []) {
          const text = asString(get(block, 'text'))
          if (get(block, 'type') === 'text' && text !== undefined && text !== '') {
            parts.push({ type: 'text', text })
          }
        }
        if (parts.length > 0) messages.push({ role: 'assistant', parts })
      } else if (type === 'tool_call') {
        const callId = asString(get(event, 'call_id'))
        const { name, body } = toolPayload(event)
        if (subtype === 'started') {
          messages.push({
            role: 'assistant',
            parts: [{ type: 'tool-call', callId, name, input: get(body, 'args') }],
          })
        } else if (subtype === 'completed') {
          const output = get(body, 'result')
          messages.push({
            role: 'tool',
            parts: [
              {
                type: 'tool-result',
                callId,
                name,
                output,
                isError: output !== undefined && get(output, 'success') === undefined,
              },
            ],
          })
        }
      }
      // `user` echoes the prompt; system, retry and connection events carry no message.
    }
  } else if (parsed.text !== '') {
    messages.push({ role: 'assistant', parts: [{ type: 'text', text: parsed.text }] })
  }

  return {
    schema: CONVERSATION_SCHEMA,
    agent: 'cursor',
    model: parsed.model,
    sessionId: parsed.sessionId,
    messages,
    usage: parsed.usage,
    stopReason: parsed.isError === true ? 'error' : parsed.stopReason,
    raw: {
      format: `cursor/${planned.outputFormat}`,
      data: parsed.events ?? tryParseJson(raw.stdout) ?? raw.stdout,
    },
  }
}
