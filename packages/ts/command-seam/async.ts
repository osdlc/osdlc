/**
 * The asynchronous capture runner: for long-running commands, where a
 * blocking `spawnSync` would freeze the event loop, and for running several
 * commands at once. It uses the same types as the sync runner:
 * {@link CommandResult}, {@link CommandRunOptions}, `CommandFailed`.
 *
 * Short commands run one after another are simpler on the sync runner:
 * blocking costs them nothing and keeps their callers synchronous.
 */

import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

import {
  groupExists,
  groupStartRefusal,
  releaseWhenEmpty,
  settleGroup,
  spawnTrackedGroup,
} from './groups.ts'
import {
  CommandFailed,
  cwdError,
  mergedEnv,
  normalizeOutputCap,
  normalizeTimeout,
  spawnFailure,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from './sync.ts'

/** {@link CommandRunOptions} plus cancellation, a spawn hook and process-group kill. */
export interface AsyncCommandRunOptions extends CommandRunOptions {
  /**
   * Abort the run: the child gets `SIGTERM`, then `SIGKILL` if it is still
   * running 1 s later. `SIGTERM` first lets a child such as git remove its
   * lock files. The promise resolves at once with `neverExited: true`,
   * `reason: 'abort'` and `The operation was aborted` in `error`.
   * The `SIGKILL` follow-up runs after the promise resolves. While a child
   * ignores `SIGTERM`, it keeps the host alive for up to 1 s. An
   * already-aborted signal stops the child the same way.
   */
  signal?: AbortSignal | undefined
  /**
   * Called once with the child's pid right after it spawns, before the
   * command finishes. Use it to record the process while it is still running,
   * for example in a pid file. Not called when the spawn fails (there is no
   * pid). If it throws, the child is killed and the run resolves with
   * `neverExited: true`, `reason: 'abort'` and `onSpawn threw: <message>` in
   * `error`.
   */
  onSpawn?: ((pid: number) => void) | undefined
  /**
   * Run the child as its own process-group leader, and send the timeout or
   * abort signals to the whole group, so processes it started die with it.
   * When the child exits but a group member still holds its output pipes,
   * the group gets `SIGKILL` once the exit grace ends. A member that does not
   * hold the pipes is left running after a normal exit.
   * The group no longer gets the terminal's Ctrl-C. To stop it on Ctrl-C,
   * listen for `SIGINT` and abort through `signal`, or call
   * `installGroupSignalForwarding`, which kills live groups when the host is
   * signalled; once it is stopping the host, a new group run is refused
   * (`neverExited: true`, `reason: 'abort'`). POSIX only.
   */
  processGroup?: boolean | undefined
}

/** The async form of {@link CommandRunner}: `run` returns a promise. */
export interface AsyncCommandRunner {
  /** The binary this runner runs, when it has one. See `CommandRunner.binary`. */
  readonly binary?: string | undefined
  /**
   * Run the binary with `argv` (without the binary name). The promise never
   * rejects for a failed command: a non-zero exit, a missing binary, a
   * timeout or an abort all resolve to a {@link CommandResult}. Programmer
   * errors reject: an invalid `timeoutMs` (see its doc) or a NUL byte in
   * argv or env.
   */
  run(argv: string[], opts: AsyncCommandRunOptions): Promise<CommandResult>
}

/**
 * The injected async runner when there is one, else `spawnRunnerAsync(binary)`.
 * The async version of `resolveRunner`.
 *
 * @param binary - The binary for the default runner.
 * @param injected - A runner to use instead, such as a test fake.
 */
export function resolveRunnerAsync(
  binary: string,
  injected?: AsyncCommandRunner | undefined,
): AsyncCommandRunner {
  return injected ?? spawnRunnerAsync(binary)
}

/**
 * How long to wait for stdio to close after the child has exited. A child
 * that leaves a background process holding its pipes would otherwise keep
 * the call open until that process exits.
 */
const EXIT_GRACE_MS = 250

/**
 * How long an aborted child has between `SIGTERM` and `SIGKILL`. Long enough
 * for git to remove its `.lock` files; short enough that a child that ignores
 * `SIGTERM` still stops soon.
 */
const ABORT_KILL_GRACE_MS = 1000

/**
 * The default {@link AsyncCommandRunner}: runs `binary` with `spawn`. The
 * promise never rejects for a failed command. A missing binary, a timeout or
 * an abort resolves with a non-zero `exitCode`, `neverExited: true` and a
 * `reason`, and `error` carries the runner's message.
 * Programmer errors (an invalid `timeoutMs`, a NUL byte in argv or env)
 * reject, and nothing is spawned.
 *
 * The result settles when the child's stdio closes, or 250 ms after the
 * child exits if a process it started still holds its pipes.
 * Either way `exitCode` is the child's own. In the second case the pipes
 * are closed: the background process loses any later output and may die of
 * `SIGPIPE` on its next write. With `processGroup`, the group is killed
 * instead. A timeout settles on the deadline, not when the pipes close.
 *
 * Output is captured through pipes with no size cap unless `maxOutputBytes`
 * is given. Under `bun test` with a
 * large module graph loaded, Bun can return empty output from child pipes.
 * The sync `spawnRunner` works around this; this runner does not.
 *
 * @param binary - A name looked up on `PATH`, or a path.
 * @returns A runner for that binary.
 *
 * @example
 * ```ts
 * const git = spawnRunnerAsync('git')
 * const controller = new AbortController()
 * const r = await git.run(['fetch', 'origin'], {
 *   cwd: '.',
 *   timeoutMs: 60_000,
 *   signal: controller.signal,
 * })
 * if (r.neverExited) console.error(r.error)
 * ```
 */
export function spawnRunnerAsync(binary: string): AsyncCommandRunner {
  return {
    binary,
    run(argv: string[], opts: AsyncCommandRunOptions): Promise<CommandResult> {
      return new Promise((resolve) => {
        // Inside the executor, so an invalid timeoutMs (or a throw from spawn)
        // rejects and nothing is spawned.
        const timeoutMs = normalizeTimeout(opts.timeoutMs)
        const cap = normalizeOutputCap(opts.maxOutputBytes) ?? Infinity
        const cwdMessage = cwdError(`spawn ${binary}`, binary, argv, opts)
        if (cwdMessage !== undefined) {
          resolve(spawnFailure(cwdMessage))
          return
        }
        const group = opts.processGroup === true
        const refusal = group ? groupStartRefusal() : undefined
        if (refusal !== undefined) {
          resolve({
            exitCode: 1,
            neverExited: true,
            reason: 'abort',
            stdout: '',
            stderr: '',
            error: refusal,
          })
          return
        }
        // Abort is handled below rather than through spawn's `signal` option,
        // which sends one SIGTERM to the direct child only: no SIGKILL
        // follow-up and no group.
        const start = () =>
          spawn(binary, argv, {
            cwd: opts.cwd,
            detached: group,
            ...mergedEnv(opts),
          })
        const { child, untrack: untrackGroup } = group
          ? spawnTrackedGroup(start)
          : { child: start(), untrack: undefined }
        // Set once this runner signals the child: a group it is stopping stays
        // in flight for the host's exit handler.
        let stopping = false
        const signalChild = (sig: NodeJS.Signals) => {
          stopping = true
          if (group && child.pid !== undefined) {
            try {
              process.kill(-child.pid, sig)
              return
            } catch {
              // The group is already gone; fall through to the direct child.
            }
          }
          child.kill(sig)
        }
        const hardKill = () => signalChild('SIGKILL')
        const groupGone = () => child.pid === undefined || !groupExists(child.pid)
        let stdout = ''
        let stderr = ''
        let stdinError: Error | undefined
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        let graceTimer: ReturnType<typeof setTimeout> | undefined
        let abortKillTimer: ReturnType<typeof setTimeout> | undefined
        // Set once the child exits; a later timeout or abort reports this
        // rather than a stand-in, since the command did answer.
        let exited: Omit<CommandResult, 'stdout' | 'stderr'> | undefined
        const onAbort = () => {
          signalChild('SIGTERM')
          // Outlives the settle on purpose. Not unref'd: an unref'd timer
          // does not reliably fire on every Bun version. Cleared when the
          // child exits, or in group mode when the group is already gone by
          // then.
          if (exited === undefined || (group && !groupGone())) {
            abortKillTimer = setTimeout(hardKill, ABORT_KILL_GRACE_MS)
          }
          if (exited !== undefined) finish(exited, stdinError?.message)
          else
            finish({ exitCode: 1, neverExited: true, reason: 'abort' }, 'The operation was aborted')
        }
        // Decoded through a StringDecoder rather than per-chunk `toString()`:
        // a multi-byte character straddling a chunk boundary would otherwise
        // be decoded as two partial sequences and each half replaced with
        // U+FFFD. The decoder holds the partial sequence back until the rest
        // of it arrives. (Both sync paths decode the whole buffer, or the
        // whole file, at once, so they do not need this.)
        const outDecoder = new StringDecoder('utf8')
        const errDecoder = new StringDecoder('utf8')
        // Bytes captured per stream, for `maxOutputBytes`.
        let outBytes = 0
        let errBytes = 0
        let capped: 'stdout' | 'stderr' | undefined
        /**
         * Settle once, with the streams flushed. `end()` is what surfaces a
         * sequence the decoder is still holding back when the output ends
         * mid-character — truncated capture, or bytes that were never UTF-8:
         * unflushed those bytes are dropped, so the result is shorter than
         * what the child wrote and disagrees with the sync runner. Every settle
         * path routes through here, so one flush covers every path.
         */
        const finish = (result: Omit<CommandResult, 'stdout' | 'stderr'>, error?: string) => {
          if (settled) return
          settled = true
          // The group can outlive the settle: a background member, or an aborted
          // group waiting for its SIGKILL. It stays registered until it is empty,
          // so a signal to the host still reaches the rest. Unless this runner
          // is stopping it, the host's exit leaves it running.
          if (untrackGroup !== undefined && child.pid !== undefined) {
            if (!stopping) settleGroup(child.pid)
            releaseWhenEmpty(child.pid, untrackGroup)
          }
          if (timer !== undefined) clearTimeout(timer)
          if (graceTimer !== undefined) clearTimeout(graceTimer)
          opts.signal?.removeEventListener('abort', onAbort)
          // Past the cap, a held-back partial character is the cut, not output.
          if (capped !== 'stdout') stdout += outDecoder.end()
          if (capped !== 'stderr') stderr += errDecoder.end()
          // Close the read ends. On `close` this is a no-op. On the other
          // paths a surviving grandchild may still hold the write ends and
          // keep writing. Handlers left installed would go on appending to
          // `stdout` / `stderr` after this promise resolved: an unbounded
          // heap leak in a long-lived host, which also keeps the grandchild
          // alive by draining what it writes.
          child.stdout?.destroy()
          child.stderr?.destroy()
          resolve({
            ...result,
            stdout,
            stderr,
            ...(error ? { error } : {}),
          })
        }
        /**
         * Stop at the cap: keep what fits, kill the child (or its group) and
         * settle as the sync runner does. The decoder holds back a character
         * the cut splits, and `finish` does not flush it, so the stream ends
         * on a character boundary.
         */
        const overCap = (name: 'stdout' | 'stderr', fits: Buffer) => {
          capped = name
          if (name === 'stdout') stdout += outDecoder.write(fits)
          else stderr += errDecoder.write(fits)
          hardKill()
          const message = `${name} passed maxOutputBytes (${cap} bytes)`
          // A child that exited keeps its answer; one that died by a signal
          // keeps `reason: 'signal'`, since `outputIncomplete` means it exited.
          if (exited !== undefined && exited.neverExited !== true) {
            finish({ ...exited, outputIncomplete: true }, message)
          } else if (exited !== undefined) finish(exited, message)
          else finish({ exitCode: 1, neverExited: true, reason: 'output' }, message)
        }
        child.stdout?.on('data', (d: Buffer) => {
          if (settled) return
          if (outBytes + d.length > cap) return overCap('stdout', d.subarray(0, cap - outBytes))
          outBytes += d.length
          stdout += outDecoder.write(d)
        })
        child.stderr?.on('data', (d: Buffer) => {
          if (settled) return
          if (errBytes + d.length > cap) return overCap('stderr', d.subarray(0, cap - errBytes))
          errBytes += d.length
          stderr += errDecoder.write(d)
        })
        child.on('error', (err) => {
          // A spawn failure: no exit code was ever reported, so the 1 is a
          // stand-in and the result says so.
          finish({ exitCode: 1, neverExited: true, reason: 'spawn' }, err.message)
        })
        const fromExit = (
          code: number | null,
          signal: NodeJS.Signals | null,
        ): Omit<CommandResult, 'stdout' | 'stderr'> => ({
          exitCode: code ?? 1,
          ...(code === null
            ? {
                neverExited: true as const,
                reason: 'signal' as const,
                ...(signal === null ? {} : { signal }),
              }
            : {}),
        })
        child.on('exit', (code, signal) => {
          exited = fromExit(code, signal)
          // A group can outlive its leader; keep the follow-up while it does.
          if (abortKillTimer !== undefined && (!group || groupGone())) {
            clearTimeout(abortKillTimer)
          }
          if (settled) return
          const result = exited
          // `close` normally follows at once. If it does not, a process the
          // child started still holds the pipes. The immediate lets output
          // already in the pipes be read before settling.
          graceTimer = setTimeout(
            () =>
              setImmediate(() => {
                // A group member holds the pipes. Without a group there is no
                // handle on it: the direct child is gone, and only `finish`
                // closing the pipes reaches the background process.
                if (group && !settled) hardKill()
                finish(result, stdinError?.message)
              }),
            EXIT_GRACE_MS,
          )
        })
        child.on('close', (code, signal) => {
          finish(fromExit(code, signal), stdinError?.message)
        })
        // `child.stdin` is its own emitter — an `error` on it never reaches the
        // `child.on("error")` handler above, and an unhandled `error` on an
        // emitter is rethrown as an uncaught exception that takes the host
        // process down. A child that closes its read end before `input` drains
        // (it exits, or closes fd 0) fails the write (EPIPE, or ENOTCONN under
        // some timings). That is not a command failure: the child ran, and its
        // own exit code is the result.
        // But it does mean the child read only part of `input`, so the message
        // rides out in `error`, the way a spawn error already does. (A write
        // error that lands after the promise settles is only swallowed —
        // nothing left to report it on.)
        child.stdin?.on('error', (err) => {
          stdinError = err
        })
        if (child.pid !== undefined && opts.onSpawn !== undefined) {
          try {
            opts.onSpawn(child.pid)
          } catch (err) {
            // Called once every handler is installed, so a throw here can
            // still kill the child and settle rather than reject and leave
            // it running untracked.
            hardKill()
            const message = err instanceof Error ? err.message : String(err)
            finish({ exitCode: 1, neverExited: true, reason: 'abort' }, `onSpawn threw: ${message}`)
          }
        }
        if (!settled) {
          if (opts.signal?.aborted === true) onAbort()
          else opts.signal?.addEventListener('abort', onAbort, { once: true })
        }
        if (!settled && timeoutMs !== undefined) {
          // The timeout is enforced here rather than handed to spawn's own
          // `timeout` option, which is a no-op on some Bun versions. Not
          // unref'd: an unref'd timer does not reliably fire on every Bun
          // version, and `finish` clears it, so it never outlives the call.
          timer = setTimeout(() => {
            // SIGKILL, not the default SIGTERM: the contract is a hard cap and
            // the child is by assumption already hung, so a signal it may trap
            // or ignore is no cap at all. This matches the sync and streaming
            // runners, which cannot escalate. An abort, by contrast, is a
            // request to stop and sends SIGTERM first.
            hardKill()
            if (exited !== undefined) {
              finish(exited, stdinError?.message)
              return
            }
            // Settle here rather than leaving it to `close`. `close` waits for
            // the stdio pipes to hit EOF, and a forked grandchild survives the
            // kill still holding the write ends. So resolve on the deadline
            // with the output captured so far.
            finish(
              { exitCode: 1, neverExited: true, reason: 'timeout' },
              `timed out after ${timeoutMs}ms`,
            )
          }, timeoutMs)
        }
        if (opts.input !== undefined) child.stdin?.end(opts.input)
        else child.stdin?.end()
      })
    },
  }
}

/**
 * The async version of `runChecked`: run a command and reject if it fails.
 * Like `runChecked`, it takes the runner's own options, so a `withDefaults`
 * runner needs only the options it did not bind.
 *
 * @param argv - Arguments, without the binary name.
 * @returns The result, when `exitCode` is 0.
 * @throws `CommandFailed` (as a rejection) when `exitCode` is not 0.
 */
export async function runCheckedAsync(
  runner: AsyncCommandRunner,
  argv: string[],
  opts: AsyncCommandRunOptions,
): Promise<CommandResult>
export async function runCheckedAsync<P extends unknown[]>(
  runner: {
    readonly binary?: string | undefined
    run(argv: string[], ...opts: P): Promise<CommandResult>
  },
  argv: string[],
  ...opts: NoInfer<P>
): Promise<CommandResult>
export async function runCheckedAsync(
  runner: {
    readonly binary?: string | undefined
    run(argv: string[], ...opts: unknown[]): Promise<CommandResult>
  },
  argv: string[],
  ...opts: unknown[]
): Promise<CommandResult> {
  const result = await runner.run(argv, ...opts)
  if (result.exitCode !== 0) throw new CommandFailed(argv, result, runner.binary)
  return result
}

/**
 * Wrap a sync runner as an async one, so one test fake serves both forms.
 * `signal`, `onSpawn` and `processGroup` are ignored: a sync runner cannot be
 * cancelled mid-flight and reports no pid. A throw from the sync runner
 * becomes a rejection.
 *
 * @param runner - The sync runner to wrap.
 * @returns An async runner that calls `runner`.
 */
export function asAsync(runner: CommandRunner): AsyncCommandRunner {
  return {
    ...(runner.binary === undefined ? {} : { binary: runner.binary }),
    run: async (argv, opts) => runner.run(argv, opts),
  }
}

/**
 * The async version of `mapFailed`: awaits `fn`, so a rejected
 * `CommandFailed` is mapped. `mapper` may be sync or async, so it can await
 * more context, such as a log file, before building the error.
 *
 * @param fn - The code to run, usually a `runCheckedAsync` call.
 * @param mapper - Turns the failure into the error to reject with.
 * @returns What `fn` resolves to.
 * @throws The error `mapper` returns or resolves to, when `fn` rejects with
 * `CommandFailed`. A rejection from `mapper` itself passes through.
 * @experimental
 */
export async function mapFailedAsync<T>(
  fn: () => Promise<T>,
  mapper: (failed: CommandFailed) => Error | Promise<Error>,
): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof CommandFailed) throw await mapper(e)
    throw e
  }
}

/**
 * The async version of `catchFailed`: awaits `fn`. `onFailed` may be sync or
 * async.
 *
 * @param fn - The code to run, usually a `runCheckedAsync` call.
 * @param onFailed - Turns the failure into a value.
 * @returns What `fn` resolves to, or what `onFailed` returns.
 * @experimental
 */
export async function catchFailedAsync<T, R>(
  fn: () => Promise<T>,
  onFailed: (failed: CommandFailed) => R | Promise<R>,
): Promise<T | R> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof CommandFailed) return onFailed(e)
    throw e
  }
}
