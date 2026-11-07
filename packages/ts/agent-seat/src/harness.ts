/**
 * The harness axis — pure argv-building + naming for whichever coding-agent
 * CLI a host opens a session in.
 *
 * `Harness` is independent of `HostName` (`contract.ts`): every host composes
 * `harnessArgv` to run whichever harness the caller asked for.
 *
 * Not `@osdlc/agent-call`'s planner: that plans HEADLESS calls (`claude -p`,
 * `codex exec`) whose output a program reads. A session is the opposite — a
 * person sits in it — so the argv is the bare CLI with the first message,
 * plus the Claude-only flags in {@link claudeSessionArgv}.
 *
 * This module also carries harness-specific machinery: codex's own on-disk
 * session-index lookup (`codexSessionsDir` et al. — harness-specific, not
 * host-specific, so it belongs on this axis), `wrapperSession`, the one body every wrapper
 * host's `session()` now shares instead of hand-rolling its own copy of
 * "build argv, run it, best-effort resolve a session id", and
 * `harnessNativeSend`, a per-harness message-injection
 * mechanism independent of any host (`contract.ts`'s `Host.send` is the
 * host-level counterpart).
 */

import { type Dirent, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import { z } from 'zod'

import {
  claudePluginArgv,
  claudeResumeFlag,
  modelArgs,
  type ModelChoice,
  type PluginSpec,
} from '@osdlc/agent-call'
import { which } from '@osdlc/detect-harness'

import { ran, resolveRunner, type CommandRunner, type EnvOverrides } from '@osdlc/command-seam'
import { commandString, powershellLiteral, sleepSync } from './util.ts'

// `contract.ts` imports only types from this file (`Harness` for
// `SessionRequest.harness`), so the value imported back here makes no runtime cycle.
import {
  hostCanWait,
  type CommandRequest,
  type HostName,
  type SendReceipt,
  type SessionRequest,
} from './contract.ts'

/**
 * The coding-agent CLI a session runs, by its tool id: a built-in one
 * ({@link KNOWN_HARNESSES}, e.g. `claude`) or one a caller declares. This file
 * builds the interactive argv ({@link INTERACTIVE_ARGV}).
 */
export type Harness = string

/** A tool id: a lowercase letter, then lowercase letters, digits and hyphens. */
const HARNESS_ID_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * The schema a harness field validates against. A tool id, not a closed list,
 * since a caller may run a tool of its own.
 */
export const HarnessSchema = z
  .string()
  .regex(HARNESS_ID_PATTERN, 'must be a tool id: lowercase letters, digits and hyphens')

/**
 * The coding-agent CLIs this package knows by name: each tool's id and the executable it
 * runs as. A host that reports which program runs in a pane (Orca, herdr, cmux, otty)
 * recognises these.
 */
export const KNOWN_HARNESSES: readonly { readonly id: Harness; readonly binary: string }[] = [
  { id: 'antigravity', binary: 'agy' },
  { id: 'claude', binary: 'claude' },
  { id: 'codex', binary: 'codex' },
  { id: 'cursor', binary: 'cursor-agent' },
  { id: 'opencode', binary: 'opencode' },
  { id: 'pi', binary: 'pi' },
]

/** `value` as a {@link KNOWN_HARNESSES} id (what a host reports running in a pane), or null when it is not one. */
export function harnessOrNull(value: unknown): Harness | null {
  return typeof value === 'string' && KNOWN_HARNESSES.some((h) => h.id === value) ? value : null
}

/** What an interactive argv builder is handed: the binary, the first message, and the flags around it. */
interface InteractiveParts {
  bin: string
  prompt: string
  /** The launch mode, model and effort flags (`modelArgs`). */
  model: string[]
  claude: ClaudeLaunchFlags
  injected: readonly string[]
}

/** `<bin> <model flags> <injected> -- <prompt>`: the shape of every CLI whose positional is the first message. */
const guarded = (p: InteractiveParts): string[] => [
  p.bin,
  ...p.model,
  ...p.injected,
  '--',
  p.prompt,
]

/**
 * The interactive argv builders, keyed by catalogue tool id: the bare CLI with
 * `prompt` as its first message, guarded behind a `--` end-of-options marker,
 * so a prompt starting with `-` (or naming a subcommand) is never read as one.
 * A tool missing here has no interactive launch (antigravity, a declared tool).
 *
 *   - `claude`: confirmed live against the installed `claude` 2.1.283 CLI —
 *     `claude --help`'s formatting (`Usage:`/`Arguments:`/`Options:`
 *     sections, `<value>`-shaped required-option placeholders) is
 *     commander.js's, and commander unconditionally treats `--` as an
 *     end-of-options marker. Its session flags ({@link claudeSessionArgv})
 *     sit before the guard.
 *   - `codex`: confirmed live against the installed codex 0.156.1 binary —
 *     without `--`, a prompt starting with `-` is parsed as a flag (`error:
 *     unexpected argument`) and a prompt that happens to match a subcommand
 *     name (e.g. `login`) is dispatched as that subcommand instead of used
 *     as the session's first message (`codex login` launches the real OAuth
 *     flow; `codex -- login` correctly treats `login` as a literal prompt).
 *     `codex --help`/`codex resume --help` both confirm clap (codex's CLI
 *     framework) honors `--` the same way commander does.
 *   - `cursor-agent`: UNVERIFIED — `cursor-agent` is not installed on this
 *     development machine, and this is taken from Cursor's published CLI
 *     docs (cursor.com/docs/cli), not a live run. Kept consistent with the
 *     other two defensively, on the reasoning that the same
 *     flags-vs-positional ambiguity would apply to any argv-parsing CLI, but
 *     this needs verification once a real install is available.
 *   - `pi`: confirmed against the installed pi 1.1.0 on 2026-10-09 —
 *     `pi --help` gives `pi [options] [--] [@files...] [messages...]`, says
 *     `--` ends option parsing, and shows `pi "<prompt>"` opening the TUI
 *     with that prompt as its first message; a live `pi -p --model
 *     ollama/granite4:latest -- "<prompt>"` ran
 *     (verified).
 *   - `opencode`: its bare positional is the PROJECT directory, so the first
 *     message goes in `--prompt=<message>` (bound with `=` so a message starting
 *     with `-` is not read as a flag); `opencode --help` on 1.1.36.
 */
const INTERACTIVE_ARGV: Readonly<Record<string, (p: InteractiveParts) => string[]>> = {
  claude: (p) => [p.bin, ...p.model, ...claudeSessionArgv(p.claude), ...p.injected, '--', p.prompt],
  codex: guarded,
  cursor: guarded,
  pi: guarded,
  opencode: (p) => [p.bin, ...p.model, ...p.injected, `--prompt=${p.prompt}`],
}

/** Whether an interactive argv can be built for `tool`. */
export function hasInteractiveArgv(tool: string): boolean {
  return Object.hasOwn(INTERACTIVE_ARGV, tool)
}

/**
 * The argv that opens `harness`, run as `binary` (its catalogue row's,
 * `toolBinary`), interactively with `prompt` as its first message
 * ({@link INTERACTIVE_ARGV}). A resolved `choice` adds its launch mode,
 * model and effort flags (`modelArgs`, `@osdlc/agent-call`) before the `--` guard; a
 * tool with no model or effort flags wired throws on a choice rather than
 * dropping it. Throws for a tool with no interactive launch.
 *
 * `injected` is the argv a per-launch observation adds (pi's
 * `--session-id` and `-e <extension>`); it sits before the prompt.
 */
export function harnessArgv(
  harness: Harness,
  binary: string,
  prompt: string,
  claude: ClaudeLaunchFlags = {},
  choice: ModelChoice = {},
  injected: readonly string[] = [],
): string[] {
  const build = Object.hasOwn(INTERACTIVE_ARGV, harness) ? INTERACTIVE_ARGV[harness] : undefined
  if (build === undefined) throw new Error(`'${harness}' has no interactive launch`)
  return build({
    bin: binary,
    prompt,
    model: modelArgs(harness, choice),
    claude,
    injected,
  })
}

/** Session flags only `claude` takes; also the shape stored on a session record. */
export const ClaudeSessionFlagsSchema = z.object({
  /** Text for `claude --append-system-prompt`. */
  appendSystemPrompt: z.string().optional(),
  /** Session-only plugins (`claude --plugin-dir` / `--settings`). */
  plugins: (
    z.object({
      dirs: z.array(z.string()),
      disable: z.array(z.string()),
    }) satisfies z.ZodType<PluginSpec>
  ).optional(),
  /**
   * The shell command Claude's hooks run (`<caller> hook --harness claude ...`);
   * set, it adds the hook settings of {@link claudeHookSettings} to every launch and
   * resume, since `--settings` is not persisted with the session.
   */
  hookCommand: z.string().optional(),
})
/**
 * The parsed {@link ClaudeSessionFlagsSchema}: the session flags only `claude` takes.
 */
export type ClaudeSessionFlags = z.infer<typeof ClaudeSessionFlagsSchema>

/** {@link ClaudeSessionFlags} plus what only a fresh launch passes: the session id to preset. */
export interface ClaudeLaunchFlags extends ClaudeSessionFlags {
  /**
   * The harness's own session id to preset (`claude --session-id`), so its id and transcript
   * are known at launch. Never with a resume. Not the caller's id: that is
   * `SessionRequest.sessionId`.
   */
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
 * The Claude Code hook events the caller listens to. Everything is async except
 * `SessionEnd`, which has to finish its write before Claude exits (its budget
 * is the hook's own `timeout`). `PreToolUse` is matched to `AskUserQuestion`
 * alone: the question is what puts the agent in `waiting_for_input` there, and
 * a hook on every tool call would cost a process each. `PermissionRequest` and
 * `StopFailure` are the other events `log/adapters/claude-status.ts` maps to a status
 * (a tool-permission prompt, and a turn that ended on an API error).
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

/** The `hooks` settings object that runs `command` for every {@link CLAUDE_HOOK_EVENTS} event. */
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

/** The argv for {@link ClaudeLaunchFlags}, shared by the launches and {@link claudeResumeArgv}. */
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
 * (`@osdlc/agent-call`) binds it with `=`.
 */
export function claudeResumeArgv(id: string, flags: ClaudeSessionFlags = {}): string[] {
  return [claudeResumeFlag(id), ...claudeSessionArgv(flags)]
}

/**
 * Whether `harness`'s CLI, `binary` (its catalogue row's, `toolBinary`), is on
 * PATH. A synchronous lookup that spawns nothing. Only a PATH hit counts: an
 * app bundle (Cursor.app, which `harness detect` reports as an install) gives
 * a session nothing to run.
 */
export function harnessAvailable(_harness: Harness, binary: string): boolean {
  return which(binary, process.env) !== null
}

/** {@link SendReceipt}'s shape, reused here under its own name: both answer "did the message get in", one via a host, one via the harness's own process/daemon directly. */
export type NativeSendResult = SendReceipt

type NativeSendFn = (
  sessionId: string,
  text: string,
  opts: { runner?: CommandRunner | undefined },
) => NativeSendResult

/**
 * `codex queue --thread <id> --message <text>` — the FLAGS are verified (`codex queue --help`-shaped syntax), but
 * whether this actually reaches a session that is CURRENTLY OPEN in a live
 * TUI, versus only queuing for a future `codex resume`, is
 * unresolved — no bundled source to check, no live test run. Through
 * the command seam, `opts.runner` injectable so a test never shells out for
 * real (`cwd: process.cwd()` — `queue` addresses by `--thread <id>`, not by
 * working directory, so any real directory does). `ack` is always
 * false regardless of exit code: a clean exit only proves the daemon
 * ACCEPTED the queue request, never that a live session consumed it — the
 * same honesty `hosts/tmux.ts`'s `send` applies for a different reason (no
 * confirmation mechanism at all, versus this one's confirmed-but-unresolved
 * mechanism).
 */
function codexNativeSend(
  sessionId: string,
  text: string,
  opts: { runner?: CommandRunner | undefined },
): NativeSendResult {
  const runner = resolveRunner('codex', opts.runner)
  const res = runner.run(['queue', '--thread', sessionId, '--message', text], {
    cwd: process.cwd(),
    timeoutMs: 30_000,
  })
  return { accepted: ran(res), ack: false }
}

/**
 * Per-harness native message injection, independent of any host — a caller's
 * "native send" step (`docs/planning/research/orca.md`'s "Recommended
 * shape" section), distinct from `Host.send` (`contract.ts`'s `SendRequest`):
 * this reaches the harness's OWN process/daemon directly, never through
 * whichever terminal happens to host it. Only `codex` gets a real entry here
 * — every other harness is simply ABSENT from this map, meaning "no known
 * native-send mechanism," not "not implemented yet": `claude` has no way to
 * inject into a running session at all (it has its own separate `--bg`/`attach` background-session mechanism
 * instead, unrelated to sending into an interactive one); `cursor`'s
 * published docs describe no such surface; `pi`'s only send-like channel,
 * `--mode rpc`, requires the dispatcher to have spawned and held that
 * process's own stdin from the very start — not a way to reach an already-running independent `pi` TUI process, and
 * building that headless-RPC surface is out of scope here besides.
 *
 * Deciding when to PREFER native-send over host `send` is left to the caller;
 * `harnessNativeSend` just needs to exist and be callable.
 */
const NATIVE_SEND: Partial<Record<Harness, NativeSendFn>> = {
  codex: codexNativeSend,
}

/** `NATIVE_SEND[harness]`, called if present; `null` — not a thrown error — when the harness has no known native-send mechanism at all (see the map's own doc for which). */
export function harnessNativeSend(
  harness: Harness,
  sessionId: string,
  text: string,
  opts: { runner?: CommandRunner | undefined } = {},
): NativeSendResult | null {
  const fn = NATIVE_SEND[harness]
  return fn === undefined ? null : fn(sessionId, text, opts)
}

/**
 * Codex's own on-disk session index, read to resolve the id of a codex session
 * a wrapper host opened ({@link wrapperSession}). It is harness-specific, not
 * host-specific, so any host that opens codex resolves the id the same way.
 *
 * `~/.codex/session_index.jsonl` is NOT used: it only records threads that were
 * given a name. Instead this scans `~/.codex/sessions/**\/rollout-*.jsonl`
 * (bucketed by `yyyy/mm/dd`) for the session created at or after the launch
 * whose first line, a `session_meta` record
 * (`{"type":"session_meta","payload":{"session_id":"<uuid>","cwd":"<path>",…}}`),
 * names the request's `cwd`.
 *
 * Selection is by the rollout's creation instant ({@link rolloutCreatedMs}),
 * not its mtime: another codex session in the same cwd keeps appending to its
 * own rollout, so its mtime would pass a launch-time cutoff. This is still
 * best-effort: two codex sessions launched from the same cwd within a couple of
 * seconds of each other (or one launched in that cwd while a waiting host holds
 * ours) can be mistaken for each other. No local signal tells them apart.
 */
/** `~/.codex/sessions` (or under an injected `codexHome`, for tests). */
export function codexSessionsDir(codexHome?: string): string {
  return join(codexHome ?? join(homedir(), '.codex'), 'sessions')
}

/**
 * Recursively finds every `rollout-*.jsonl` file under `dir`. Missing/
 * unreadable dirs yield `[]`. Exported so a caller that needs the transcript
 * path can reuse this walk; {@link findCodexSessionId} returns only the id.
 */
export function walkRolloutFiles(dir: string): string[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkRolloutFiles(full))
    } else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

/** The `cwd`/session-id pair recorded in a rollout file's first (`session_meta`) line, or null if unparsable. */
export function parseRolloutMeta(firstLine: string): { cwd: string; sessionId: string } | null {
  const trimmed = firstLine.trim()
  if (trimmed.length === 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const payload = (parsed as Record<string, unknown>).payload
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (typeof p.cwd !== 'string') return null
  const sessionId =
    typeof p.session_id === 'string' ? p.session_id : typeof p.id === 'string' ? p.id : null
  if (sessionId === null) return null
  return { cwd: p.cwd, sessionId }
}

/**
 * How far before the launch instant a rollout's creation may fall and still
 * count as this launch's: the file name has one-second resolution, and file
 * timestamps come from a coarser clock than `Date.now()`, so a file created
 * just after the launch can read a little before it.
 */
export const ROLLOUT_CREATED_MARGIN_MS = 2_000

const ROLLOUT_NAME_TIME = /^rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-/

/**
 * The instant in a rollout file name, `rollout-<YYYY-MM-DDTHH-MM-SS>-<uuid>.jsonl`,
 * or null when the name has none. Read as LOCAL time: codex stamps the name
 * (and the `yyyy/mm/dd` buckets) from its local clock, so this assumes it ran
 * in the same time zone as this process.
 */
export function rolloutNameTimeMs(path: string): number | null {
  const m = ROLLOUT_NAME_TIME.exec(basename(path))
  if (m === null) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const date = new Date(y, mo - 1, d, h, mi, s)
  // `Date` rolls an out-of-range field over (month 13, hour 25); such a name has no instant.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  if (date.getHours() !== h || date.getMinutes() !== mi || date.getSeconds() !== s) return null
  return date.getTime()
}

/**
 * When a rollout file was created: the time in its name, else its birthtime,
 * else its mtime. A name time later than the file's last write (beyond the
 * margin) cannot be right, so a name written in another time zone falls
 * through to the file's own timestamps. A birthtime of 0 means the filesystem
 * does not record one.
 */
export function rolloutCreatedMs(
  path: string,
  stats: { birthtimeMs: number; mtimeMs: number },
): number {
  const named = rolloutNameTimeMs(path)
  if (named !== null && named <= stats.mtimeMs + ROLLOUT_CREATED_MARGIN_MS) return named
  return stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.mtimeMs
}

/**
 * The session id of the newest candidate (by creation instant) created no more
 * than {@link ROLLOUT_CREATED_MARGIN_MS} before `sinceMs` whose rollout `cwd`
 * matches `opts.cwd`, or null when none qualifies. Pure, so a test can feed it
 * canned candidates.
 */
export function newestRolloutSessionIdSince(
  candidates: { firstLine: string; createdMs: number }[],
  opts: { sinceMs: number; cwd: string },
): string | null {
  const cutoff = opts.sinceMs - ROLLOUT_CREATED_MARGIN_MS
  let best: { sessionId: string; createdMs: number } | null = null
  for (const c of candidates) {
    if (c.createdMs < cutoff) continue
    const meta = parseRolloutMeta(c.firstLine)
    if (meta === null || meta.cwd !== opts.cwd) continue
    if (best === null || c.createdMs > best.createdMs)
      best = { sessionId: meta.sessionId, createdMs: c.createdMs }
  }
  return best?.sessionId ?? null
}

/** How long, and with which clock, a session-id lookup keeps looking for a file not written yet. */
export interface SessionIdWaitOptions {
  /** How long to keep looking, ms; 0 (the default) looks once. */
  waitMs?: number | undefined
  /** Pause between looks, ms; default 250. */
  pollMs?: number | undefined
  /** Blocks for the given ms; default `sleepSync`. */
  sleep?: ((ms: number) => void) | undefined
  /** The clock, ms; default `Date.now`. */
  now?: (() => number) | undefined
}

/**
 * The codex session started in `cwd` at or after `sinceMs`
 * ({@link newestRolloutSessionIdSince}), or null. With `waitMs`, keeps looking
 * that long for a rollout file codex has not written yet. `listFiles` and
 * `codexHome` are injectable so a test needs no real `~/.codex/`.
 */
export function findCodexSessionId(
  sinceMs: number,
  cwd: string,
  opts: {
    codexHome?: string | undefined
    listFiles?: (() => string[]) | undefined
  } & SessionIdWaitOptions = {},
): string | null {
  const listFiles = opts.listFiles ?? (() => walkRolloutFiles(codexSessionsDir(opts.codexHome)))
  const look = (): string | null => {
    const candidates: { firstLine: string; createdMs: number }[] = []
    for (const path of listFiles()) {
      try {
        const createdMs = rolloutCreatedMs(path, statSync(path))
        const firstLine = readFileSync(path, 'utf-8').split('\n', 1)[0] ?? ''
        candidates.push({ firstLine, createdMs })
      } catch {
        // Raced away (deleted) or unreadable — skip, not fatal.
      }
    }
    return newestRolloutSessionIdSince(candidates, { sinceMs, cwd })
  }
  return pollFor(look, opts)
}

/** `look()` until it gives a value or `opts.waitMs` runs out; null then. */
function pollFor<T>(look: () => T | null, opts: SessionIdWaitOptions): T | null {
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? sleepSync
  const pollMs = opts.pollMs ?? 250
  const deadline = now() + (opts.waitMs ?? 0)
  for (;;) {
    const found = look()
    if (found !== null) return found
    const left = deadline - now()
    if (left <= 0) return null
    sleep(Math.min(pollMs, left))
  }
}

/** A harness-specific, best-effort post-launch session-id lookup. */
type SessionIdResolver = (sinceMs: number, cwd: string, wait: SessionIdWaitOptions) => string | null

/**
 * Only `codex` has a resolver. `claude` needs none: the launcher presets the
 * session id with `claude --session-id` (`claudeSessionArgv`) and records it
 * as `harnessSessionId` itself (`session/start.ts`). `cursor` has no local
 * session index or rollout file to look an id up in.
 */
const SESSION_ID_RESOLVERS: Partial<Record<Harness, SessionIdResolver>> = {
  codex: (sinceMs, cwd, wait) => findCodexSessionId(sinceMs, cwd, wait),
}

/** How long {@link wrapperSession} waits for the agent to record its session after a host returned early. */
export const SESSION_ID_WAIT_MS = 3_000

/**
 * `argv` carrying `env`, so the vars reach the process whatever terminal runs it.
 * POSIX: prefixed with `env [-u K ...] [K=V ...]`. win32 has no `env`, so the
 * argv becomes a `powershell -Command` that sets (`$env:K='V'`) or clears
 * (`Remove-Item Env:K`) each variable and then runs the original command.
 *
 * Windows limits (not run on Windows): `powershell` is Windows PowerShell 5.1,
 * which passes an argument containing `"` to a native program without escaping
 * it (the program sees it split, or with the quotes gone) and drops an empty
 * argument; and `-Command` turns the program's exit code into 0 or 1. See
 * {@link commandString}.
 */
export function withEnv(
  argv: string[],
  env: EnvOverrides | undefined,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const entries = Object.entries(env ?? {})
  if (entries.length === 0) return argv
  if (platform === 'win32') {
    for (const [k] of entries) {
      // The name goes into a PowerShell command unquoted (set branch), so it must be a plain identifier.
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
        throw new Error(`invalid environment variable name: ${k}`)
    }
    const sets = entries.map(([k, v]) =>
      v === undefined
        ? `Remove-Item -ErrorAction SilentlyContinue ${powershellLiteral(`Env:${k}`)}`
        : `$env:${k} = ${powershellLiteral(v)}`,
    )
    return [
      'powershell',
      '-NoProfile',
      '-Command',
      `${sets.join('; ')}; ${commandString(argv, platform)}`,
    ]
  }
  const unset: string[] = []
  const pairs: string[] = []
  for (const [k, v] of entries) {
    if (v === undefined) unset.push('-u', k)
    else pairs.push(`${k}=${v}`)
  }
  return ['env', ...unset, ...pairs, ...argv]
}

/**
 * The shared body of every wrapper host's `session()`: build `harnessArgv`
 * under `req.env`, run it, best-effort resolve a session id.
 *
 * Most hosts return as soon as the pane exists, before the agent has recorded
 * its session, so after a clean launch the lookup keeps trying for
 * `opts.waitMs` (default {@link SESSION_ID_WAIT_MS}). With `opts.hostWaited`
 * (the host held the launch until the agent exited) it looks once.
 *
 * @param terminal The calling host's own `terminal()`, which opens its
 *   terminal or workspace.
 */
export function wrapperSession(
  terminal: (req: CommandRequest) => number,
  req: SessionRequest,
  opts: SessionIdWaitOptions & { hostWaited?: boolean | undefined } = {},
): { exitCode: number; harnessSessionId: string | null } {
  const runTerminal = (r: CommandRequest) => terminal({ ...r, argv: withEnv(r.argv, req.env) })
  const sinceMs = (opts.now ?? Date.now)()
  const exitCode = runTerminal({
    cwd: req.cwd,
    argv: [
      ...(req.wrap ?? []),
      ...harnessArgv(req.harness, req.binary, req.prompt, req, req, req.injectedArgv),
    ],
    title: req.title,
    sessionId: req.sessionId,
    ...(req.wait !== undefined ? { wait: req.wait } : {}),
  })
  const resolver = SESSION_ID_RESOLVERS[req.harness]
  if (resolver === undefined) return { exitCode, harnessSessionId: null }
  // A failed launch started no agent, and a held one has written its file: look once.
  const waitMs =
    exitCode !== 0 || opts.hostWaited === true ? 0 : (opts.waitMs ?? SESSION_ID_WAIT_MS)
  return { exitCode, harnessSessionId: resolver(sinceMs, req.cwd, { ...opts, waitMs }) }
}

/**
 * The `session` part of a host whose `terminal` part opens the harness: assign
 * it as `session: sessionViaTerminal`. `this` is the host the part is called on,
 * so the host's own `terminal` runs; a host that has none throws rather than
 * start nothing. The current terminal, and a host honouring `req.wait`, return
 * only once the agent exited, so the session-id lookup does not wait.
 */
export function sessionViaTerminal(
  this: { name?: HostName; terminal?: (req: CommandRequest) => number },
  req: SessionRequest,
): { exitCode: number; harnessSessionId: string | null } {
  const terminal = this.terminal
  if (terminal === undefined) throw new Error('host has no terminal part to open a session with')
  const hostWaited =
    this.name === 'terminal' ||
    (req.wait !== undefined && this.name !== undefined && hostCanWait(this.name))
  return wrapperSession((r) => terminal.call(this, r), req, { hostWaited })
}
