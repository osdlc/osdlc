import type { Conversation } from '../conversation.js'
import { isBelowLow } from '../models.js'
import { note, TMP_TOKEN, type CapabilityNote, type PlannedCall, type TempFile } from '../plan.js'
import type { AgentCallSpec, OutputFormat } from '../spec.js'
import { claudeStyleConversation, parseClaudeStyle } from './claude-style.js'
import {
  applyPermissionMode,
  buildEffectivePrompt,
  modelFlag,
  commandPrefix,
  type CommandOptions,
} from './shared.js'
import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './types.js'

const MCP_CONFIG_FILE = 'mcp.json'
const SETTINGS_DEFAULTS_FILE = 'qwen-system-defaults.json'

/** Options for {@link qwenAdapter}. */
export interface QwenAdapterOptions extends CommandOptions {}

/**
 * Qwen Code (`qwen`). Runs headless whenever a prompt arrives, here on stdin,
 * with `--output-format text|json|stream-json` in Claude Code's result shape
 * (its `json` is the whole run as an array of events). System prompts,
 * approval modes, tool rules, extra directories, the output schema, sessions
 * and MCP config have flags. Effort has no flag and goes as
 * `model.reasoningEffort` in a temp settings file. `cwd` and `env` apply to
 * the process.
 */
export function qwenAdapter(options: QwenAdapterOptions = {}): AgentAdapter {
  const command = commandPrefix(options, 'qwen')
  const binary = command[0]!
  return {
    name: 'qwen',
    binary,
    command,
    plan(spec) {
      return planQwen(command, spec)
    },
    parseResult(planned, raw) {
      return parseQwen(planned, raw)
    },
    toConversation(planned, raw) {
      return qwenConversation(planned, raw)
    },
  }
}

function planQwen(command: readonly string[], spec: AgentCallSpec): PlannedCall {
  const notes: CapabilityNote[] = []
  const tempFiles: TempFile[] = []
  const env: Record<string, string> = { ...spec.env }
  const argv = [...command]

  // `json` is the run's event array, so it carries usage and the session id.
  const format: OutputFormat = spec.output?.format ?? 'json'
  argv.push('--output-format', format)

  if (spec.model !== undefined) argv.push(...modelFlag(spec.model))

  if (spec.effort !== undefined) {
    // No effort flag. model.reasoningEffort (low..max, the same levels) is a
    // setting, and the system-defaults file is the only settings file an env
    // var can point at. It sits below user and project settings.
    tempFiles.push({
      name: SETTINGS_DEFAULTS_FILE,
      content: JSON.stringify({
        model: { reasoningEffort: isBelowLow(spec.effort) ? 'low' : spec.effort },
      }),
    })
    env['QWEN_CODE_SYSTEM_DEFAULTS_PATH'] = `${TMP_TOKEN}/${SETTINGS_DEFAULTS_FILE}`
    note(
      notes,
      'effort',
      'approximated',
      'model.reasoningEffort via QWEN_CODE_SYSTEM_DEFAULTS_PATH (no flag; a reasoningEffort in user or project settings wins, and any system-defaults file is replaced for this run)' +
        (isBelowLow(spec.effort) ? '; none and minimal become low, the lowest level qwen has' : ''),
    )
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
    if (spec.mcp.strict === true) {
      for (const name of Object.keys(spec.mcp.servers)) {
        argv.push('--allowed-mcp-server-names', name)
      }
    }
  }

  if (spec.systemPrompt !== undefined) {
    argv.push('--system-prompt', spec.systemPrompt)
    note(notes, 'systemPrompt', 'native', '--system-prompt')
  }
  if (spec.appendSystemPrompt !== undefined) {
    argv.push('--append-system-prompt', spec.appendSystemPrompt)
    note(notes, 'appendSystemPrompt', 'native', '--append-system-prompt')
  }

  // Headless, a tool that needs approval is declined, never prompted for, so
  // every posture below is safe to run unattended.
  const permissions = spec.permissions
  applyPermissionMode(argv, notes, permissions?.mode, {
    'read-only': {
      argv: ['--approval-mode', 'plan'],
      support: 'approximated',
      detail: 'read-only mapped to --approval-mode plan (analysis only, no edits or commands)',
    },
    edits: {
      argv: ['--approval-mode', 'auto-edit'],
      support: 'native',
      detail: '--approval-mode auto-edit',
    },
    'full-auto': {
      argv: [
        '--approval-mode',
        'auto-edit',
        '--allowed-tools',
        'run_shell_command',
        '--allowed-tools',
        'web_fetch',
      ],
      support: 'approximated',
      detail:
        'full-auto mapped to auto-edit plus pre-approved run_shell_command/web_fetch (qwen sandboxes only through docker/podman, so commands are not workspace-scoped)',
    },
    bypass: {
      argv: ['--approval-mode', 'yolo'],
      support: 'native',
      detail: '--approval-mode yolo',
    },
  })
  // Array flags, repeated per value. One flag with several values would also
  // consume a positional argument that follows it.
  for (const tool of permissions?.allowTools ?? []) argv.push('--allowed-tools', tool)
  if ((permissions?.allowTools ?? []).length > 0) {
    note(notes, 'permissions.allowTools', 'native', '--allowed-tools')
  }
  for (const tool of permissions?.denyTools ?? []) argv.push('--exclude-tools', tool)
  if ((permissions?.denyTools ?? []).length > 0) {
    note(notes, 'permissions.denyTools', 'native', '--exclude-tools')
  }

  for (const dir of spec.context?.dirs ?? []) argv.push('--include-directories', dir)
  if ((spec.context?.dirs ?? []).length > 0) {
    note(notes, 'context.dirs', 'native', '--include-directories')
  }

  if (spec.output?.schema !== undefined) {
    argv.push('--json-schema', JSON.stringify(spec.output.schema))
    note(notes, 'output.schema', 'native', '--json-schema')
  }

  const session = spec.session
  if (session?.id !== undefined) {
    argv.push('--session-id', session.id)
    note(notes, 'session.id', 'native', '--session-id (qwen rejects an id that is not a UUID)')
  }
  // `--resume` alone opens a session picker, so the `=` form keeps an id that
  // starts with `-` attached to it.
  if (session?.resume !== undefined) {
    argv.push(`--resume=${session.resume}`)
    note(notes, 'session.resume', 'native', '--resume=<id>')
  } else if (session?.continueLast === true) {
    argv.push('--continue')
    note(notes, 'session.continueLast', 'native', '--continue')
  }
  if (session?.persist === false) {
    argv.push('--chat-recording', 'false')
    note(
      notes,
      'session.persist',
      'approximated',
      '--chat-recording false (no transcript; qwen may still write managed memory under ~/.qwen)',
    )
  }

  if (spec.plugins !== undefined) {
    note(notes, 'plugins', 'dropped', 'qwen has no session-only plugin flag')
  }
  if (spec.budgetUsd !== undefined) {
    note(
      notes,
      'budgetUsd',
      'dropped',
      'qwen has no dollar cap (only --max-session-turns / --max-tool-calls)',
    )
  }

  argv.push(...(spec.extraArgs ?? []))

  // qwen reads the prompt from stdin when no positional is given, and expands
  // @path references in it.
  const stdin = buildEffectivePrompt(
    spec,
    { filesAtSyntax: true, systemNative: true, appendSystemNative: true, schemaNative: true },
    notes,
  )

  return {
    agent: 'qwen',
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

function parseQwen(planned: PlannedCall, raw: RawProcessOutput): ParsedOutput {
  return parseClaudeStyle(planned, raw, { label: 'qwen --output-format' })
}

function qwenConversation(planned: PlannedCall, raw: RawProcessOutput): Conversation | undefined {
  return claudeStyleConversation('qwen', planned, raw, parseQwen(planned, raw))
}
