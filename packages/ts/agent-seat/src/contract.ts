/**
 * The host contract — somewhere on this machine a person's work can be put
 * in front of them: a terminal tab, a workspace in a multiplexer, a desktop
 * agent app.
 *
 * A host fulfils the contract in PARTS. Each part is an optional method, so
 * an app that can open an agent session but not an arbitrary command (a
 * desktop Claude or Codex) is still a host; a caller asks for the part it
 * needs through {@link requirePart} and gets a named error when the host
 * lacks it, never a silent fallback to a different host — the person chose
 * this one.
 */

import {
  ran,
  type CommandRunner,
  type CommandRunOptions,
  type EnvOverrides,
} from '@osdlc/command-seam'
import { which } from './util.ts'

import { z } from 'zod'

import type { ClaudeLaunchFlags, Harness } from './harness.ts'

/**
 * Every host in {@link HOST_NAMES} is a WRAPPER: it opens a terminal or
 * workspace and runs `harnessArgv(req.harness, req.binary, req.prompt, req)`
 * (`./harness.ts`) in it, so any host opens any {@link Harness}. `HostName`
 * names WHERE; `Harness` (`./harness.ts`) names WHICH.
 */
export type HostName = (typeof HOST_NAMES)[number]

/**
 * Every {@link HostName}, in a fixed order, for building the host registry and the
 * `z.enum` schema below.
 */
export const HOST_NAMES = [
  'terminal',
  'orca',
  'cmux',
  'tmux',
  'herdr',
  'otty',
  'wezterm',
  'vscode',
  'jetbrains',
] as const

/**
 * `z.enum` over {@link HOST_NAMES}: the one schema a `host`-shaped config
 * field or CLI flag validates against, so a new host is added in exactly one
 * place.
 */
export const HostNameSchema = z.enum(HOST_NAMES)

/**
 * Open an interactive coding-agent session with `prompt` as its first
 * message. Other harnesses ignore the Claude-only flags; `via`, `model` and `effort` apply to
 * claude, codex and pi.
 */
export interface SessionRequest extends ClaudeLaunchFlags {
  cwd: string
  harness: Harness
  /** The harness's executable: a name on PATH or an absolute path. */
  binary: string
  prompt: string
  /** Tab / workspace title for hosts that show one. */
  title: string
  /** Env vars set on the harness process; an `undefined` value unsets that var. */
  env?: EnvOverrides | undefined
  /**
   * A command prefix the harness argv runs under (`wrapperSession`): `wrap` then
   * the harness's own argv, e.g. `my-wrapper run --id <id> --`. Env applies to
   * the whole command, so the wrapper sees the session tags too.
   */
  wrap?: string[] | undefined
  /**
   * The caller's id for this session. A host binds the pane it opens to it, so a
   * later `send`/`find`/`focus`/`capture`/`close` with the same `sessionId` finds
   * THIS pane even when another session shares the working directory. The
   * harness's own id is {@link ClaudeLaunchFlags.harnessSessionId}.
   */
  sessionId?: string | undefined
  /** The resolved model passed as the harness's model flag (claude, codex, pi; another harness refuses one). */
  model?: string | undefined
  /** The resolved effort passed as the harness's effort flag (claude, codex, pi; another harness refuses one). */
  effort?: string | undefined
  /** The launch mode the model needs, as flags before the model flag (codex `--oss --local-provider ollama`). */
  via?: readonly string[] | undefined
  /** Argv a per-launch observation adds before the prompt (pi: `--session-id`, `-e <extension>`). */
  injectedArgv?: readonly string[] | undefined
  /** A visible run's wait ({@link WaitRequest}); only a host that can wait ({@link hostCanWait}) honours it. */
  wait?: WaitRequest | undefined
}

/**
 * Hold the launch until what it opened exits (a visible scheduled run): the host
 * returns the process's own exit code, or {@link WAIT_TIMEOUT_EXIT} after killing the session
 * at `timeoutMs`. `runId` names the session so a person can find it (`tmux attach -t …`).
 */
export interface WaitRequest {
  runId?: string | undefined
  /** The time left, milliseconds; unset waits as long as the process runs. */
  timeoutMs?: number | undefined
  /**
   * Called by the host when it killed the session because `timeoutMs` ran out, before it
   * returns. The only reliable sign of a deadline kill: a process may itself exit
   * {@link WAIT_TIMEOUT_EXIT}.
   */
  onDeadline?: (() => void) | undefined
}

/** The exit code a waiting host reports for a session it killed at the deadline (the `timeout(1)` convention). */
export const WAIT_TIMEOUT_EXIT = 124

/**
 * Hosts that can hold a launch until the session exits, when asked to ({@link WaitRequest}).
 *
 * @experimental to become a declaration on the host, like `acksSend`.
 */
export function hostCanWait(host: HostName): boolean {
  return host === 'tmux'
}

/** Run a command in a terminal the person can see. */
export interface CommandRequest {
  cwd: string
  argv: string[]
  title: string
  /** The caller's session id to bind the pane to; see {@link SessionRequest.sessionId}. */
  sessionId?: string | undefined
  /** See {@link SessionRequest.wait}. */
  wait?: WaitRequest | undefined
}

/**
 * Deliver `text` into a session that is ALREADY OPEN at `cwd`. Each host
 * turns the request into its own target at send time. With `sessionId` it
 * resolves the pane bound to that session at launch (tmux names its
 * session from the id, otty tags the title, wezterm/orca/herdr remember the pane
 * id, vscode tracks the terminal); without one, or on a host that cannot bind
 * an id (cmux, jetbrains), it falls back to `cwd`: Orca lists the worktree's
 * terminals and sends to a live agent's runtime handle; otherwise tmux derives
 * the fallback session name from `cwd` (`tmuxSessionName`).
 */
export interface SendRequest extends FindQuery {
  text: string
  /**
   * The harness of the session being addressed.
   * A host that can attribute terminals to a harness narrows to the one matching
   * terminal and refuses when there is not exactly one, rather than risk typing
   * into a different session.
   */
  harness?: Harness
}

/**
 * A query for live sessions, for deciding whether a recorded session is still
 * open. `sessionId` is the caller's session id when the caller has one
 * (a session launched before ids were bound has no pane bound to its id, so the
 * host falls back to `cwd`).
 */
export interface FindQuery {
  cwd: string
  sessionId?: string | undefined
}

/** One live-or-dead session a host found at a queried cwd. */
export interface FoundSession {
  cwd: string
  /** Best-known harness identity, or null when the host cannot tell (e.g. tmux — see `hosts/tmux.ts`). */
  harness: Harness | null
  alive: boolean
  /** ISO timestamp of last output, or null when the host has no such signal (tmux always null). */
  lastOutputAt: string | null
  /** The host's own identifier for the pane: Orca's terminal handle (`term_…`), tmux's session name, a pane id elsewhere; null for hosts without one. */
  handle?: string | null
}

/** Ensure a workspace containing `cwd` is open in the host (see {@link HostParts.openWorkspace}). */
export interface OpenWorkspaceQuery {
  cwd: string
  /** Told, before a possibly slow open starts, what is about to happen (e.g. "opening /repo in WebStorm…"). */
  notice?: ((line: string) => void) | undefined
}

/** Which workspace holds `cwd`, and whether this call had to open it. */
export interface OpenedWorkspace {
  /** The workspace root that contains `cwd`. */
  root: string
  /** False when a workspace already contained `cwd`, so nothing was opened. */
  opened: boolean
}

/** What a `send` attempt learned about whether the message actually landed. */
export interface SendReceipt {
  /** False for "nothing to send to" or "the host rejected/failed the send" — the caller tries the next route, same as a missing `send` part. */
  accepted: boolean
  /**
   * True only when the HOST ITSELF confirmed the harness CONSUMED the input
   * (Orca's `turn_started` stage, per `docs/planning/research/orca.md`'s
   * "send" section). False for "sent, but the host has no confirmation
   * mechanism" (tmux) or "sent, but the receiving process gave no stronger
   * signal than input-accepted". Other evidence (hook logs, session state)
   * is gathered by the caller, not reported here. A caller can treat `accepted && ack` as delivered and
   * `accepted && !ack` as unconfirmed.
   */
  ack: boolean
  /**
   * True when the host accepted the send but ITSELF says it cannot tell
   * whether the text landed (herdr's `timeout` / `agent_prompt_stalled`, Orca's
   * input-accepted without a `turn_started` stage). The text may well be in the
   * session, so a caller must not send it again.
   */
  uncertain?: boolean
}

/**
 * The parts a host may fulfil. `terminal` returns the exit code to report:
 * the process's own for a host that waits on it, 0 for one that hands the
 * work to another app. `session` returns that same exit code alongside
 * `harnessSessionId`, the harness's own id for the session it just started
 * when one can be found (`wrapperSession` resolves codex's), so a caller can
 * look a launch back up by it; `null` when there is no such id or a
 * best-effort lookup came up empty. `send`
 * delivers into an already-open session — `terminal`/`session`
 * both OPEN something new, `send` never does. `find` answers
 * "what's live at this cwd right now", so a caller can tell whether a
 * recorded hands-off session is still open — it never opens
 * or delivers anything. Each throws `Error` carrying the host's stderr on
 * failure — except `send`, `find`, `focus`, `capture` and `close`, which report a failed attempt
 * through their own return value (`SendReceipt.accepted: false`, an empty
 * `FoundSession[]`, `false`) rather than throwing, since "the target session is
 * gone/unreachable" and "nothing is running there" are both ordinary,
 * expected outcomes for a caller trying the next delivery route or
 * reconciling stale state, not exceptional ones.
 */
export interface HostParts {
  session(req: SessionRequest): { exitCode: number; harnessSessionId: string | null }
  terminal(req: CommandRequest): number
  send(req: SendRequest): SendReceipt
  find(query: FindQuery): FoundSession[]
  /** Brings the live session (`query.sessionId`, else `query.cwd`) forward; false when there is none or the host call failed. */
  focus(query: FindQuery): boolean
  /** Recent screen text of the session (`query.sessionId`, else `query.cwd`); null when there is none or the host call failed. Never throws. */
  capture(query: FindQuery): string | null
  /**
   * Closes the pane of the session (`query.sessionId`, else `query.cwd`) and kills what runs in
   * it. True when the host reported the close succeeded; false when there is none or the host
   * call failed. Never throws. Only hosts with a real close command fulfil it.
   */
  close(query: FindQuery): boolean
  /**
   * OPTIONAL: for a host whose terminals live inside a workspace (an IDE
   * project). Makes sure one containing `query.cwd` is open, opening the cwd's
   * git root when none is; idempotent. Throws `Error` on failure. Not called by
   * `send`/`find`/`focus`, which target sessions that already exist. The one
   * policy for when to call it is `ensureWorkspace` (`./open-workspace.ts`):
   * when its `enabled` argument is true, it runs before `session`/`terminal`.
   */
  openWorkspace(query: OpenWorkspaceQuery): OpenedWorkspace
}

/**
 * The name of one operation a host may fulfil (`terminal`, `session`, `send`, ...).
 */
export type HostPart = keyof HostParts

/**
 * One place a session can be opened: a name, the platforms it runs on, an availability
 * probe, and whichever {@link HostParts} it can fulfil.
 */
export interface Host extends Partial<HostParts> {
  readonly name: HostName
  /**
   * The OSes this host can run on, or `'all'`. Off-platform, `available()` is
   * false and the host is reported as "not supported on <os>".
   */
  readonly platforms: readonly NodeJS.Platform[] | 'all'
  /**
   * Per unsupported OS, how to get this host anyway (e.g. `win32: 'run inside WSL'`).
   * It is appended to "not supported on <os>". Only a hint: nothing probes for the
   * route it names.
   */
  readonly platformHint?: Partial<Record<NodeJS.Platform, string>>
  /**
   * True when this host's `send` normally reports `ack: true`, i.e. it can
   * confirm the harness consumed the input itself. A caller's delivery
   * receipt can treat a missing ack from such a host as
   * evidence the message was not taken in, unless the receipt is flagged
   * `uncertain` (the host itself cannot tell).
   */
  readonly acksSend?: boolean
  /** False when the host does not support this OS, or the binary or app it drives is not on this machine. */
  available(): boolean
}

/** Every {@link HostName} mapped to its {@link Host}. */
export type HostRegistry = Record<HostName, Host>

/** What {@link HostPartMissing}'s message calls each part's action. */
const HOST_PART_ACTION: Record<HostPart, string> = {
  session: 'open an agent session',
  terminal: 'run a command',
  send: 'deliver a message into an already-open session',
  find: 'find live sessions at a cwd',
  focus: 'bring a session forward',
  capture: 'read the recent screen text of a session',
  openWorkspace: 'open a workspace for a directory',
  close: 'close the pane of a session',
}

/** Thrown when a host is asked for a part it does not fulfil. */
export class HostPartMissing extends Error {
  /** The host that lacks the part. */
  readonly host: HostName
  /** The part it lacks. */
  readonly part: HostPart

  constructor(host: HostName, part: HostPart) {
    super(`host '${host}' cannot ${HOST_PART_ACTION[part]}`)
    this.name = 'HostPartMissing'
    this.host = host
    this.part = part
  }
}

/** Whether `host` supports `platform` (default: this OS). */
export function supportsPlatform(
  host: Pick<Host, 'platforms'>,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return host.platforms === 'all' || host.platforms.includes(platform)
}

/** The named part of `host`, or throw {@link HostPartMissing}. */
export function requirePart<P extends HostPart>(host: Host, part: P): HostParts[P] {
  const fn = host[part]
  if (fn === undefined) throw new HostPartMissing(host.name, part)
  return fn.bind(host) as HostParts[P]
}

/**
 * Whether `bin` is on PATH, through {@link which} (`@osdlc/detect-harness`'s
 * lookup; PATHEXT-aware on Windows). Spawns nothing.
 */
export function onPath(bin: string): boolean {
  return which(bin) !== null
}

/**
 * Run `argv` and return its stdout, or null when it exits nonzero or the runner
 * throws. The shared body of the hosts' "never throws" parts (`find`, `focus`,
 * `capture`): a failed host call there is an ordinary "no session", not an error.
 */
export function quietRun(
  runner: CommandRunner,
  argv: string[],
  opts: CommandRunOptions,
): string | null {
  try {
    const res = runner.run(argv, opts)
    return ran(res) ? res.stdout : null
  } catch {
    return null
  }
}
