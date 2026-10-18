import {
  CONVERSATION_SCHEMA,
  type Conversation,
  type ConversationMessage,
  type Part,
} from '../conversation.js'
import { note, type CapabilityNote, type PlannedCall } from '../plan.js'
import type { AgentCallSpec, OutputFormat, PermissionMode } from '../spec.js'
import {
  asString,
  buildEffectivePrompt,
  commandPrefix,
  get,
  parseJsonLines,
  tryParseJson,
} from './shared.js'
import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './types.js'

/** Options for {@link opencodeAdapter}. */
export interface OpencodeAdapterOptions {
  /** Binary to spawn. Default: the CLI's own name. */
  binary?: string
  /**
   * The command to run, as argv: the binary and any arguments that must come
   * before the adapter's own, such as `['npx', '-y', '@anthropic-ai/claude-code']`
   * or `['codex', '--profile', 'work']`. It replaces `binary` when it has at
   * least one element; an empty array is ignored. `planned.argv` starts with
   * it, and `detectAgents` runs it with `--version` appended.
   */
  command?: readonly string[] | undefined
}

/**
 * opencode (`opencode run`). Context files attach natively (`-f`);
 * permissions travel via the OPENCODE_PERMISSION env JSON; `--format json`
 * is a raw event stream backing both json and stream-json requests.
 */
export function opencodeAdapter(options: OpencodeAdapterOptions = {}): AgentAdapter {
  const command = commandPrefix(options, 'opencode')
  const binary = command[0]!
  return {
    name: 'opencode',
    binary,
    command,
    plan(spec) {
      return planOpencode(command, spec)
    },
    parseResult(planned, raw) {
      return parseOpencode(planned, raw)
    },
    toConversation(planned, raw) {
      return opencodeConversation(planned, raw)
    },
  }
}

const PERMISSION_ENV: Record<Exclude<PermissionMode, 'default'>, Record<string, string>> = {
  'read-only': { edit: 'deny', bash: 'deny', webfetch: 'allow' },
  edits: { edit: 'allow', bash: 'deny', webfetch: 'allow' },
  'full-auto': { edit: 'allow', bash: 'allow', webfetch: 'allow' },
  bypass: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
}

function planOpencode(command: readonly string[], spec: AgentCallSpec): PlannedCall {
  const notes: CapabilityNote[] = []
  const env: Record<string, string> = { ...spec.env }
  const argv = [...command, 'run']

  const format: OutputFormat = spec.output?.format ?? 'json'
  if (format !== 'text') {
    argv.push('--format', 'json')
    if (format === 'json') {
      note(
        notes,
        'output.format',
        'approximated',
        'opencode emits raw JSON events; aggregated into a single result',
      )
    }
  }

  if (spec.model !== undefined) {
    argv.push('--model', spec.model)
    if (!spec.model.includes('/')) {
      note(
        notes,
        'model',
        'approximated',
        'opencode expects "provider/model"; passed through as given',
      )
    }
  }

  if (spec.effort !== undefined) {
    argv.push('--variant', spec.effort)
    note(
      notes,
      'effort',
      'approximated',
      '--variant (provider-specific reasoning effort; values depend on the model)',
    )
  }
  if (spec.mcp?.servers !== undefined) {
    note(
      notes,
      'mcp.servers',
      'dropped',
      'opencode takes MCP servers from opencode.json, not a flag',
    )
  }

  const permissions = spec.permissions
  if (permissions?.mode !== undefined && permissions.mode !== 'default') {
    env['OPENCODE_PERMISSION'] = JSON.stringify(PERMISSION_ENV[permissions.mode])
    note(
      notes,
      'permissions.mode',
      'approximated',
      `mapped to OPENCODE_PERMISSION=${env['OPENCODE_PERMISSION']} ("ask" would hang a headless run, so gated tools are denied)`,
    )
  }
  if ((permissions?.allowTools ?? []).length > 0) {
    note(
      notes,
      'permissions.allowTools',
      'dropped',
      'no CLI flag; use permission patterns in opencode.json',
    )
  }
  if ((permissions?.denyTools ?? []).length > 0) {
    note(
      notes,
      'permissions.denyTools',
      'dropped',
      'no CLI flag; use permission patterns in opencode.json',
    )
  }

  for (const file of spec.context?.files ?? []) {
    argv.push('--file', file)
  }
  if ((spec.context?.files ?? []).length > 0) {
    note(notes, 'context.files', 'native', '--file attachments')
  }
  if ((spec.context?.dirs ?? []).length > 0) {
    note(
      notes,
      'context.dirs',
      'dropped',
      'opencode scopes to its working directory; no add-dir flag',
    )
  }

  const session = spec.session
  if (session?.resume !== undefined) {
    argv.push('--session', session.resume)
    note(notes, 'session.resume', 'native', '--session')
  } else if (session?.continueLast === true) {
    argv.push('--continue')
    note(notes, 'session.continueLast', 'native', '--continue')
  }
  if (session?.id !== undefined) {
    note(notes, 'session.id', 'dropped', 'opencode assigns session ids itself')
  }
  if (session?.persist === false) {
    note(notes, 'session.persist', 'dropped', 'opencode always persists sessions')
  }
  if (spec.plugins !== undefined) {
    note(notes, 'plugins', 'dropped', 'session-only plugins are claude only')
  }
  if (spec.budgetUsd !== undefined) {
    note(notes, 'budgetUsd', 'dropped', 'opencode has no budget cap flag')
  }

  argv.push(...(spec.extraArgs ?? []))

  const prompt = buildEffectivePrompt(spec, { filesNative: true }, notes)
  argv.push(prompt)

  return {
    agent: 'opencode',
    argv,
    env,
    cwd: spec.cwd,
    prompt,
    outputFormat: format,
    tempFiles: [],
    notes,
    spec,
  }
}

function parseOpencode(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  if (planned.outputFormat === 'text') {
    const parsed: ParsedOutput = { text: raw.stdout.trim() }
    if (planned.spec.output?.schema !== undefined) {
      parsed.structured = tryParseJson(parsed.text)
    }
    return parsed
  }

  const events = parseJsonLines(raw.stdout)
  const textByPart = new Map<string, string>()
  let sessionId: string | undefined
  let errorDetail: string | undefined
  let order = 0

  for (const event of events) {
    // Both shapes seen in the wild: a bare part object, or an event wrapping
    // one at `properties.part` / `part`.
    const part = get(event, 'properties', 'part') ?? get(event, 'part') ?? event
    const partType = get(part, 'type')
    if (partType === 'text') {
      const text = asString(get(part, 'text'))
      const id = asString(get(part, 'id')) ?? `#${order++}`
      if (text !== undefined) textByPart.set(id, text)
      sessionId = asString(get(part, 'sessionID')) ?? asString(get(part, 'sessionId')) ?? sessionId
    } else if (partType === 'error' || get(event, 'type') === 'error') {
      errorDetail =
        asString(get(part, 'message')) ??
        asString(get(event, 'properties', 'message')) ??
        'opencode reported an error'
    }
  }

  const text = [...textByPart.values()].join('\n').trim()
  const parsed: ParsedOutput = {
    text,
    sessionId,
    events,
    isError: errorDetail !== undefined,
    errorDetail,
  }
  if (planned.spec.output?.schema !== undefined && text !== '') {
    parsed.structured = tryParseJson(text)
  }
  return parsed
}

function opencodeConversation(
  planned: PlannedCall,
  raw: RawProcessOutput,
): Conversation | undefined {
  const parsed = parseOpencode(planned, raw)
  const prompt = planned.prompt ?? ''
  const messages: ConversationMessage[] = [
    { role: 'user', parts: [{ type: 'text', text: prompt }] },
  ]

  const assistantParts: Part[] = []
  for (const event of parsed.events ?? []) {
    const part = get(event, 'properties', 'part') ?? get(event, 'part') ?? event
    const partType = get(part, 'type')
    if (partType === 'tool') {
      assistantParts.push({
        type: 'tool-call',
        callId: asString(get(part, 'callID')) ?? asString(get(part, 'id')),
        name: asString(get(part, 'tool')) ?? 'unknown',
        input: get(part, 'state', 'input'),
      })
      const output = get(part, 'state', 'output')
      if (output !== undefined) {
        assistantParts.push({
          type: 'tool-result',
          callId: asString(get(part, 'callID')) ?? asString(get(part, 'id')),
          name: asString(get(part, 'tool')) ?? undefined,
          output,
          isError: get(part, 'state', 'status') === 'error',
        })
      }
    } else if (partType === 'reasoning') {
      const text = asString(get(part, 'text'))
      if (text !== undefined) assistantParts.push({ type: 'reasoning', text })
    }
  }
  if (parsed.text !== '') {
    assistantParts.push({ type: 'text', text: parsed.text })
  }
  if (assistantParts.length > 0) {
    messages.push({ role: 'assistant', parts: assistantParts })
  }

  return {
    schema: CONVERSATION_SCHEMA,
    agent: 'opencode',
    sessionId: parsed.sessionId,
    messages,
    stopReason: parsed.isError === true ? 'error' : undefined,
    raw: {
      format: 'opencode/json-events',
      data: (parsed.events?.length ?? 0) > 0 ? parsed.events : raw.stdout,
    },
  }
}
