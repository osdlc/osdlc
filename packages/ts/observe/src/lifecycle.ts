/**
 * The events of a started session: what a launcher appends between its
 * `launched` event and the end, in what order, and how a failure still leaves
 * the record ended. The launcher supplies the ports (where events go, how to
 * read the state back, how to spawn or open the session). Anything that names
 * a harness, a host registry or a config stays in the launcher.
 *
 * Headless ({@link runHeadlessSession}): the agent is spawned directly. Its pid
 * is attached and the session moves to `running` as soon as the process
 * exists. On exit come `outcome`, `state_changed` to `ended`, and `ended`.
 *
 * Interactive ({@link runInteractiveSession}): the session opens on a host. A
 * host that waits (its open call returns only when the person leaves the
 * session) ends the record with the real exit code. A host that does not wait
 * (a hands-off host) only launched the session, so the record is left
 * `running` for a hook or reconcile to end.
 *
 * Hooks change the session's state while the launcher works. So every end
 * reads the state from the log first ({@link endSession}) and never writes a
 * second `state_changed` to `ended`.
 *
 * The whole module is experimental. It may change in a minor release.
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
 * The events the lifecycle appends. The launcher appends `launched` and harness-specific events.
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
  /** The session's current state, from its log. `null` while it has no record. */
  state: () => SessionRunState | null
  /** The current instant, RFC 3339. */
  now: () => string
  /** Called once when this start sees the session end (a run's `run.end`, say). */
  onEnd?: ((outcome: 'ok' | 'failed', at: string) => void) | undefined
}

/**
 * End the session. Appends `state_changed` from the state the log shows now
 * (else `fallback`) to `ended`, unless a hook already ended it. Then appends
 * `ended`. Both are stamped `at`. `cause` goes on the `state_changed` event.
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
 * process exists. If the launcher dies mid-run, the pid in the record shows
 * whether the agent is orphaned or still running. A spawn that throws still
 * ends the record (`failed`) before the error propagates. `afterExit` runs
 * before the outcome is written, so whatever it appends (output, usage) comes
 * before the end. If it throws, the record is still ended with the real exit
 * code and then the error is rethrown. A result with `timedOut` set ends the
 * record with outcome `timeout`.
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
  /** The harness session id the launch set in advance. It wins over the host's. */
  presetHarnessSessionId: string | null
  /** Appends what the host's result adds right after `host_attached`. */
  afterAttach?: ((opened: HostOpened) => void) | undefined
}

/**
 * What {@link runInteractiveSession} returns: the host's result and when the
 * session ended. A harness session id the launch set in advance wins over the
 * host's.
 *
 * @experimental
 */
export interface InteractiveResult extends HostOpened {
  /** When the session ended, for a host that waits. `null` while it is still running. */
  endedAt: string | null
}

/**
 * Open an interactive session and record the result. If the host throws after
 * `beforeLaunch` wrote the record, the record is ended `failed`, so no record
 * is left `starting`. For a host that waits, the session is over when `open`
 * returns. Unless a hook already moved it, it goes to `running` and then ends
 * with the exit code. For a host that does not wait, the session is `running`
 * once attached.
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
 * The run a session belongs to, and whether this start created it (`minted`).
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
 * on purpose. It nests under the environment's run (`parentRun`) and counts as
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
 * The session and op invocation that launched session `id`, read from `env`.
 * Each is kept only if it is a live launcher. The parent session must have a
 * record (`parentRecord`) that had not ended before `startedAt`. The
 * invocation's process (the invocation pid tag) must be alive. Otherwise a
 * variable left in a long-lived shell, or by a crashed op, would create a false
 * parent link.
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
  // A pid of 0 or less is not a single process. `kill(0)` would signal a group.
  const live = Number.isInteger(pid) && pid > 0 && opts.pidAlive(pid)
  const invocation = raw.invocation !== null && live ? raw.invocation : null
  return session === null && invocation === null ? null : { session, invocation }
}
