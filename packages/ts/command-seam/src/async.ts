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
import { planOptions, spawnPlan } from './spawn-plan.ts'
import {
  CommandFailed,
  cwdError,
  emptyStdout,
  isCommandFailed,
  lookupBinary,
  mergedEnv,
  normalizeOutputCap,
  normalizeTimeout,
  notOnAbsolutePath,
  spawnFailure,
  type BytesCommandRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
  type SpawnRunnerOptions,
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
   *
   * The group no longer gets the terminal's Ctrl-C. To stop it on Ctrl-C,
   * listen for `SIGINT` and abort through `signal`, or call
   * `installGroupSignalForwarding`, which kills live groups when the host is
   * signalled. Once forwarding is stopping the host, a new group run is
   * refused (`neverExited: true`, `reason: 'abort'`). POSIX only.
   */
  processGroup?: boolean | undefined
  /**
   * Kill the child's whole process tree, not only the child, when the run
   * is stopped: on a timeout, an abort, the output cap or an `onSpawn` throw.
   * Use it for a command that forks, such as a build tool, so a stopped run
   * leaves nothing behind.
   *
   * On POSIX this is `processGroup: true`, with everything its doc says,
   * Ctrl-C included. On Windows the runner first runs
   * `taskkill /pid <pid> /t /f`, with `taskkill` found on absolute `PATH`
   * entries only, and then kills the child. It does this only while the
   * child is still running, since a pid can be reused after an exit. A
   * process that has left the tree (its parent exited first) is not reached.
   */
  killTree?: boolean | undefined
}

/** The async form of {@link CommandRunner}: `run` returns a promise. */
export interface AsyncCommandRunner {
  /** The binary this runner runs, when it has one. See `CommandRunner.binary`. */
  readonly binary?: string | undefined
  /**
   * Run the binary with `argv` (without the binary name). The promise never
   * rejects for a failed command. A non-zero exit, a missing binary, a
   * timeout or an abort all resolve to a {@link CommandResult}. Programmer
   * errors reject: an invalid `timeoutMs` (see its doc) or a NUL byte in
   * argv or env.
   */
  run(argv: string[], opts: AsyncCommandRunOptions): Promise<CommandResult>
}

/**
 * The async form of `BytesCommandRunner`: `run` resolves to a result whose
 * stdout is a `Buffer`. `runCheckedAsync` takes it too.
 *
 * @experimental
 */
export interface AsyncBytesCommandRunner {
  /** The binary this runner runs, when it has one. See `CommandRunner.binary`. */
  readonly binary?: string | undefined
  /** As `AsyncCommandRunner.run`, with stdout as a `Buffer`. */
  run(argv: string[], opts: AsyncCommandRunOptions): Promise<CommandResult<Buffer>>
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
 * How long an aborted child has between `SIGTERM` and `SIGKILL`. It is long
 * enough for git to remove its `.lock` files, and short enough that a child
 * that ignores `SIGTERM` still stops soon.
 */
const ABORT_KILL_GRACE_MS = 1000

/**
 * The default {@link AsyncCommandRunner}: runs `binary` with `spawn`. The
 * promise never rejects for a failed command. A missing binary, a timeout or
 * an abort resolves with a non-zero `exitCode`, `neverExited: true` and a
 * `reason`, and `error` holds the runner's message. Programmer errors (an
 * invalid `timeoutMs`, a NUL byte in argv or env) reject, and nothing is
 * spawned.
 *
 * The result settles when the child's stdio closes, or 250 ms after the
 * child exits if a process it started still holds its pipes. Either way
 * `exitCode` is the child's own. In the second case the pipes are closed.
 * The background process loses any later output and may die of `SIGPIPE` on
 * its next write. With `processGroup`, the group is also killed. A timeout
 * settles on the deadline, not when the pipes close.
 *
 * Output is captured through pipes with no size cap unless `maxOutputBytes`
 * is given. Under `bun test` with a large module graph loaded, Bun can
 * return empty output from child pipes.
 * The sync `spawnRunner` works around this; this runner does not.
 *
 * @param binary - A name looked up on `PATH`, or a path. On Windows a `.cmd`
 *   or `.bat` file runs through `cmd.exe` (see the README's Platforms section).
 * @param options - See `SpawnRunnerOptions`; `absolutePathOnly` searches
 *   absolute `PATH` entries only.
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
export function spawnRunnerAsync(
  binary: string,
  options: SpawnRunnerOptions = {},
): AsyncCommandRunner {
  return {
    binary,
    run: async (argv, opts) => {
      const target = lookupBinary(binary, options, opts)
      if (target === undefined) return spawnFailure(notOnAbsolutePath('spawn', binary))
      return (await runAsync(target, argv, opts, false)) as CommandResult
    },
  }
}

/**
 * An {@link AsyncBytesCommandRunner}: {@link spawnRunnerAsync} with stdout
 * returned as the bytes the child wrote, never decoded. Stderr is decoded as
 * UTF-8, so `failureText` and `CommandFailed` read as they do for text.
 * `maxOutputBytes` cuts stdout at exactly the cap. Everything else is as for
 * `spawnRunnerAsync`. The sync form is `spawnRunnerBytes`.
 *
 * @param binary - A name looked up on `PATH`, or a path. On Windows a `.cmd`
 *   or `.bat` file runs through `cmd.exe` (see the README's Platforms section).
 * @returns A runner for that binary.
 *
 * @example
 * ```ts
 * const git = spawnRunnerBytesAsync('git')
 * const r = await runCheckedAsync(git, ['cat-file', 'blob', sha], { cwd: '.' })
 * const digest = createHash('sha256').update(r.stdout).digest('hex')
 * ```
 *
 * @experimental
 */
export function spawnRunnerBytesAsync(binary: string): AsyncBytesCommandRunner {
  return {
    binary,
    run: (argv, opts) => runAsync(binary, argv, opts, true) as Promise<CommandResult<Buffer>>,
  }
}

/**
 * One captured stream: decoded text, or the raw chunks when `bytes`. It
 * decodes through a StringDecoder, not `toString()` per chunk. Per chunk, a
 * multi-byte character split across two chunks would decode as two partial
 * sequences, each replaced with U+FFFD. The decoder holds a partial sequence
 * back until the rest arrives. Both sync paths decode the whole buffer, or
 * the whole file, at once, so they do not need this.
 */
function capture(bytes: boolean) {
  const decoder = new StringDecoder('utf8')
  const chunks: Buffer[] = []
  let text = ''
  return {
    write(d: Buffer): void {
      if (bytes) chunks.push(d)
      else text += decoder.write(d)
    },
    /**
     * The whole stream. `flush` emits a sequence the decoder still holds when
     * the output ends mid-character, from a cut-short capture or bytes that
     * were never UTF-8. Without the flush, those bytes would be dropped. Past
     * the cap, a held-back partial character is where the cut fell, not
     * output, so it is not flushed.
     */
    end(flush: boolean): string | Buffer {
      if (bytes) return Buffer.concat(chunks)
      return flush ? text + decoder.end() : text
    },
  }
}

/** The async capture runners' `run`; `bytes` keeps stdout as a `Buffer`. */
function runAsync(
  binary: string,
  argv: string[],
  opts: AsyncCommandRunOptions,
  bytes: boolean,
): Promise<CommandResult<string | Buffer>> {
  return new Promise((resolve) => {
    // Inside the executor, so an invalid timeoutMs (or a throw from spawn)
    // rejects and nothing is spawned.
    const timeoutMs = normalizeTimeout(opts.timeoutMs)
    const cap = normalizeOutputCap(opts.maxOutputBytes) ?? Infinity
    const cwdMessage = cwdError(`spawn ${binary}`, binary, argv, opts)
    if (cwdMessage !== undefined) {
      resolve(emptyStdout(spawnFailure(cwdMessage), bytes))
      return
    }
    const plan = spawnPlan(binary, argv, opts)
    if ('refusal' in plan) {
      resolve(emptyStdout(spawnFailure(plan.refusal), bytes))
      return
    }
    const windowsTree = opts.killTree === true && process.platform === 'win32'
    const group =
      opts.processGroup === true || (opts.killTree === true && process.platform !== 'win32')
    const refusal = group ? groupStartRefusal() : undefined
    if (refusal !== undefined) {
      const refused: CommandResult = {
        exitCode: 1,
        neverExited: true,
        reason: 'abort',
        stdout: '',
        stderr: '',
        error: refusal,
      }
      resolve(emptyStdout(refused, bytes))
      return
    }
    // Abort is handled below rather than through spawn's `signal` option,
    // which sends one SIGTERM to the direct child only: no SIGKILL
    // follow-up and no group.
    const start = () =>
      spawn(plan.file, plan.args, {
        ...planOptions(plan),
        cwd: opts.cwd,
        detached: group,
        ...mergedEnv(opts),
      })
    const { child, untrack: untrackGroup } = group
      ? spawnTrackedGroup(start)
      : { child: start(), untrack: undefined }
    // Set once this runner signals the child. A group it is stopping stays
    // in flight for the host's exit handler.
    let stopping = false
    const signalChild = (sig: NodeJS.Signals) => {
      stopping = true
      if (windowsTree && child.pid !== undefined && exited === undefined) {
        killWindowsTree(child.pid, opts, () => child.kill(sig))
        return
      }
      if (group && child.pid !== undefined) {
        try {
          process.kill(-child.pid, sig)
          return
        } catch {
          // The group is already gone. Signal the direct child instead.
        }
      }
      child.kill(sig)
    }
    const hardKill = () => signalChild('SIGKILL')
    const groupGone = () => child.pid === undefined || !groupExists(child.pid)
    let stdinError: Error | undefined
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    let abortKillTimer: ReturnType<typeof setTimeout> | undefined
    // Set once the child exits. A later timeout or abort reports this, not a
    // stand-in, since the command did answer.
    let exited: Omit<CommandResult, 'stdout' | 'stderr'> | undefined
    const onAbort = () => {
      signalChild('SIGTERM')
      // This timer outlives the settle on purpose. It is not unref'd, because
      // an unref'd timer does not always fire on every Bun version. It is
      // cleared when the child exits, or in group mode when the group is
      // gone by then.
      if (exited === undefined || (group && !groupGone())) {
        abortKillTimer = setTimeout(hardKill, ABORT_KILL_GRACE_MS)
      }
      if (exited !== undefined) finish(exited, stdinError?.message)
      else finish({ exitCode: 1, neverExited: true, reason: 'abort' }, 'The operation was aborted')
    }
    const out = capture(bytes)
    const err = capture(false)
    // Bytes captured per stream, for `maxOutputBytes`.
    let outBytes = 0
    let errBytes = 0
    // Each stream stops at its own cap. The first to pass it sets the result.
    const capped = { stdout: false, stderr: false }
    let capOutcome:
      { result: Omit<CommandResult, 'stdout' | 'stderr'>; message: string } | undefined
    /** Settle once, with the streams flushed (see `capture`). Every settle goes through here. */
    const finish = (result: Omit<CommandResult, 'stdout' | 'stderr'>, error?: string) => {
      if (settled) return
      settled = true
      if (capOutcome !== undefined) {
        result = capOutcome.result
        error = capOutcome.message
      }
      // The group can outlive the settle, through a background member or an
      // aborted group waiting for its SIGKILL. It stays registered until it
      // is empty, so a signal to the host still reaches the rest. Unless this
      // runner is stopping it, the host's exit leaves it running.
      if (untrackGroup !== undefined && child.pid !== undefined) {
        if (!stopping) settleGroup(child.pid)
        releaseWhenEmpty(child.pid, untrackGroup)
      }
      if (timer !== undefined) clearTimeout(timer)
      if (graceTimer !== undefined) clearTimeout(graceTimer)
      opts.signal?.removeEventListener('abort', onAbort)
      const stdout = out.end(!capped.stdout)
      const stderr = err.end(!capped.stderr) as string
      // Close the read ends. On `close` this does nothing. On the other
      // paths a surviving grandchild may still hold the write ends and keep
      // writing. Handlers left in place would keep appending to `stdout` and
      // `stderr` after the promise resolved. In a long-lived host that memory
      // grows without limit, and reading the pipe keeps the grandchild alive.
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
     * Stop at the cap. Keep what fits and kill the child (or its group).
     * The run settles on the usual `close` or exit grace, so output the
     * child already wrote to the other stream is still read, as the sync
     * runner reads it. The decoder holds back a character the cut splits,
     * and `finish` does not flush it, so a decoded stream ends on a
     * character boundary. Raw bytes end at the cap.
     */
    const overCap = (name: 'stdout' | 'stderr', fits: Buffer) => {
      capped[name] = true
      if (name === 'stdout') out.write(fits)
      else err.write(fits)
      if (capOutcome !== undefined) return
      const message = `${name} passed maxOutputBytes (${cap} bytes)`
      // A child that exited keeps its answer. One that died by a signal keeps
      // `reason: 'signal'`, since `outputIncomplete` means it exited.
      if (exited !== undefined && exited.neverExited !== true) {
        capOutcome = { result: { ...exited, outputIncomplete: true }, message }
      } else if (exited !== undefined) capOutcome = { result: exited, message }
      else capOutcome = { result: { exitCode: 1, neverExited: true, reason: 'output' }, message }
      hardKill()
    }
    child.stdout?.on('data', (d: Buffer) => {
      if (settled || capped.stdout) return
      if (outBytes + d.length > cap) return overCap('stdout', d.subarray(0, cap - outBytes))
      outBytes += d.length
      out.write(d)
    })
    child.stderr?.on('data', (d: Buffer) => {
      if (settled || capped.stderr) return
      if (errBytes + d.length > cap) return overCap('stderr', d.subarray(0, cap - errBytes))
      errBytes += d.length
      err.write(d)
    })
    child.on('error', (err) => {
      // A spawn failure. No exit code was reported, so the 1 is a stand-in.
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
      // A group can outlive its leader. Keep the SIGKILL follow-up while it does.
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
            // A group member holds the pipes. Without a group there is no way
            // to signal it. The direct child is gone, and only `finish`
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
    // `child.stdin` is its own emitter. An `error` on it never reaches the
    // `child.on('error')` handler above, and an unhandled `error` on an
    // emitter is rethrown as an uncaught exception that ends the host
    // process. A child that closes its read end before `input` is written (it
    // exits, or closes fd 0) fails the write with EPIPE, or ENOTCONN with
    // some timings. That is not a command failure: the child ran, and its own
    // exit code is the result. But the child read only part of `input`, so
    // the message goes in `error`, as a spawn error does. A write error after
    // the promise settles is ignored, since there is no result left to put it
    // on.
    child.stdin?.on('error', (err) => {
      stdinError = err
    })
    if (child.pid !== undefined && opts.onSpawn !== undefined) {
      try {
        opts.onSpawn(child.pid)
      } catch (err) {
        // Called after every handler is in place, so a throw here can still
        // kill the child and settle, rather than reject and leave it running
        // untracked.
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
      // The timeout is enforced here, not through spawn's own `timeout`
      // option, which does nothing on some Bun versions. The timer is not
      // unref'd, because an unref'd timer does not always fire on every Bun
      // version. `finish` clears it, so it never outlives the call.
      timer = setTimeout(() => {
        // SIGKILL, not the default SIGTERM. The timeout is a hard cap, and
        // a child that has run this long is assumed to be hung. A signal it
        // can trap or ignore would not be a cap. This matches the sync and
        // streaming runners, which cannot escalate. An abort is a request to
        // stop, so it sends SIGTERM first.
        hardKill()
        if (exited !== undefined) {
          finish(exited, stdinError?.message)
          return
        }
        // Settle here, not on `close`. `close` waits for the stdio pipes to
        // reach EOF, and a forked grandchild can survive the kill and still
        // hold the write ends. So resolve on the deadline with the output
        // captured so far.
        finish(
          { exitCode: 1, neverExited: true, reason: 'timeout' },
          `timed out after ${timeoutMs}ms`,
        )
      }, timeoutMs)
    }
    if (opts.input !== undefined) child.stdin?.end(opts.input)
    else child.stdin?.end()
  })
}

/** The `taskkill` arguments that kill `pid` and every process under it. */
export function treeKillArgv(pid: number): string[] {
  return ['/pid', String(pid), '/t', '/f']
}

/**
 * Kill `pid`'s process tree with `taskkill`, then call `then`. `then` runs
 * even when `taskkill` is missing or fails, so the child itself still dies.
 */
function killWindowsTree(pid: number, opts: AsyncCommandRunOptions, then: () => void): void {
  void spawnRunnerAsync('taskkill', { absolutePathOnly: true })
    .run(treeKillArgv(pid), { cwd: opts.cwd, env: opts.env, timeoutMs: 10_000 })
    .then(then, then)
}

/**
 * The async version of `runChecked`: run a command and reject if it fails.
 * Like `runChecked`, it takes the runner's own options, so a `withDefaults`
 * runner needs only the options it did not bind. An
 * {@link AsyncBytesCommandRunner} resolves to `CommandResult<Buffer>`. Its
 * `CommandFailed` carries stdout decoded as UTF-8.
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
export async function runCheckedAsync(
  runner: AsyncBytesCommandRunner,
  argv: string[],
  opts: AsyncCommandRunOptions,
): Promise<CommandResult<Buffer>>
export async function runCheckedAsync<P extends unknown[], S extends string | Buffer = string>(
  runner: {
    readonly binary?: string | undefined
    run(argv: string[], ...opts: P): Promise<CommandResult<S>>
  },
  argv: string[],
  ...opts: NoInfer<P>
): Promise<CommandResult<S>>
export async function runCheckedAsync(
  runner: {
    readonly binary?: string | undefined
    run(argv: string[], ...opts: unknown[]): Promise<CommandResult<string | Buffer>>
  },
  argv: string[],
  ...opts: unknown[]
): Promise<CommandResult<string | Buffer>> {
  const result = await runner.run(argv, ...opts)
  if (result.exitCode !== 0) throw new CommandFailed(argv, result, runner.binary)
  return result
}

/**
 * Wrap a sync runner as an async one, so one test fake works for both forms.
 * `signal`, `onSpawn`, `processGroup` and `killTree` are ignored, because a sync runner
 * cannot be cancelled while it runs and reports no pid. A throw from the sync runner
 * becomes a rejection. A `BytesCommandRunner` becomes an
 * {@link AsyncBytesCommandRunner}.
 *
 * @param runner - The sync runner to wrap.
 * @returns An async runner that calls `runner`.
 */
export function asAsync(runner: CommandRunner): AsyncCommandRunner
export function asAsync(runner: BytesCommandRunner): AsyncBytesCommandRunner
export function asAsync(
  runner: CommandRunner | BytesCommandRunner,
): AsyncCommandRunner | AsyncBytesCommandRunner {
  return {
    ...(runner.binary === undefined ? {} : { binary: runner.binary }),
    run: async (argv: string[], opts: CommandRunOptions) => runner.run(argv, opts),
  } as AsyncCommandRunner | AsyncBytesCommandRunner
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
    if (isCommandFailed(e)) throw await mapper(e)
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
    if (isCommandFailed(e)) return onFailed(e)
    throw e
  }
}
