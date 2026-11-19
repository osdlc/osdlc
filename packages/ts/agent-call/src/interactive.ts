/**
 * The interactive command line of each CLI: the bare CLI with a first
 * message, for a session a person sits in. The headless adapters
 * (`claude -p`, `codex exec`) plan a call whose output a program reads; this is
 * the other mode, kept here so one package knows every flag of each CLI.
 */

import { claudePluginArgv, claudeResumeFlag } from './adapters/claude.js'
import { modelArgs, type ModelChoice } from './model-args.js'
import type { PluginSpec } from './spec.js'

/**
 * Session flags only `claude` takes; a caller can store them to resume with the same flags.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export interface ClaudeSessionFlags {
  /** Text for `claude --append-system-prompt`. */
  appendSystemPrompt?: string | undefined
  /** Session-only plugins (`claude --plugin-dir` / `--settings`). */
  plugins?: PluginSpec | undefined
  /**
   * The shell command Claude's hooks run; set, it adds the hook settings of
   * {@link claudeHookSettings} to every launch and resume, since `--settings`
   * is not persisted with the session.
   */
  hookCommand?: string | undefined
}

/**
 * {@link ClaudeSessionFlags} plus what only a fresh launch passes: the session id to preset.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export interface ClaudeLaunchFlags extends ClaudeSessionFlags {
  /** The session id to preset (`claude --session-id`). Never with a resume. */
  harnessSessionId?: string | undefined
}

/** How one Claude hook event is subscribed. */
interface ClaudeHookSpec {
  /** Runs `async`; false only where the hook must finish its write before Claude exits. */
  async: boolean
  /** Claude's tool-name matcher; without one the hook runs for every occurrence of the event. */
  matcher?: string
}

/**
 * The Claude Code hook events a launch subscribes to. Everything is async except
 * `SessionEnd`, which has to finish its write before Claude exits (its budget
 * is the hook's own `timeout`). `PreToolUse` is matched to `AskUserQuestion`
 * alone: the question is what puts the agent in `waiting_for_input` there, and
 * a hook on every tool call would cost a process each. `PermissionRequest` and
 * `StopFailure` mark a tool-permission prompt and a turn that ended on an API error.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export const CLAUDE_HOOK_EVENTS = {
  SessionStart: { async: true },
  UserPromptSubmit: { async: true },
  PreToolUse: { async: true, matcher: 'AskUserQuestion' },
  PermissionRequest: { async: true },
  PostToolUse: { async: true },
  PostToolUseFailure: { async: true },
  Stop: { async: true },
  StopFailure: { async: true },
  SubagentStart: { async: true },
  SubagentStop: { async: true },
  Notification: { async: true },
  PreCompact: { async: true },
  PostModelSwitch: { async: true },
  SessionEnd: { async: false },
} as const satisfies Record<string, ClaudeHookSpec>

/** Seconds `SessionEnd`'s hook may run; Claude's default budget for it is 1.5s. */
const SESSION_END_HOOK_TIMEOUT_S = 10

/**
 * The `hooks` settings object that runs `command` for every {@link CLAUDE_HOOK_EVENTS} event.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function claudeHookSettings(command: string): { hooks: Record<string, unknown[]> } {
  const hooks: Record<string, unknown[]> = {}
  for (const [name, spec] of Object.entries(CLAUDE_HOOK_EVENTS) as [string, ClaudeHookSpec][]) {
    hooks[name] = [
      {
        ...(spec.matcher === undefined ? {} : { matcher: spec.matcher }),
        hooks: [
          spec.async
            ? { type: 'command', command, async: true }
            : { type: 'command', command, timeout: SESSION_END_HOOK_TIMEOUT_S },
        ],
      },
    ]
  }
  return { hooks }
}

/**
 * The plugin argv with the hook settings merged into its `--settings` value, or
 * a `--settings` of their own when the plugins brought none: Claude is handed
 * one `--settings`, never two that could shadow each other.
 */
function withHookSettings(pluginArgv: string[], command: string | undefined): string[] {
  if (command === undefined) return pluginArgv
  const hooks = claudeHookSettings(command)
  const at = pluginArgv.indexOf('--settings')
  if (at === -1) return [...pluginArgv, '--settings', JSON.stringify(hooks)]
  const existing = JSON.parse(pluginArgv[at + 1]!) as Record<string, unknown>
  const merged = [...pluginArgv]
  // The plugin settings are only `enabledPlugins`, so the spread cannot lose a
  // user key; if they ever carry `hooks`, ours replace them.
  merged[at + 1] = JSON.stringify({ ...existing, ...hooks })
  return merged
}

/**
 * The argv for {@link ClaudeLaunchFlags}, shared by the launches and {@link claudeResumeArgv}.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function claudeSessionArgv(flags: ClaudeLaunchFlags): string[] {
  const pluginArgv = flags.plugins === undefined ? [] : claudePluginArgv(flags.plugins)
  return [
    ...(flags.harnessSessionId === undefined ? [] : ['--session-id', flags.harnessSessionId]),
    ...withHookSettings(pluginArgv, flags.hookCommand),
    ...(flags.appendSystemPrompt === undefined
      ? []
      : ['--append-system-prompt', flags.appendSystemPrompt]),
  ]
}

/**
 * `claude --resume=<id>` plus the launch's session flags, so a resumed session
 * keeps its plugins and prompt pin. Does not validate `id`; `claudeResumeFlag`
 * binds it with `=`.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function claudeResumeArgv(id: string, flags: ClaudeSessionFlags = {}): string[] {
  return [claudeResumeFlag(id), ...claudeSessionArgv(flags)]
}

/**
 * What an interactive launch is handed. Not {@link AgentCallSpec} minus its
 * output fields: a headless spec says what the call must produce, and a
 * session produces nothing a program reads.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export interface InteractiveSpec {
  /** The CLI, a name on PATH or an absolute path. */
  binary: string
  /** The first message. Placed so a prompt starting with `-` is never read as a flag. */
  prompt: string
  /** The launch mode, model and effort flags ({@link modelArgs}). A tool with none wired throws. */
  choice?: ModelChoice | undefined
  /** Flags only `claude` takes; other tools ignore them. */
  claude?: ClaudeLaunchFlags | undefined
  /** Argv a per-launch observation adds (pi's `--session-id` and `-e <extension>`); it sits before the prompt. */
  injected?: readonly string[] | undefined
}

interface Parts {
  bin: string
  prompt: string
  model: string[]
  claude: ClaudeLaunchFlags
  injected: readonly string[]
}

/** `<bin> <model flags> <injected> -- <prompt>`: the shape of every CLI whose positional is the first message. */
const guarded = (p: Parts): string[] => [p.bin, ...p.model, ...p.injected, '--', p.prompt]

/**
 * The builders, keyed by tool id: the bare CLI with `prompt` as its first
 * message, guarded behind a `--` end-of-options marker, so a prompt starting
 * with `-` (or naming a subcommand) is never read as one. A tool missing here
 * has no interactive launch (antigravity, a declared tool).
 *
 *   - `claude`: its CLI parser (commander.js) treats `--` as the end of
 *     options. Its session flags ({@link claudeSessionArgv}) sit before the guard.
 *   - `codex`: its CLI parser (clap) honours `--`; without it a prompt starting
 *     with `-` is parsed as a flag, and one naming a subcommand (`login`) runs
 *     that subcommand. Checked against a live codex.
 *   - `cursor`: taken from Cursor's published CLI docs, not a live run; guarded
 *     the same way, since any argv-parsing CLI has the same ambiguity.
 *   - `pi`: `pi --help` documents `pi [options] [--] [@files...] [messages...]`,
 *     and a live run with `--` opened the session on the prompt.
 *   - `opencode`: its bare positional is the PROJECT directory, so the first
 *     message goes in `--prompt=<message>` (bound with `=` so a message starting
 *     with `-` is not read as a flag), per `opencode --help`.
 */
const INTERACTIVE_ARGV: Readonly<Record<string, (p: Parts) => string[]>> = {
  claude: (p) => [p.bin, ...p.model, ...claudeSessionArgv(p.claude), ...p.injected, '--', p.prompt],
  codex: guarded,
  cursor: guarded,
  pi: guarded,
  opencode: (p) => [p.bin, ...p.model, ...p.injected, `--prompt=${p.prompt}`],
}

/**
 * Whether an interactive argv can be built for `tool`.
 *
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function hasInteractiveArgv(tool: string): boolean {
  return Object.hasOwn(INTERACTIVE_ARGV, tool)
}

/**
 * The argv that opens `tool` interactively with `spec.prompt` as its first
 * message ({@link INTERACTIVE_ARGV}).
 *
 * @throws {Error} For a tool with no interactive launch, or a `choice` the tool has no model or effort flags for (it is never dropped).
 * @experimental Part of the launch-argv helpers, which may change in a minor release.
 */
export function interactiveArgv(tool: string, spec: InteractiveSpec): string[] {
  const build = Object.hasOwn(INTERACTIVE_ARGV, tool) ? INTERACTIVE_ARGV[tool] : undefined
  if (build === undefined) throw new Error(`'${tool}' has no interactive launch`)
  return build({
    bin: spec.binary,
    prompt: spec.prompt,
    model: modelArgs(tool, spec.choice ?? {}),
    claude: spec.claude ?? {},
    injected: spec.injected ?? [],
  })
}
