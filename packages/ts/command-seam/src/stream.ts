/**
 * The streaming runner: the {@link StreamRunner} interface and its
 * `spawnSync`-backed default, {@link streamRunner}.
 *
 * Use it for a command whose output a person must see live: a build, a test
 * run, or an interactive program. The capture runners would hold all output
 * until the child exited. Options are {@link CommandRunOptions} without
 * `input`, since stdin is inherited, not piped, plus `stdio` and `quiet`.
 * Code takes a `StreamRunner` the same way it takes a `CommandRunner`, and
 * tests pass a fake. `stdio` can send stdout and stderr to file descriptors
 * the caller opened. A pipe from one child to another is out of scope. Call
 * `child_process` directly for that.
 *
 * There is no async version. `run` blocks until the child exits, as
 * `spawnRunner` does.
 */

import { spawnSync } from 'node:child_process'

import {
  childStdio,
  cwdError,
  mergedEnv,
  normalizeTimeout,
  syncStop,
  type CommandRunOptions,
  type NeverExitedReason,
  type StdioOption,
} from './sync.ts'

/**
 * Per-call options for a {@link StreamRunner}. Same as {@link
 * CommandRunOptions} minus `input` and `maxOutputBytes`: stdio is not piped,
 * so there is nothing to write to and no output to cap. Adds `stdio` and
 * `quiet`.
 */
export interface StreamRunOptions extends Omit<CommandRunOptions, 'input' | 'maxOutputBytes'> {
  /**
   * Where the child's stdio goes: `'inherit'` (the default), `'ignore'`, or
   * `{ stdout, stderr }` file descriptors, with stdin from `/dev/null`. See
   * {@link StdioOption}. The runner's own failure line still goes to the
   * parent's stderr, unless `quiet` is set.
   */
  stdio?: StdioOption | undefined
  /**
   * Do not write the runner's own line to the parent's stderr when the spawn
   * fails, the timeout fires or a signal ends the child. For a caller that
   * reports the failure itself from the result's `reason`, `signal` and
   * `error`, which are set either way.
   */
  quiet?: boolean | undefined
}

/**
 * Result of a streamed run. It has no output, since the output went straight
 * to the child's stdio. It says only how the child ended.
 */
export interface StreamResult {
  /** The child's exit code, or `1` when it never reported one (see `neverExited`). */
  exitCode: number
  /**
   * The child never reported an exit status: the spawn failed, the timeout
   * killed it, or a signal ended it. Same meaning as
   * `CommandResult.neverExited`. A message is also written to the parent's
   * stderr, unless `quiet` is set.
   */
  neverExited?: boolean | undefined
  /**
   * Why the child never reported an exit status: `spawn`, `timeout` or
   * `signal` (a streamed run cannot be aborted, and its output is not
   * captured, so there is no cap). Set whenever `neverExited` is, absent
   * otherwise.
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
   * stderr, unless `quiet` is set.
   */
  error?: string | undefined
}

/** Runs a binary with inherited stdio instead of capturing it. */
export interface StreamRunner {
  /**
   * Run the binary with `argv` (without the binary name) and wait for it to
   * exit. Never throws for a failed command. Programmer errors throw: an
   * invalid `timeoutMs` (see `CommandRunOptions.timeoutMs`) or `stdio`, or a
   * NUL byte in argv or env.
   */
  run(argv: string[], opts: StreamRunOptions): StreamResult
}

/**
 * The default {@link StreamRunner}: runs `binary` with `spawnSync` and
 * `stdio: 'inherit'`, so the child's prompts, progress and output reach the
 * terminal directly. It behaves like a direct `spawnSync` call, but code
 * takes it as a parameter, so tests can pass a fake. On timeout the direct
 * child gets `SIGKILL`. Processes it started keep running, because this
 * runner has no `processGroup` option. A run that may start background work (an install
 * with postinstall scripts, a daemon) belongs on `spawnRunnerAsync` or
 * `managedProcessRunner` with `processGroup: true`.
 *
 * When the spawn fails, the timeout fires or a signal ends the child, a
 * message is written to the parent's stderr, since there is no captured
 * stderr to hold it. `quiet` turns it off. The result says why in `reason`,
 * and carries the spawn or timeout message in `error`.
 *
 * `stdio` sends the child's output elsewhere: `'ignore'` drops it, and
 * `{ stdout, stderr }` writes it to file descriptors the caller opened.
 *
 * @param binary - A name looked up on `PATH`, or a path.
 * @returns A runner for that binary.
 *
 * @example
 * ```ts
 * const npm = streamRunner('npm')
 * const { exitCode } = npm.run(['run', 'build'], { cwd: '.' })
 * process.exitCode = exitCode
 *
 * // Both streams into one log, in the order npm wrote them.
 * const log = openSync('build.log', 'w')
 * npm.run(['run', 'build'], { cwd: '.', stdio: { stdout: log, stderr: log }, quiet: true })
 * closeSync(log)
 * ```
 */
export function streamRunner(binary: string): StreamRunner {
  return {
    run(argv: string[], opts: StreamRunOptions): StreamResult {
      const timeout = normalizeTimeout(opts.timeoutMs)
      const stdio = childStdio(opts.stdio)
      const say = (line: string) => {
        if (opts.quiet !== true) process.stderr.write(`${line}\n`)
      }
      const cwdMessage = cwdError(`spawnSync ${binary}`, binary, argv, opts)
      if (cwdMessage !== undefined) {
        say(cwdMessage)
        return { exitCode: 1, neverExited: true, reason: 'spawn', error: cwdMessage }
      }
      const proc = spawnSync(binary, argv, {
        cwd: opts.cwd,
        stdio,
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
        say(proc.error.message)
        return { exitCode: 1, neverExited: true, ...stop, error: proc.error.message }
      }
      say(`${binary} was killed by ${proc.signal}`)
      return { exitCode: 1, neverExited: true, ...stop }
    },
  }
}
