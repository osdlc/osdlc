/**
 * The synchronous capture runner: the {@link CommandRunner} interface and its
 * `spawnSync`-backed default, {@link spawnRunner}. Code that runs commands
 * takes a `CommandRunner`; tests pass a fake. Live output and long-lived
 * processes have their own runners (`stream.ts`, `process.ts`).
 *
 * Two ways to call it, like zod's `safeParse` and `parse`:
 *   - `runner.run(...)` never throws for a failed command; the caller reads
 *     `exitCode`.
 *   - `runChecked(runner, ...)` throws {@link CommandFailed} on a non-zero
 *     exit, for callers whose only sensible response to failure is to stop.
 */

import { spawnSync } from 'node:child_process'
import {
  accessSync,
  constants,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

import { shellJoin } from './quote.ts'
import { failureText, stderrOrError } from './result.ts'

/** Result of running an external command through a `CommandRunner`. */
export interface CommandResult {
  /** The child's exit code, or `1` when it never reported one (see `neverExited`). */
  exitCode: number
  /** Everything the child wrote to stdout, decoded as UTF-8. */
  stdout: string
  /**
   * Everything the child wrote to stderr, decoded as UTF-8. Only the child's
   * output: the runner's own message, such as a failed spawn or a timeout, is
   * in `error`. `failureText` reads both.
   */
  stderr: string
  /**
   * `true` when the child never reported an exit status: the spawn failed, a
   * timeout or an abort killed it, a signal took it down, or the sync runner
   * killed it at the output cap. `exitCode` is
   * then a stand-in `1`, not the command's answer. Absent otherwise.
   *
   * Check this before reading an exit code as an answer. `grep` exits 1 for
   * "no matches" and `git config --get` exits 1 for an unset key; without
   * this check, a binary missing from `PATH` reads as a confident "no".
   * `reason` says which of those causes it was.
   */
  neverExited?: boolean | undefined
  /**
   * Why the child never reported an exit status. Set whenever `neverExited`
   * is, absent otherwise. See {@link NeverExitedReason}.
   */
  reason?: NeverExitedReason | undefined
  /**
   * The signal that ended the child, when the runner knows it: always for
   * `reason: 'signal'`, and for a sync `'timeout'` or `'output'` (`SIGKILL`).
   * The async runner settles a timeout or abort before the child is gone, so
   * it leaves this unset there.
   */
  signal?: NodeJS.Signals | undefined
  /**
   * The runner's own message, when it has one: a failed spawn, a timeout, an
   * abort, an `onSpawn` that threw, a refused `processGroup` run, the output
   * cap, or a failed write to the child's stdin. It is never copied into
   * `stderr`. Absent otherwise.
   *
   * It can also be set when the child did exit: a failed stdin write (Bun's
   * `spawnSync` does not report one), or, under Bun, a child that exits right
   * at the output cap. `exitCode` is then the child's own and `reason` is
   * absent.
   */
  error?: string | undefined
}

/**
 * Why a child never reported an exit status (`neverExited: true`):
 *
 * - `spawn`: it never started: a missing binary, no permission, a bad `cwd`.
 *   Retrying will not help.
 * - `timeout`: `timeoutMs` ran out and the runner killed it.
 * - `abort`: the caller stopped it: an `AbortSignal` (async runner), an
 *   `onSpawn` that threw, or `kill()` on a managed process. Or a
 *   `processGroup` run was refused because signal forwarding is stopping the
 *   host; it never started, and `error` carries the refusal message.
 * - `signal`: a signal from elsewhere ended it.
 * - `output`: the sync runner killed it for passing its 256 MB output cap
 *   (`spawnSync`'s `ENOBUFS`). The same run will fail the same way. The async
 *   runner has no cap, and the `bun test` capture path writes to files, so
 *   neither reports this.
 */
export type NeverExitedReason = 'spawn' | 'timeout' | 'abort' | 'signal' | 'output'

/** Per-call options for a {@link CommandRunner}. */
export interface CommandRunOptions {
  /** Working directory for the child. Required: the runner has no default. */
  cwd: string
  // Optional fields are `?: T | undefined` rather than `?: T`: options are
  // normally built by spreading a caller's own optionals, and under
  // `exactOptionalPropertyTypes` a present-but-undefined property is not the
  // same as an absent one. Both mean "not given" here.
  /**
   * Kill the child with `SIGKILL` after this many milliseconds. The result
   * then has a non-zero `exitCode`, `neverExited: true` and
   * `reason: 'timeout'`.
   *
   * The same rule on every runner: `undefined` and `Infinity` mean no cap,
   * and a fraction rounds up (`1.2` is `2`). A value above 2^31 - 1 (about
   * 24.8 days), the largest timer delay, is clamped to it. `0`, a negative
   * value and `NaN` are a caller error: `RangeError`, thrown by the sync
   * runners and rejected by the async ones. A value that is not a number is
   * a `TypeError`, the same way.
   *
   * The sync runners (`spawnRunner`, `runShell`, `shellRunner`) and
   * `streamRunner` kill the direct child only. Processes it started keep
   * running. Only the async runners (`spawnRunnerAsync`, `runShellAsync`,
   * `shellRunnerAsync`) can kill the whole process group, with
   * `processGroup`.
   */
  timeoutMs?: number | undefined
  /** Text written to the child's stdin. Stdin is closed after it, or at once when omitted. */
  input?: string | undefined
  /**
   * Variables merged over the parent's environment. An `undefined` value
   * removes that variable from the child's environment.
   */
  env?: EnvOverrides | undefined
}

/** Env vars to set on a child, merged over the parent's; an `undefined` value unsets that var. */
export type EnvOverrides = Record<string, string | undefined>

/**
 * Runs one external binary (`git`, `gh`, …) and captures its output. Code that
 * shells out takes one of these; tests pass a fake.
 *
 * @example
 * ```ts
 * const fake: CommandRunner = {
 *   run: (argv) => ({ exitCode: 0, stdout: `ran ${argv.join(' ')}`, stderr: '' }),
 * }
 * ```
 */
export interface CommandRunner {
  /**
   * Run the binary with `argv` (the arguments, without the binary name) and
   * wait for it to exit. Never throws for a failed command: a non-zero exit,
   * a missing binary or a timeout all come back as a {@link CommandResult}.
   * Programmer errors throw: an invalid `timeoutMs` (see its doc) or a NUL
   * byte in argv or env.
   */
  run(argv: string[], opts: CommandRunOptions): CommandResult
}

/**
 * `{ env }`: `process.env` merged with `opts.env`, minus any key whose
 * override is `undefined`. Always an explicit object built from the current
 * `process.env` at call time — never `undefined`, never an omitted key, and
 * never `process.env` handed through verbatim either.
 *
 * Node's `child_process.spawnSync` inherits live `process.env` whether
 * `env` is omitted, `undefined`, or `process.env` itself. Bun's does not:
 * all three instead take a snapshot — of exactly when is unclear, but
 * empirically it misses anything set on `process.env` after the process
 * started, even as the very first spawn — so a test that points an env var
 * at a fresh temp dir right before spawning would silently see the real,
 * unwritten default instead. Only spreading `process.env`'s current
 * key/values into a brand-new plain object at the call site sidesteps
 * whatever Bun is snapshotting.
 */
export function mergedEnv(opts: Pick<CommandRunOptions, 'env'>): { env: NodeJS.ProcessEnv } {
  const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env }
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key]
  return { env }
}

/** The largest delay `setTimeout` honours; a longer one fires at once. */
const MAX_TIMER_MS = 2 ** 31 - 1

/**
 * `timeoutMs` as every runner applies it: `undefined` for no cap, else a whole
 * number of milliseconds, at most {@link MAX_TIMER_MS}. See
 * {@link CommandRunOptions.timeoutMs}.
 *
 * @throws `TypeError` for a value that is not a number.
 * @throws `RangeError` for `0`, a negative value or `NaN`.
 */
export function normalizeTimeout(timeoutMs: number | undefined): number | undefined {
  if (timeoutMs === undefined) return undefined
  return timerMs('timeoutMs', timeoutMs, 'positive')
}

/**
 * A delay option as a timer takes it: `undefined` for `Infinity`, else a whole
 * number of milliseconds, at most {@link MAX_TIMER_MS}. `min` says whether `0`
 * is allowed. `name` is the option's name, for the error message.
 *
 * @throws `TypeError` for a value that is not a number.
 * @throws `RangeError` for a value below `min`, or `NaN`.
 */
export function timerMs(name: string, ms: number, min: 'positive' | 'zero'): number | undefined {
  if (ms === Infinity) return undefined
  if (typeof ms !== 'number') throw new TypeError(`${name} must be a number, got ${typeof ms}`)
  if (min === 'positive' ? !(ms > 0) : !(ms >= 0)) {
    const allowed = min === 'positive' ? 'a positive number' : '0 or more'
    throw new RangeError(`${name} must be ${allowed} or Infinity, got ${ms}`)
  }
  return Math.min(Math.ceil(ms), MAX_TIMER_MS)
}

/**
 * A spawn error message when `cwd` is missing or not a directory, else
 * `undefined`. Checked before spawning: a spawn reports a missing `cwd` as
 * `spawn <binary> ENOENT`, which reads as a missing binary, and Node's async
 * `spawn` throws for a `cwd` that is a file.
 *
 * @param spawnName - The message prefix: `spawn` or `spawnSync`, then the binary.
 * @throws `TypeError` for a NUL byte in `binary`, `argv` or `opts.env`, as the
 * spawn would, so a bad `cwd` does not hide it.
 */
export function cwdError(
  spawnName: string,
  binary: string,
  argv: readonly string[],
  opts: { cwd: string; env?: EnvOverrides | undefined },
): string | undefined {
  let problem: string
  try {
    if (statSync(opts.cwd).isDirectory()) return undefined
    problem = 'ENOTDIR: cwd %s is not a directory'
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') return undefined // the spawn reports it
    problem = 'ENOENT: cwd %s does not exist'
  }
  assertNoNulByte(binary, argv, opts.env)
  return `${spawnName} ${problem.replace('%s', JSON.stringify(opts.cwd))}`
}

/** Throw the `TypeError` a spawn throws for a NUL byte in its arguments. */
function assertNoNulByte(
  binary: string,
  argv: readonly string[],
  env: EnvOverrides | undefined,
): void {
  const values = [
    ['binary', binary],
    ...argv.map((a, i) => [`argv[${i}]`, a]),
    ...Object.entries(env ?? {}).flatMap(([k, v]) => [
      [`env key ${JSON.stringify(k)}`, k],
      [`env.${k}`, v ?? ''],
    ]),
  ] as const
  for (const [name, value] of values) {
    if (typeof value !== 'string' || !value.includes('\0')) continue
    const e: NodeJS.ErrnoException = new TypeError(`${name} must not contain a NUL byte`)
    e.code = 'ERR_INVALID_ARG_VALUE'
    throw e
  }
}

/** The stand-in result for a child that never started. */
export function spawnFailure(message: string): CommandResult {
  return {
    exitCode: 1,
    neverExited: true,
    reason: 'spawn',
    stdout: '',
    stderr: '',
    error: message,
  }
}

/**
 * How a `spawnSync` that reported no exit status ended. Shared by the sync
 * capture and streaming runners.
 */
export function syncStop(proc: { error?: Error | undefined; signal: NodeJS.Signals | null }): {
  reason: Exclude<NeverExitedReason, 'abort'>
  signal?: NodeJS.Signals
} {
  const signal = proc.signal ?? undefined
  const sig = signal === undefined ? {} : { signal }
  const code = (proc.error as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ETIMEDOUT') return { reason: 'timeout', ...sig }
  // On the cap, `spawnSync` kills the child with `killSignal`.
  if (code === 'ENOBUFS') return { reason: 'output', ...sig }
  if (signal !== undefined) return { reason: 'signal', signal }
  return { reason: 'spawn' }
}

/**
 * Thrown by {@link runChecked} and `runCheckedAsync` on a non-zero exit.
 * Carries the argv and the full {@link CommandResult}, so a caller can report
 * the output without running the command again.
 *
 * `message` is `command failed (exit N): <argv>`, with argv quoted by
 * `shellJoin`, followed on a new line by the trimmed stderr, or the trimmed
 * `error` when stderr is empty. Nothing follows when both are empty. The argv
 * appears in full, so error logs and reports carry it: pass secrets through
 * `env` or `input`, not argv. Use `detail` to show a person
 * why it failed.
 */
export class CommandFailed extends Error {
  /** The arguments the command ran with, without the binary name. */
  readonly argv: string[]
  /** The full result of the failed run. */
  readonly result: CommandResult

  /**
   * The failure text to show a human: both streams, trimmed, newline-joined,
   * empty ones dropped, with the runner's `error` standing in for an empty
   * stderr. Empty when there is no text at all. The same as
   * `failureText(e.result, { both: true })`.
   *
   * `message` interpolates stderr only, and several commands write the
   * sentence that explains the failure to stdout instead — a rejecting git
   * hook, `git commit` on a clean tree, `git apply --check`. Read this rather
   * than picking a stream at the call site.
   *
   * Both are joined rather than one preferred, because a rejecting hook is
   * the case where both carry a distinct half: git's own "commit failed" on
   * stderr, the hook's reason on stdout. Preferring either drops the half
   * the reader needs.
   */
  get detail(): string {
    return failureText(this.result, { both: true })
  }

  /**
   * @param argv - The arguments the command ran with.
   * @param result - The result of the failed run.
   */
  constructor(argv: string[], result: CommandResult) {
    const stderr = stderrOrError(result)
    super(
      `command failed (exit ${result.exitCode}): ${shellJoin(argv)}` +
        (stderr ? `\n${stderr}` : ''),
    )
    this.name = 'CommandFailed'
    this.argv = argv
    this.result = result
  }
}

/**
 * Run a command and throw if it fails. Use it where the only sensible
 * response to failure is to stop, instead of writing
 * `if (r.exitCode !== 0) throw` after each `run`.
 *
 * Takes any runner whose `run` returns a {@link CommandResult}, with that
 * runner's own options: a `withDefaults` runner needs only the options it
 * did not bind.
 *
 * @param runner - Runs the command; pass a fake in tests.
 * @param argv - Arguments, without the binary name.
 * @param opts - Per-call options, as `runner.run` takes them.
 * @returns The result, when `exitCode` is 0.
 * @throws {@link CommandFailed} when `exitCode` is not 0, including a missing
 * binary or a timeout.
 *
 * @example
 * ```ts
 * const git = spawnRunner('git')
 * const head = runChecked(git, ['rev-parse', 'HEAD'], { cwd: '.' }).stdout.trim()
 * ```
 */
export function runChecked(
  runner: CommandRunner,
  argv: string[],
  opts: CommandRunOptions,
): CommandResult
export function runChecked<P extends unknown[]>(
  runner: { run(argv: string[], ...opts: P): CommandResult },
  argv: string[],
  ...opts: NoInfer<P>
): CommandResult
export function runChecked(
  runner: { run(argv: string[], ...opts: unknown[]): CommandResult },
  argv: string[],
  ...opts: unknown[]
): CommandResult {
  const result = runner.run(argv, ...opts)
  if (result.exitCode !== 0) throw new CommandFailed(argv, result)
  return result
}

/**
 * Run `fn`; if it throws {@link CommandFailed}, throw `mapper(e)` instead.
 * Any other error propagates untouched, as does `fn`'s return value. Replaces
 * `catch (e) { if (e instanceof CommandFailed) throw new X(...); throw e }`.
 *
 * `mapper` may have side effects (print the output, say) before returning the
 * error to throw. Async version: `mapFailedAsync`.
 *
 * @param fn - The code to run, usually a `runChecked` call.
 * @param mapper - Turns the failure into the error to throw.
 * @returns What `fn` returns.
 * @throws The error `mapper` returns, when `fn` throws `CommandFailed`.
 */
export function mapFailed<T>(fn: () => T, mapper: (failed: CommandFailed) => Error): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof CommandFailed) throw mapper(e)
    throw e
  }
}

/**
 * Run `fn`; if it throws {@link CommandFailed}, return `onFailed(e)` instead.
 * Any other error propagates untouched. Async version: `catchFailedAsync`.
 *
 * @param fn - The code to run, usually a `runChecked` call.
 * @param onFailed - Turns the failure into a value.
 * @returns What `fn` returns, or what `onFailed` returns.
 */
export function catchFailed<T, R>(fn: () => T, onFailed: (failed: CommandFailed) => R): T | R {
  try {
    return fn()
  } catch (e) {
    if (e instanceof CommandFailed) return onFailed(e)
    throw e
  }
}

// Bun's `bun test` runtime mis-wires child-process stdio once a large module
// graph is loaded in the test process: the child runs — its own `<in >out`
// redirects work, filesystem side effects land — but the stdin/stdout/stderr
// the parent hands it come back empty. Confirmed for sync and async spawns,
// pipes and parent-opened fds, across every Bun 1.2.x-1.3.x; not reproducible
// under `bun run`. A suite that shells out after importing a heavy module
// graph hits it on every run.
// Only Bun's test runner is affected, so the workaround needs both the Bun
// runtime and `NODE_ENV=test` (which `bun test` sets). Jest and Vitest also
// set `NODE_ENV=test`, but they run on Node and keep the pipe path below.
const CHILD_STDIO_CORRUPTED =
  process.versions['bun'] !== undefined && process.env['NODE_ENV'] === 'test'

/**
 * Whether `binary` resolves to an executable file the way a spawn would find
 * it: a name with a `/` is taken relative to `cwd`; a bare name is looked up
 * on the child's `PATH`.
 */
function findsExecutable(binary: string, cwd: string, path: string | undefined): boolean {
  const isExecutable = (p: string): boolean => {
    try {
      accessSync(p, constants.X_OK)
      return statSync(p).isFile()
    } catch {
      return false
    }
  }
  if (binary === '') return false
  if (binary.includes('/')) return isExecutable(resolve(cwd, binary))
  return (path ?? '/usr/bin:/bin')
    .split(delimiter)
    .some((dir) => isExecutable(resolve(cwd, dir, binary)))
}

/** Folds a finished `spawnSync` into a {@link CommandResult}. */
function fromSpawnSync(
  proc: { status: number | null; signal: NodeJS.Signals | null; error?: Error | undefined },
  stdout: string,
  stderr: string,
): CommandResult {
  return {
    exitCode: proc.status ?? 1,
    // Bun reports a failed spawn with `status` undefined, not null.
    ...(proc.status == null ? { neverExited: true as const, ...syncStop(proc) } : {}),
    stdout,
    stderr,
    // `proc.error` is set for a failed spawn, a timeout, the output cap, or a
    // failed stdin write; only the first three leave `status` null (and under
    // Bun the cap can come with a real status too). A stdin write error can
    // come with a child that did exit, so it is kept either way.
    ...(proc.error ? { error: proc.error.message } : {}),
  }
}

/**
 * Capture output the one way Bun does not corrupt: let the child do its own
 * `<in >out 2>err` redirects to temp files, then read the files back. `binary`
 * and `argv` ride as separate `sh` positional args — never parsed as shell — so
 * arguments containing spaces, metacharacters, or `$()` are inert. `exec`
 * replaces `sh`, so the reported exit status (and the cwd/env/timeout) all
 * belong to the child, matching the pipe path's contract.
 */
function runViaChildRedirect(
  binary: string,
  argv: string[],
  opts: CommandRunOptions,
  timeoutMs: number | undefined,
): CommandResult {
  const { env } = mergedEnv(opts)
  // A binary that cannot be found would make `exec` fail and `sh` exit 127,
  // which reads as the command's own answer. Check first, so the result is
  // the same stand-in the pipe path reports for a failed spawn. This also
  // keeps a binary named like an option (`-a`) from reaching `exec` as one,
  // unless an executable named `-a` is on PATH.
  if (!findsExecutable(binary, opts.cwd, env['PATH'])) {
    return spawnFailure(`spawnSync ${binary} ENOENT`)
  }
  const dir = mkdtempSync(join(tmpdir(), 'command-seam-'))
  try {
    const inFile = join(dir, 'in')
    const outFile = join(dir, 'out')
    const errFile = join(dir, 'err')
    writeFileSync(inFile, opts.input ?? '')
    const proc = spawnSync(
      // An absolute path, so an `env.PATH` override without `/bin` still
      // finds the shell.
      '/bin/sh',
      [
        '-c',
        'i="$1"; o="$2"; e="$3"; shift 3; exec "$@" <"$i" >"$o" 2>"$e"',
        'sh', // $0
        inFile,
        outFile,
        errFile,
        binary,
        ...argv,
      ],
      {
        cwd: opts.cwd,
        timeout: timeoutMs,
        // SIGKILL, not spawnSync's default SIGTERM: the contract is a hard
        // cap, and a child that ignores TERM is left to run to completion —
        // spawnSync signals on expiry and then keeps waiting for an exit.
        killSignal: 'SIGKILL',
        env,
      },
    )
    // The redirect files are created by the child's `>` / `2>`, so neither
    // exists when `sh` itself never ran — a spawn that fails with EAGAIN under
    // a saturated process table is the case that matters, and it must not turn
    // into an ENOENT thrown from the capture layer. Missing reads as empty,
    // matching what the pipe path reports for a child that produced nothing.
    const readOrEmpty = (p: string): string => {
      try {
        return readFileSync(p, 'utf-8')
      } catch {
        return ''
      }
    }
    // Output goes to a file, so there is no maxBuffer: it is bounded only by
    // disk.
    return fromSpawnSync(proc, readOrEmpty(outFile), readOrEmpty(errFile))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * The injected runner when there is one, else `spawnRunner(binary)`.
 *
 * @param binary - The binary for the default runner.
 * @param injected - A runner to use instead, such as a test fake.
 */
export function resolveRunner(binary: string, injected?: CommandRunner | undefined): CommandRunner {
  return injected ?? spawnRunner(binary)
}

/**
 * The default {@link CommandRunner}: runs `binary` with `spawnSync`, so each
 * call blocks until the child exits. On timeout the child gets `SIGKILL`.
 * Captured output is capped at 256 MB per stream. Under `bun test` (the Bun
 * runtime with `NODE_ENV=test`) it captures through `/bin/sh` and temp files
 * instead of pipes (see `runViaChildRedirect`).
 *
 * @param binary - A name looked up on `PATH`, or a path.
 * @returns A runner for that binary.
 *
 * @example
 * ```ts
 * const git = spawnRunner('git')
 * const r = git.run(['status', '--porcelain'], { cwd: '.', timeoutMs: 10_000 })
 * if (r.exitCode === 0) console.log(r.stdout)
 * ```
 */
export function spawnRunner(binary: string): CommandRunner {
  return {
    run(argv: string[], opts: CommandRunOptions): CommandResult {
      const timeoutMs = normalizeTimeout(opts.timeoutMs)
      const cwdMessage = cwdError(`spawnSync ${binary}`, binary, argv, opts)
      if (cwdMessage !== undefined) return spawnFailure(cwdMessage)
      if (CHILD_STDIO_CORRUPTED) return runViaChildRedirect(binary, argv, opts, timeoutMs)
      const proc = spawnSync(binary, argv, {
        cwd: opts.cwd,
        maxBuffer: 256 * 1024 * 1024,
        timeout: timeoutMs,
        // See `runViaChildRedirect`: the default SIGTERM is not a hard cap.
        killSignal: 'SIGKILL',
        input: opts.input,
        ...mergedEnv(opts),
      })
      return fromSpawnSync(proc, proc.stdout?.toString() ?? '', proc.stderr?.toString() ?? '')
    },
  }
}
