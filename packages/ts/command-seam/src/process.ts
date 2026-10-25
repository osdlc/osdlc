/**
 * The managed-process runner: start a long-running child and get a handle to
 * it, for a process the caller watches and stops rather than waits on.
 *
 * Every other runner in this package waits for the child to exit
 * (synchronously or through a promise) and reports how it went. This one
 * returns as soon as the child starts, so the caller can do other work while
 * it runs, such as apply its own timeout, respond to signals, or stop it
 * later.
 */

import { spawn } from 'node:child_process'
import { constants } from 'node:os'

import { groupStartRefusal, releaseWhenEmpty, settleGroup, spawnTrackedGroup } from './groups.ts'
import { planOptions, spawnPlan } from './spawn-plan.ts'
import {
  childStdio,
  cwdError,
  mergedEnv,
  timerMs,
  type EnvOverrides,
  type NeverExitedReason,
  type StdioOption,
} from './sync.ts'

/** Per-call options for a {@link ManagedProcessRunner}. */
export interface ManagedProcessRunOptions {
  /** Working directory for the child. */
  cwd: string
  /**
   * Variables merged over the parent's environment. An `undefined` value
   * removes that variable from the child's environment.
   */
  env?: EnvOverrides | undefined
  /**
   * Run the child as its own process-group leader. {@link
   * ManagedProcessHandle.kill} then signals the whole group instead of just
   * the direct child, so processes the child started die with it. The group
   * no longer gets the terminal's Ctrl-C. POSIX only: on Windows `kill()`
   * stops the direct child alone.
   *
   * `installGroupSignalForwarding` kills live groups when the host is
   * signalled. Once forwarding is stopping the host, a new group run is
   * refused (`reason: 'abort'`, pid `-1`).
   */
  processGroup?: boolean | undefined
  /**
   * Let the parent exit while the child runs. The child's handle no longer
   * keeps the parent's event loop open. It is meant for a `processGroup`
   * child that should outlive the call that started it, such as a loop tick
   * that starts a run and returns. {@link ManagedProcessHandle.exited} then
   * settles only while the parent is still alive. An `unref`'d group is not
   * tracked by `installGroupSignalForwarding`. A signal to the parent does not
   * reach it, and the parent's exit does not `SIGKILL` it.
   *
   * To launch a program and leave it running after the parent exits (an
   * editor, a browser), add `processGroup: true` so the terminal's signals do not
   * reach it, and `stdio: 'ignore'` so it does not write to the parent's
   * terminal after the parent exits.
   */
  unref?: boolean | undefined
  /**
   * Where the child's stdio goes: `'inherit'` (the default), `'ignore'`, or
   * `{ stdout, stderr }` file descriptors, with stdin from `/dev/null`. See
   * {@link StdioOption}. An fd that is not open settles `exited` with
   * `reason: 'spawn'`.
   */
  stdio?: StdioOption | undefined
}

/** How a managed process ended. */
export interface ManagedProcessExit {
  /** The child's exit code, or `1` when it never reported one (see `neverExited`). */
  exitCode: number
  /** The signal that ended the child, or `null` when it exited on its own or never started. */
  signal: NodeJS.Signals | null
  /**
   * No exit code was reported: the spawn failed (such as a missing binary) or
   * a signal killed the process (see `signal`). Same meaning as
   * `CommandResult.neverExited`.
   */
  neverExited?: boolean | undefined
  /**
   * Why no exit code was reported. Set whenever `neverExited` is, absent
   * otherwise.
   *
   * - `spawn`: the process never started (see `error`).
   * - `abort`: a signal ended it after the caller's own `kill()`. Also a
   *   `processGroup` run refused because signal forwarding is stopping the
   *   host. That run never started (see `error`).
   * - `signal`: a signal from elsewhere ended it.
   *
   * There is no `timeout` or `output`, since this runner has neither a
   * timeout nor captured output.
   */
  reason?: Exclude<NeverExitedReason, 'timeout' | 'output'> | undefined
  /**
   * The spawn error's message, such as `spawn node ENOENT`, when `reason` is
   * `spawn`, or the refusal message for a refused `processGroup` run.
   */
  error?: string | undefined
}

/** A running child: its pid, a way to kill it, and a promise that settles once it is gone. */
export interface ManagedProcessHandle {
  /** The child's pid, or `-1` when it could not be spawned at all. */
  readonly pid: number
  /**
   * Send `signal` (default `SIGTERM`) to the child, or to its whole process
   * group when started with `processGroup: true`. Does nothing when `pid` is
   * `-1`. Without `processGroup`, it also does nothing once the child has
   * exited, so a reused pid is never signalled. With `processGroup`, it still
   * signals any member of the group that is left. If the process dies of a
   * signal sent here, `exited` reports `reason: 'abort'`. A signal the child
   * handles and survives does not count. A later death by another signal is
   * `'signal'`.
   */
  kill(signal?: NodeJS.Signals | number): void
  /** Settles once the child is gone, including when the spawn failed. Never rejects. */
  readonly exited: Promise<ManagedProcessExit>
}

/** Starts a long-running process and returns a handle instead of waiting for it. */
export interface ManagedProcessRunner {
  /**
   * Start the binary with `argv` (without the binary name) and return at
   * once. A failed spawn is reported through `exited`, not thrown. A NUL
   * byte in argv or env, or an invalid `stdio`, is a programmer error and
   * throws.
   */
  run(argv: string[], opts: ManagedProcessRunOptions): ManagedProcessHandle
}

/**
 * The default {@link ManagedProcessRunner}: starts `binary` with `spawn`.
 * Stdio is inherited unless `stdio` says otherwise, so by default the
 * child's output reaches the terminal. It does not capture output and has
 * no timeout of its own.
 *
 * @param binary - A name looked up on `PATH`, or a path. On Windows a `.cmd`
 *   or `.bat` file runs through `cmd.exe` (see the README's Platforms section).
 * @returns A runner for that binary.
 *
 * @example
 * ```ts
 * const server = managedProcessRunner('node').run(['server.js'], {
 *   cwd: '.',
 *   processGroup: true,
 * })
 * setTimeout(() => server.kill(), 5_000)
 * const { exitCode, signal } = await server.exited
 *
 * // Fire and forget: the editor outlives this process and stays off its terminal.
 * managedProcessRunner('code').run(['.'], {
 *   cwd: '.',
 *   processGroup: true,
 *   unref: true,
 *   stdio: 'ignore',
 * })
 * ```
 */
export function managedProcessRunner(binary: string): ManagedProcessRunner {
  return {
    run(argv: string[], opts: ManagedProcessRunOptions): ManagedProcessHandle {
      const stdio = childStdio(opts.stdio)
      const cwdMessage = cwdError(`spawn ${binary}`, binary, argv, opts)
      if (cwdMessage !== undefined) {
        return { pid: -1, kill: () => {}, exited: Promise.resolve(spawnExit(cwdMessage)) }
      }
      const plan = spawnPlan(binary, argv, opts)
      if ('refusal' in plan) {
        return { pid: -1, kill: () => {}, exited: Promise.resolve(spawnExit(plan.refusal)) }
      }
      const group = opts.processGroup === true
      const refusal = group ? groupStartRefusal() : undefined
      if (refusal !== undefined) {
        return { pid: -1, kill: () => {}, exited: Promise.resolve(refusedExit(refusal)) }
      }
      const start = () =>
        spawn(plan.file, plan.args, {
          ...planOptions(plan),
          cwd: opts.cwd,
          detached: group,
          stdio,
          ...mergedEnv(opts),
        })
      let spawned: { child: ReturnType<typeof start>; untrack: (() => void) | undefined }
      try {
        // An `unref`'d group is meant to outlive the host, so forwarding must not reap it.
        spawned =
          group && opts.unref !== true
            ? spawnTrackedGroup(start)
            : { child: start(), untrack: undefined }
      } catch (e) {
        // `spawn` throws, rather than emitting `error`, for some failures,
        // such as an fd in `stdio` that is not open (EBADF). A system error
        // has an `errno`. A programmer error, such as a NUL byte, does not.
        if (typeof (e as NodeJS.ErrnoException).errno !== 'number') throw e
        const exit = spawnExit((e as Error).message)
        return { pid: -1, kill: () => {}, exited: Promise.resolve(exit) }
      }
      const { child, untrack: untrackGroup } = spawned
      const pid = child.pid ?? -1
      if (opts.unref === true) child.unref()
      // The signals `kill()` has sent. A death by one of them is the caller's
      // own stop. A death by any other signal came from elsewhere.
      const sent = new Set<NodeJS.Signals>()

      const exited = new Promise<ManagedProcessExit>((resolve) => {
        let settled = false
        const finish = (result: ManagedProcessExit): void => {
          if (settled) return
          settled = true
          resolve(result)
        }
        // A spawn failure (such as ENOENT). No exit was reported. A failed
        // `kill()` (such as EPERM) also emits `error`, but the process is
        // still running, so its exit settles this.
        child.on('error', (err) => {
          if ((err as NodeJS.ErrnoException).syscall === 'kill') return
          untrackGroup?.()
          finish(spawnExit(err.message))
        })
        child.on('exit', (code, signal) => {
          // The leader is gone, but the group may not be. Stay registered until
          // no member is left, so a signal to the host still reaches the rest.
          // Unless `kill()` is stopping it, the host's exit leaves it running.
          if (untrackGroup !== undefined) {
            if (sent.size === 0) settleGroup(pid)
            releaseWhenEmpty(pid, untrackGroup)
          }
          finish({
            exitCode: code ?? 1,
            signal,
            ...(code === null
              ? {
                  neverExited: true as const,
                  reason:
                    signal !== null && sent.has(signal) ? ('abort' as const) : ('signal' as const),
                }
              : {}),
          })
        })
      })

      return {
        pid,
        kill(signal: NodeJS.Signals | number = 'SIGTERM'): void {
          if (pid === -1) return
          // A negative pid signals the whole process group (see
          // `processGroup`). The direct child goes through `child.kill`,
          // which does nothing once the child has been reaped, so a reused
          // pid is never signalled.
          let delivered = false
          if (group) {
            try {
              delivered = process.kill(-pid, signal)
            } catch {
              // The group is gone, or the OS has no groups (Windows). Signal
              // the direct child instead.
            }
          }
          try {
            if (!delivered) delivered = child.kill(signal)
          } catch {
            // A signal this OS cannot send.
          }
          const name = typeof signal === 'number' ? signalName(signal) : signal
          if (delivered && name !== undefined) sent.add(name)
        },
        exited,
      }
    },
  }
}

/**
 * Stop a managed process: send `SIGTERM`, wait up to `graceMs` for it to
 * exit, then send `SIGKILL`. A plain `kill()` sends one signal, so a process
 * that ignores `SIGTERM` would leave `await handle.exited` waiting forever.
 *
 * Works with any {@link ManagedProcessHandle}, fakes included. It waits for
 * the handle's own process only. With `processGroup`, a group member that
 * outlives the leader is not sent `SIGKILL`.
 *
 * @param handle - The process to stop.
 * @param opts - `graceMs`: how long to wait after `SIGTERM`. Default `5_000`.
 * `0` sends `SIGKILL` right after `SIGTERM`. `Infinity` never sends it. A
 * value above 2^31 - 1, the largest timer delay, is clamped to it. A
 * negative value or `NaN` rejects with `RangeError`, a non-number with
 * `TypeError`.
 * @returns How the process ended. `reason` is `'abort'` when one of the two
 * signals ended it.
 *
 * @example
 * ```ts
 * const server = managedProcessRunner('node').run(['server.js'], { cwd: '.' })
 * const exit = await stopProcess(server, { graceMs: 2_000 })
 * ```
 *
 * @experimental
 */
export async function stopProcess(
  handle: ManagedProcessHandle,
  opts: { graceMs?: number | undefined } = {},
): Promise<ManagedProcessExit> {
  const graceMs = timerMs('graceMs', opts.graceMs ?? 5_000, 'zero')
  handle.kill()
  if (graceMs === undefined) return handle.exited
  let timer: ReturnType<typeof setTimeout> | undefined
  const grace = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, graceMs, undefined)
  })
  const exit = await Promise.race([handle.exited, grace])
  clearTimeout(timer)
  if (exit !== undefined) return exit
  handle.kill('SIGKILL')
  return handle.exited
}

/** The exit of a `processGroup` run refused because signal forwarding is stopping the host. */
function refusedExit(error: string): ManagedProcessExit {
  return { exitCode: 1, signal: null, neverExited: true, reason: 'abort', error }
}

/** The exit of a process that never started. */
function spawnExit(error: string): ManagedProcessExit {
  return { exitCode: 1, signal: null, neverExited: true, reason: 'spawn', error }
}

/** The name of signal number `n`, or `undefined` for 0 (a probe) and unknown numbers. */
export function signalName(n: number): NodeJS.Signals | undefined {
  for (const [name, value] of Object.entries(constants.signals)) {
    if (value === n) return name as NodeJS.Signals
  }
  return undefined
}
