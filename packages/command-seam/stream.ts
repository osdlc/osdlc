/**
 * The streaming runner: the {@link StreamRunner} interface and its
 * `spawnSync`-backed default, {@link streamRunner}.
 *
 * Use it for a command whose output a person must see live: a build, a test
 * run, or an interactive program. The capture runners would hold all output
 * until the child exited. Options are {@link CommandRunOptions} without
 * `input`, since stdin is inherited, not piped. Code takes a `StreamRunner`
 * the same way it takes a `CommandRunner`, and tests pass a fake. Mixed stdio
 * (say, a child's stdout sent to the parent's stderr) is out of scope; call
 * `child_process` directly for that.
 *
 * There is no async version: `run` blocks until the child exits, as
 * `spawnRunner` does.
 */

import { spawnSync } from 'node:child_process'

import {
  cwdError,
  mergedEnv,
  normalizeTimeout,
  syncStop,
  type CommandRunOptions,
  type NeverExitedReason,
} from './sync.ts'

/**
 * Per-call options for a {@link StreamRunner}. Same as {@link
 * CommandRunOptions} minus `input`: stdin is inherited from the parent
 * process, not fed programmatically, so there is nothing to write to.
 */
export type StreamRunOptions = Omit<CommandRunOptions, 'input'>

/**
 * Result of a streamed run. There is no output to report, since it went
 * straight to the inherited stdio; only how the child ended.
 */
export interface StreamResult {
  /** The child's exit code, or `1` when it never reported one (see `neverExited`). */
  exitCode: number
  /**
   * The child never reported an exit status: the spawn failed, the timeout
   * killed it, or a signal took it down. Same meaning as
   * `CommandResult.neverExited`. A message is also written to the parent's
   * stderr.
   */
  neverExited?: boolean | undefined
  /**
   * Why the child never reported an exit status: `spawn`, `timeout` or
   * `signal` (a streamed run cannot be aborted, and its output is not
   * captured, so there is no cap). Set whenever `neverExited`
   * is, absent otherwise.
   */
  reason?: Exclude<NeverExitedReason, 'abort' | 'output'> | undefined
  /**
   * The signal that ended the child, for `reason: 'signal'` and
   * `reason: 'timeout'` (`SIGKILL`).
   */
  signal?: NodeJS.Signals | undefined
  /**
   * The runner's error message when the spawn failed or the timeout fired,
   * such as `spawnSync npm ENOENT`. The same text is written to the parent's
   * stderr.
   */
  error?: string | undefined
}

/** Runs a binary with inherited stdio instead of capturing it. */
export interface StreamRunner {
  /**
   * Run the binary with `argv` (without the binary name) and wait for it to
   * exit. Never throws for a failed command. Programmer errors throw: an
   * invalid `timeoutMs` (see `CommandRunOptions.timeoutMs`) or a NUL byte in
   * argv or env.
   */
  run(argv: string[], opts: StreamRunOptions): StreamResult
}

/**
 * The default {@link StreamRunner}: runs `binary` with `spawnSync` and
 * `stdio: 'inherit'`, so the child's prompts, progress and output reach the
 * terminal directly. It behaves like a direct `spawnSync` call, but code
 * takes it as a parameter, so tests can pass a fake. On timeout the direct
 * child gets `SIGKILL`. Processes it started keep running: this runner has
 * no `processGroup` option.
 *
 * When the spawn fails, the timeout fires or a signal ends the child, a
 * message is written to the parent's stderr, since there is no captured
 * stderr to carry it. The result says why in `reason`, and carries the spawn
 * or timeout message in `error`.
 *
 * @param binary - A name looked up on `PATH`, or a path.
 * @returns A runner for that binary.
 *
 * @example
 * ```ts
 * const npm = streamRunner('npm')
 * const { exitCode } = npm.run(['run', 'build'], { cwd: '.' })
 * process.exitCode = exitCode
 * ```
 */
export function streamRunner(binary: string): StreamRunner {
  return {
    run(argv: string[], opts: StreamRunOptions): StreamResult {
      const timeout = normalizeTimeout(opts.timeoutMs)
      const cwdMessage = cwdError(`spawnSync ${binary}`, binary, argv, opts)
      if (cwdMessage !== undefined) {
        process.stderr.write(`${cwdMessage}\n`)
        return { exitCode: 1, neverExited: true, reason: 'spawn', error: cwdMessage }
      }
      const proc = spawnSync(binary, argv, {
        cwd: opts.cwd,
        stdio: 'inherit',
        timeout,
        // See `sync.ts`'s `runViaChildRedirect`: the default SIGTERM is not a
        // hard cap.
        killSignal: 'SIGKILL',
        ...mergedEnv(opts),
      })
      // `spawnSync` reports a stop as a missing `status` (null, or undefined
      // under Bun for a failed spawn), with `error` and `signal` saying why.
      if (proc.status != null) return { exitCode: proc.status }
      // Output is inherited, not buffered, so the output cap cannot apply.
      const stop = syncStop(proc) as Pick<StreamResult, 'reason' | 'signal'>
      if (proc.error !== undefined) {
        process.stderr.write(`${proc.error.message}\n`)
        return { exitCode: 1, neverExited: true, ...stop, error: proc.error.message }
      }
      process.stderr.write(`${binary} was killed by ${proc.signal}\n`)
      return { exitCode: 1, neverExited: true, ...stop }
    },
  }
}
