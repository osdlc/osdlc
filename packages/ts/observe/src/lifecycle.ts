/**
 * The life of a started session, in events: what a launcher appends between
 * its `launched` event and the end, in what order, and how a failure still
 * leaves the record ended. The launcher supplies the ports (where events go,
 * how to read the state back, how to spawn or open the session); everything
 * that names a harness, a host registry or a config stays with it.
 *
 * Headless ({@link runHeadlessSession}): the agent is spawned directly. Its pid
 * is attached and the session moves to `running` the moment the process
 * exists; on exit come `outcome`, `state_changed` to `ended` and `ended`.
 *
 * Interactive ({@link runInteractiveSession}): the session opens on a host. A
 * host that WAITS (its open call returns only once the person leaves the
 * session) ends the record with the real exit code; a hands-off host only
 * launched it, so the record is left `running` for a hook or reconcile to end.
 *
 * Hooks move the session while the launcher works, so every end reads the
 * state from the log first ({@link endSession}) and never writes a second
 * `state_changed` to `ended`.
 *
 * The whole module is experimental: it may change in a minor release.
 */

import {
  correlationFromEnv,
  INVOCATION_PID_ENV_VAR,
  lineageFromEnv,
  newRunId,
  readTag,
} from './envelope.ts'
import type { SessionOutcome, SessionParent, SessionRunState } from './model.ts'

/**
 * The events the lifecycle appends; `launched` and harness-specific events are the launcher's.
 *
 * @experimental
 */
export type LifecycleEvent<Ho extends string> =
  | { kind: 'host_attached'; host: Ho | null; harnessSessionId: string | null; pid: number | null }
  | { kind: 'state_changed'; from: SessionRunState | null; to: SessionRunState; cause: string }
  | { kind: 'outcome'; outcome: SessionOutcome; exitCode: number | null }
  | { kind: 'ended' }

/**
 * Where a session's events go and how its state is read back.
 *
 * @experimental
 */
export interface LifecyclePorts<Ho extends string> {
  /** Append `event` stamped `ts` (default: now) to the session's log. */
  emit: (event: LifecycleEvent<Ho>, ts?: string) => void
  /** The session's state as its log says now; `null` while it has no record. */
  state: () => SessionRunState | null
  /** The current instant, RFC 3339. */
  now: () => string
  /** Called once when this start sees the session end (a run's `run.end`, say). */
  onEnd?: ((outcome: 'ok' | 'failed', at: string) => void) | undefined
}

/**
 * End the session: `state_changed` from wherever the log says it is now (else
 * `fallback`) to `ended`, skipped when a hook already ended it, then `ended`,
 * both stamped `at`. `cause` goes on the `state_changed` event.
 *
 * @experimental
 */
export function endSession<Ho extends string>(
  ports: LifecyclePorts<Ho>,
  fallback: SessionRunState,
  at: string,
  cause: string,
): void {
  const now = ports.state() ?? fallback
  if (now !== 'ended') ports.emit({ kind: 'state_changed', from: now, to: 'ended', cause }, at)
  ports.emit({ kind: 'ended' }, at)
}

/** Record a failed start: outcome `failed`, the end, and `onEnd`. */
function endFailed<Ho extends string>(ports: LifecyclePorts<Ho>, from: SessionRunState): void {
  const at = ports.now()
  ports.emit({ kind: 'outcome', outcome: 'failed', exitCode: null }, at)
  endSession(ports, from, at, 'spawn_failed')
  ports.onEnd?.('failed', at)
}

/**
 * Record a finished run: its outcome from the exit code (`timeout` when the
 * launcher killed it at its time limit), the end, and `onEnd` (a timeout is a
 * failure there).
 */
function endExited<Ho extends string>(
  ports: LifecyclePorts<Ho>,
  from: SessionRunState,
  exitCode: number,
  at: string,
  timedOut = false,
): void {
  const outcome = timedOut ? 'timeout' : exitCode === 0 ? 'ok' : 'failed'
  ports.emit({ kind: 'outcome', outcome, exitCode }, at)
  endSession(ports, from, at, 'exit')
  ports.onEnd?.(outcome === 'ok' ? 'ok' : 'failed', at)
}

/**
 * Run a headless session the launcher has already recorded as `launched`.
 * `spawn` starts the agent and calls `onSpawn` with its pid as soon as the
 * process exists, so a launcher that dies mid-run leaves a record whose pid
 * tells an orphan from a live run. A spawn that throws still ends the record
 * (`failed`) before the error propagates. `afterExit` runs before the outcome
 * is written: whatever it appends (output, usage) precedes the end. If it
 * throws, the record is still ended with the real exit code and then the error
 * is rethrown, so a failing `afterExit` never leaves the record un-ended. A
 * result with `timedOut` set ends the record with outcome `timeout`.
 *
 * @throws Whatever `spawn` or `afterExit` throws, after the record is ended.
 * @experimental
 */
export async function runHeadlessSession<
  Ho extends string,
  R extends { exitCode: number; timedOut?: boolean | undefined },
>(
  ports: LifecyclePorts<Ho>,
  spawn: (onSpawn: (pid: number) => void) => Promise<R>,
  afterExit?: (result: R, endedAt: string) => void | Promise<void>,
): Promise<R> {
  let state: SessionRunState = 'starting'
  let result: R
  try {
    result = await spawn((pid) => {
      ports.emit({ kind: 'host_attached', host: null, harnessSessionId: null, pid })
      ports.emit({ kind: 'state_changed', from: 'starting', to: 'running', cause: 'spawn' })
      state = 'running'
    })
  } catch (err) {
    endFailed(ports, state)
    throw err
  }
  const endedAt = ports.now()
  let afterExitError: unknown
  let afterExitFailed = false
  try {
    await afterExit?.(result, endedAt)
  } catch (err) {
    afterExitFailed = true
    afterExitError = err
  }
  endExited(ports, state, result.exitCode, endedAt, result.timedOut === true)
  if (afterExitFailed) throw afterExitError
  return result
}

/**
 * What a host's open call reports.
 *
 * @experimental
 */
export interface HostOpened {
  exitCode: number
  /** The harness's own session id when the host found one. */
  harnessSessionId: string | null
}

/**
 * How {@link runInteractiveSession} opens a session on a host, and what the
 * launcher writes around it.
 *
 * @experimental
 */
export interface InteractiveRun<Ho extends string> {
  host: Ho
  /** Whether the host's open call returns only once the session is over. */
  waits: boolean
  /**
   * Open the session on the host. Calls `beforeLaunch` once the host and the
   * harness are known to be available, so a start that cannot happen writes
   * nothing. Throws when the session could not be opened.
   */
  open: (beforeLaunch: () => void) => HostOpened
  /** Writes the `launched` event (and anything else known up front). */
  beforeLaunch: () => void
  /** The harness session id the launch preset; it wins over the host's. */
  presetHarnessSessionId: string | null
  /** Appends what the host's result adds right after `host_attached`. */
  afterAttach?: ((opened: HostOpened) => void) | undefined
}

/**
 * What {@link runInteractiveSession} returns: the host's result, with the
 * harness session id the launch preset winning over the host's, and when the
 * session ended.
 *
 * @experimental
 */
export interface InteractiveResult extends HostOpened {
  /** When the session ended, for a host that waits; `null` while it runs on. */
  endedAt: string | null
}

/**
 * Open an interactive session and record what that says. A host that throws
 * after `beforeLaunch` wrote the record ends it `failed`, so no record is left
 * `starting`. A waiting host's session is over when `open` returns: unless a
 * hook moved it already, it goes to `running` and then ends with the exit
 * code. A hands-off host's session is `running` once attached.
 *
 * @throws Whatever `run.open` throws, after the record (if any) is ended `failed`.
 * @experimental
 */
export function runInteractiveSession<Ho extends string>(
  ports: LifecyclePorts<Ho>,
  run: InteractiveRun<Ho>,
): InteractiveResult {
  let opened: HostOpened
  try {
    opened = run.open(run.beforeLaunch)
  } catch (err) {
    // No record means the host or harness check failed before anything was written.
    if (ports.state() !== null) endFailed(ports, 'starting')
    throw err
  }
  const harnessSessionId = run.presetHarnessSessionId ?? opened.harnessSessionId
  ports.emit({ kind: 'host_attached', host: run.host, harnessSessionId, pid: null })
  run.afterAttach?.(opened)
  const stateNow = (): SessionRunState => ports.state() ?? 'starting'
  if (!run.waits) {
    if (stateNow() === 'starting') {
      ports.emit({ kind: 'state_changed', from: 'starting', to: 'running', cause: 'host_attached' })
    }
    return { exitCode: opened.exitCode, harnessSessionId, endedAt: null }
  }
  const endedAt = ports.now()
  if (stateNow() === 'starting') {
    ports.emit(
      { kind: 'state_changed', from: 'starting', to: 'running', cause: 'host_returned' },
      endedAt,
    )
  }
  endExited(ports, 'starting', opened.exitCode, endedAt)
  return { exitCode: opened.exitCode, harnessSessionId, endedAt }
}

/**
 * The run a session belongs to, and whether this start minted it.
 *
 * @experimental
 */
export interface RunContext {
  run: string
  subject: string | null
  /** Whether this start owns the run (and so journals its start and end). */
  minted: boolean
  /** The run in whose environment this start was made, when the launcher chose a different run. */
  parentRun: string | null
}

/**
 * The given run, else the run tag in `env` (default `process.env`), else a new
 * one. A given run that differs from the run tag already in `env` is a new run
 * on purpose: it nests under the environment's (`parentRun`) and counts as
 * minted. The subject is the given one, else the subject tag, else
 * `fallbackSubject`. Tags are read as {@link correlationFromEnv} reads them.
 *
 * @experimental
 */
export function resolveRun(
  given: { run?: string | undefined; subject?: string | undefined },
  fallbackSubject: string | null,
  env: Record<string, string | undefined> = process.env,
): RunContext {
  const fromEnv = correlationFromEnv(env)
  const run = given.run ?? fromEnv.run
  const nested = given.run !== undefined && fromEnv.run !== undefined && given.run !== fromEnv.run
  return {
    run: run ?? newRunId(),
    parentRun: nested ? fromEnv.run! : null,
    subject: given.subject ?? fromEnv.subject ?? fallbackSubject,
    minted: run === undefined || nested,
  }
}

/** A session id safe to look up as a directory name. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * The session and op invocation that launched session `id`, from `env`, kept
 * only while they describe a live launcher: the parent session must have a
 * record (`parentRecord`) that had not ended before `startedAt`, and the
 * invocation's process (the invocation pid tag) must be alive. A variable left
 * in a long-lived shell, or by a crashed op, would otherwise draw a false edge.
 * `env` defaults to `process.env`.
 *
 * @experimental
 */
export function resolveLineage(opts: {
  id: string
  startedAt: string
  parentRecord: (session: string) => { endedAt: string | null } | null
  pidAlive: (pid: number) => boolean
  env?: Record<string, string | undefined> | undefined
}): SessionParent | null {
  const env = opts.env ?? process.env
  const raw = lineageFromEnv(env, opts.id)
  if (raw === null) return null
  let session = raw.session
  if (session !== null) {
    const record = SAFE_ID.test(session) ? opts.parentRecord(session) : null
    const ended = record?.endedAt != null && Date.parse(record.endedAt) < Date.parse(opts.startedAt)
    if (record === null || ended) session = null
  }
  const pid = Number(readTag(env, INVOCATION_PID_ENV_VAR))
  // A non-positive pid is not one process: `kill(0)` would signal a group.
  const live = Number.isInteger(pid) && pid > 0 && opts.pidAlive(pid)
  const invocation = raw.invocation !== null && live ? raw.invocation : null
  return session === null && invocation === null ? null : { session, invocation }
}
