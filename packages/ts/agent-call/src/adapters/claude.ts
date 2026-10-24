import type { Conversation } from '../conversation.js'
import { isBelowLow } from '../models.js'
import { note, TMP_TOKEN, type CapabilityNote, type PlannedCall, type TempFile } from '../plan.js'
import type { AgentCallSpec, OutputFormat, PluginSpec } from '../spec.js'
import { claudeStyleConversation, parseClaudeStyle } from './claude-style.js'
import {
  applyPermissionMode,
  buildEffectivePrompt,
  commandPrefix,
  modelFlag,
  type CommandOptions,
} from './shared.js'
import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './types.js'

const MCP_CONFIG_FILE = 'mcp.json'

/** Options for {@link claudeAdapter}. */
export interface ClaudeAdapterOptions extends CommandOptions {}

/**
 * Claude Code (`claude -p`). It has flags for tool rules, system prompts,
 * structured output, sessions and budget. `read-only` and `full-auto` are
 * approximated.
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
 * `--resume=<id>`. `--resume` takes an optional value, so the `=` form keeps an
 * id that starts with `-` attached to the flag.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function claudeResumeFlag(id: string): string {
  return `--resume=${id}`
}

/** `--effort <level>`. Levels below `low` become `low`. Any other level passes through, so a new CLI level needs no change here. */
export function claudeEffortArgv(effort: string): string[] {
  return ['--effort', isBelowLow(effort) ? 'low' : effort]
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

  // Default to the JSON envelope when the caller asks for no format. It has
  // the same answer, plus usage, cost and session metadata.
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
    if (isBelowLow(spec.effort)) {
      note(notes, 'effort', 'approximated', '--effort low (claude has no level below low)')
    } else {
      note(notes, 'effort', 'native', '--effort')
    }
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
  return parseClaudeStyle(planned, raw, { label: 'claude --output-format' })
}

function claudeConversation(planned: PlannedCall, raw: RawProcessOutput): Conversation | undefined {
  return claudeStyleConversation('claude', planned, raw, parseClaude(planned, raw))
}
