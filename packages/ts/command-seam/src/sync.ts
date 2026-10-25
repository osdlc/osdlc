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
import { join } from 'node:path'

import { FailureError, isFailure } from '@osdlc/result'

import { buildFailure, type CommandFailure } from './failure.ts'
import { shellJoin } from './quote.ts'
import { failureText, stderrOrError } from './result.ts'
import { planOptions, spawnPlan } from './spawn-plan.ts'
import { which } from './which.ts'

/**
 * Result of running an external command through a `CommandRunner`.
 * `Stdout` is `string` for the text runners and `Buffer` for the bytes
 * runners (`spawnRunnerBytes`, `spawnRunnerBytesAsync`): `CommandResult<Buffer>`.
 */
export interface CommandResult<Stdout extends string | Buffer = string> {
  /** The child's exit code, or `1` when it never reported one (see `neverExited`). */
  exitCode: number
  /**
   * Everything the child wrote to stdout: decoded as UTF-8, or the raw bytes
   * from a bytes runner.
   */
  stdout: Stdout
  /**
   * Everything the child wrote to stderr, decoded as UTF-8, on the bytes
   * runners too. It holds only the child's output. The runner's own message,
   * such as a failed spawn or a timeout, is in `error`. `failureText` reads
   * both.
   */
  stderr: string
  /**
   * `true` when the child never reported an exit status: the spawn failed, a
   * timeout or an abort killed it, a signal ended it, or the runner killed it
   * at the output cap. `exitCode` is then a stand-in `1`, not the command's
   * answer. Absent otherwise.
   *
   * Check this before reading an exit code as an answer. `grep` exits 1 for
   * "no matches" and `git config --get` exits 1 for an unset key. Without
   * this check, a binary missing from `PATH` reads as a plain "no".
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
   * The async runner settles a timeout, an abort or the output cap before the
   * child is gone, so it leaves this unset there.
   */
  signal?: NodeJS.Signals | undefined
  /**
   * `true` when the child exited but the runner stopped reading its output
   * early, so `stdout` and `stderr` may be cut short. `exitCode` is the
   * child's own, `neverExited` and `reason` are absent, and `error` says why.
   * Absent otherwise. Two cases:
   *
   * - Sync capture runner: the child exited, but a process it started (`cmd
   *   &`, a daemon, a postinstall script) still held stdout or stderr open
   *   when `timeoutMs` ran out. Anything that process wrote after the
   *   deadline is lost, and it keeps running. Without `timeoutMs` the run
   *   waits for it to exit.
   * - Either capture runner: output passed the cap (`maxOutputBytes`, or the
   *   sync runner's default of 256 MB) after the child had exited, or before
   *   the runner's kill landed. On the async runner this is a process the
   *   child started, still writing during the exit grace.
   *
   * The `bun test` capture path writes output to files and never waits on a
   * held pipe, so it never sets this flag.
   *
   * `ran` and `runChecked` go by the exit code alone, so they still count
   * such a run as a success. Check this flag when the output must be whole.
   */
  outputIncomplete?: boolean | undefined
  /**
   * The runner's own message, when it has one: a failed spawn, a timeout, an
   * abort, an `onSpawn` that threw, a refused `processGroup` run, the output
   * cap, or a failed write to the child's stdin. It is never copied into
   * `stderr`. Absent otherwise.
   *
   * It can also be set when the child did exit: a failed stdin write (Bun's
   * `spawnSync` does not report one), or a run with `outputIncomplete` set.
   * `exitCode` is then the child's own and `reason` is absent.
   */
  error?: string | undefined
}

/**
 * Why a child never reported an exit status (`neverExited: true`):
 *
 * - `spawn`: it never started, because of a missing binary, no permission
 *   or a bad `cwd`. Retrying will not help.
 * - `timeout`: `timeoutMs` ran out and the runner killed it.
 * - `abort`: the caller stopped it: an `AbortSignal` (async runner), an
 *   `onSpawn` that threw, or `kill()` on a managed process. Also a
 *   `processGroup` run that was refused because signal forwarding is
 *   stopping the host. That run never started, and `error` holds the
 *   refusal message.
 * - `signal`: a signal from elsewhere ended it.
 * - `output`: the runner killed it for passing the output cap
 *   (`maxOutputBytes`, or the sync runner's default of 256 MB). The same run
 *   will fail the same way. The async runner has no default cap, and the `bun test` capture path
 *   writes to files, so neither reports this unless `maxOutputBytes` is set
 *   (the `bun test` path never does).
 */
export type NeverExitedReason = 'spawn' | 'timeout' | 'abort' | 'signal' | 'output'

/** Per-call options for a {@link CommandRunner}. */
export interface CommandRunOptions {
  /** Working directory for the child. Required: the runner has no default. */
  cwd: string
  // Optional fields are `?: T | undefined`, not `?: T`. Callers often build
  // options by spreading their own optional fields. Under
  // `exactOptionalPropertyTypes` a property set to `undefined` differs from an
  // absent one. Here both mean "not given".
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
   * The sync runners (`spawnRunner`, `spawnRunnerBytes`, `runShell`,
   * `shellRunner`) and `streamRunner` kill the direct child only. Processes it
   * started keep running. Only the async runners (`spawnRunnerAsync`,
   * `spawnRunnerBytesAsync`, `runShellAsync`, `shellRunnerAsync`) can kill the
   * whole process group, with `processGroup`.
   */
  timeoutMs?: number | undefined
  /** Text written to the child's stdin. Stdin is closed after it, or at once when omitted. */
  input?: string | undefined
  /**
   * The most bytes to read from each of stdout and stderr. A child that
   * writes more to either stream is killed with `SIGKILL` (its whole group
   * with `processGroup`), and the result has `neverExited: true`,
   * `reason: 'output'`, and that stream cut to the cap on a character
   * boundary (a bytes runner's stdout is cut at exactly the cap). The cap
   * counts the bytes the child wrote, not the decoded text. Bytes that are not
   * valid UTF-8 decode to U+FFFD, which is 3 bytes, so the string can be
   * longer than the cap in UTF-8. A child that exits before the
   * kill lands keeps its exit code and gets `outputIncomplete: true` instead.
   *
   * The sync runners default to 256 MB per stream. The async runners have no
   * default cap. `undefined` keeps the default and `Infinity` means no cap. A
   * fraction rounds up. `0`, a negative value and `NaN` are a `RangeError`,
   * and a value that is not a number is a `TypeError`, thrown or rejected as
   * for `timeoutMs`. The `bun test` capture path writes output to files and
   * ignores this option.
   */
  maxOutputBytes?: number | undefined
  /**
   * Variables merged over the parent's environment. An `undefined` value
   * removes that variable from the child's environment.
   */
  env?: EnvOverrides | undefined
}

/** Env vars to set on a child, merged over the parent's. An `undefined` value unsets that var. */
export type EnvOverrides = Record<string, string | undefined>

/**
 * Where a streamed or managed child's stdio goes, the `stdio` option of
 * `streamRunner` and `managedProcessRunner`:
 *
 * - `'inherit'` (the default): stdin, stdout and stderr are the parent's.
 * - `'ignore'`: all three are `/dev/null`, so the child can neither read the
 *   terminal nor write to it.
 * - `{ stdout, stderr }`: file descriptors the parent already has open, such
 *   as one from `fs.openSync`. Stdin is `/dev/null`. Pass the same fd for
 *   both to get one log in the order the child wrote it. `1` and `2` are the
 *   parent's own stdout and stderr. The child gets its own copy of each fd
 *   when it starts, so the caller may close its fd once `run` returns. The
 *   runner never closes it.
 *
 * Each fd must be a whole number, 0 or more. Anything else is a programmer
 * error (`TypeError` for a value that is not a number, `RangeError` for
 * the rest), thrown before spawning. An fd that is not open is a failed
 * spawn (`reason: 'spawn'`, `EBADF` in `error`).
 */
export type StdioOption = 'inherit' | 'ignore' | { stdout: number; stderr: number }

/**
 * The `stdio` a spawn takes for a {@link StdioOption}.
 *
 * @throws `TypeError` for an unknown mode or an fd that is not a number.
 * @throws `RangeError` for an fd that is negative or not a whole number.
 */
export function childStdio(
  stdio: StdioOption | undefined,
): 'inherit' | 'ignore' | ['ignore', number, number] {
  if (stdio === undefined || stdio === 'inherit') return 'inherit'
  if (stdio === 'ignore') return 'ignore'
  if (typeof stdio !== 'object' || stdio === null) {
    throw new TypeError(
      `stdio must be 'inherit', 'ignore' or { stdout, stderr }, got ${JSON.stringify(stdio)}`,
    )
  }
  return ['ignore', fd('stdio.stdout', stdio.stdout), fd('stdio.stderr', stdio.stderr)]
}

function fd(name: string, value: number): number {
  if (typeof value !== 'number') {
    throw new TypeError(`${name} must be a number, got ${typeof value}`)
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(
      `${name} must be a file descriptor (a whole number, 0 or more), got ${value}`,
    )
  }
  return value
}

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
   * The binary this runner runs, when it has one. `runChecked` puts it in
   * `CommandFailed`, so the message names the program. `spawnRunner` sets
   * it; a fake may leave it out.
   */
  readonly binary?: string | undefined
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
 * A {@link CommandRunner} whose result carries stdout as raw bytes, for
 * output that is not text or must not be decoded first: an image from
 * `git cat-file blob`, a tarball, bytes to hash. Stderr is still decoded as
 * UTF-8. `runChecked` takes it too.
 *
 * @experimental
 */
export interface BytesCommandRunner {
  /** The binary this runner runs, when it has one. See `CommandRunner.binary`. */
  readonly binary?: string | undefined
  /** As `CommandRunner.run`, with stdout as a `Buffer`. */
  run(argv: string[], opts: CommandRunOptions): CommandResult<Buffer>
}

/**
 * `{ env }`: `process.env` merged with `opts.env`, minus any key whose
 * override is `undefined`. It is always a new object built from `process.env`
 * at call time. It is never `undefined`, never left out, and never
 * `process.env` itself.
 *
 * Node's `spawnSync` reads the live `process.env` when `env` is omitted,
 * `undefined` or `process.env` itself. Bun's uses a snapshot in all three
 * cases. When the snapshot is taken is unclear, but it misses variables set
 * on `process.env` after the process started, even on the first spawn. A test
 * that points a variable at a new temp dir just before spawning would then
 * see the old value. Copying `process.env` into a new plain object at the
 * call avoids the snapshot.
 *
 * On Windows, where names match in any case, an override replaces the
 * parent's variable whatever its case: `{ PATH: undefined }` unsets the
 * parent's `Path`, and `{ path: 'x' }` replaces it.
 */
export function mergedEnv(opts: Pick<CommandRunOptions, 'env'>): { env: NodeJS.ProcessEnv } {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (process.platform === 'win32' && opts.env !== undefined) {
    const names = new Set(Object.keys(opts.env).map((k) => k.toUpperCase()))
    for (const key of Object.keys(env)) if (names.has(key.toUpperCase())) delete env[key]
  }
  Object.assign(env, opts.env)
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key]
  return { env }
}

/** The largest delay `setTimeout` accepts. A longer one fires at once. */
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

/** The sync runners' cap on each output stream when `maxOutputBytes` is not given. */
const DEFAULT_SYNC_OUTPUT_CAP = 256 * 1024 * 1024

/**
 * `maxOutputBytes` as every runner applies it: `undefined` when not given,
 * `Infinity` for no cap, else a whole number of bytes. See
 * {@link CommandRunOptions.maxOutputBytes}.
 *
 * @throws `TypeError` for a value that is not a number.
 * @throws `RangeError` for `0`, a negative value or `NaN`.
 */
export function normalizeOutputCap(maxOutputBytes: number | undefined): number | undefined {
  if (maxOutputBytes === undefined || maxOutputBytes === Infinity) return maxOutputBytes
  if (typeof maxOutputBytes !== 'number') {
    throw new TypeError(`maxOutputBytes must be a number, got ${typeof maxOutputBytes}`)
  }
  if (!(maxOutputBytes > 0)) {
    throw new RangeError(
      `maxOutputBytes must be a positive number or Infinity, got ${maxOutputBytes}`,
    )
  }
  return Math.ceil(maxOutputBytes)
}

/**
 * The longest prefix of `buf`, at most `max` bytes, that does not end inside
 * a UTF-8 sequence. Bytes that are not UTF-8 at all are kept as they are.
 */
export function utf8Prefix(buf: Buffer, max: number): Buffer {
  if (buf.length <= max) return buf
  let end = max
  // Back up over continuation bytes (10xxxxxx) to the lead byte of the
  // sequence the cut falls in, then keep that sequence only if it is whole.
  let lead = end
  while (lead > 0 && lead > end - 4 && (buf[lead - 1]! & 0xc0) === 0x80) lead--
  if (lead > 0) {
    const b = buf[lead - 1]!
    const len = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1
    if (len > 1 && lead - 1 + len > end) end = lead - 1
  }
  return buf.subarray(0, end)
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
 * A spawn error message when `cwd` is missing, not a directory or cannot be
 * entered, else `undefined`. It is checked before spawning for three
 * reasons. A spawn reports a missing `cwd` as `spawn <binary> ENOENT`, which
 * reads as a missing binary. Node's async `spawn` throws for a `cwd` that is
 * a file. And a `cwd` without search permission fails the spawn with
 * `EACCES`, which reads as a binary that cannot be run.
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
  const denied = 'EACCES: cwd %s cannot be entered'
  try {
    if (!statSync(opts.cwd).isDirectory()) problem = 'ENOTDIR: cwd %s is not a directory'
    else if (canEnter(opts.cwd)) return undefined
    else problem = denied
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EACCES') problem = denied
    else if (code !== 'ENOENT' && code !== 'ENOTDIR')
      return undefined // the spawn reports it
    else problem = 'ENOENT: cwd %s does not exist'
  }
  assertNoNulByte(binary, argv, opts.env)
  return `${spawnName} ${problem.replace('%s', JSON.stringify(opts.cwd))}`
}

/** Whether `dir` has search permission, so a child can start in it. */
function canEnter(dir: string): boolean {
  try {
    accessSync(dir, constants.X_OK)
    return true
  } catch {
    return false
  }
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
 * Carries the binary, the argv and the full {@link CommandResult}, so a
 * caller can report the output without running the command again.
 *
 * `message` is `command failed (exit N): <binary> <argv>`, quoted by
 * `shellJoin`, followed on a new line by the trimmed stderr, or the trimmed
 * `error` when stderr is empty. Nothing follows when both are empty. The argv
 * appears in full, so error logs and reports carry it: pass secrets through
 * `env` or `input`, not argv. Use `detail` to show a person
 * why it failed. The binary is left out when it is not known, as for a fake
 * runner without `binary`.
 *
 * It is a `FailureError`: `failure` is the classified {@link CommandFailure}
 * (`kind`, a one-line `message` for a person, the full `detail`). `failure.message`
 * is the line to show; `message` here is the long form for logs. A Result-based
 * caller can `unwrap` or `isFailure`-check it like any other failure.
 */
export class CommandFailed extends FailureError<CommandFailure> {
  /** The binary that ran, when the runner reports one (see `CommandRunner.binary`). */
  readonly binary: string | undefined
  /** The arguments the command ran with, without the binary name. */
  readonly argv: string[]
  /** The full result of the failed run, with a bytes runner's stdout decoded as UTF-8. */
  readonly result: CommandResult

  /**
   * The failure text to show a human: both streams, trimmed, newline-joined,
   * empty ones dropped, with the runner's `error` standing in for an empty
   * stderr. Empty when there is no text at all. The same as
   * `failureText(e.result, { both: true })`.
   *
   * `message` holds the command line and stderr (or the runner's `error`),
   * never stdout. Several commands explain the failure on
   * stdout instead, such as a rejecting git hook, `git commit` on a clean
   * tree, or `git apply --check`. Read this rather than picking a stream at
   * the call site.
   *
   * Both streams are joined because a rejecting hook puts a different half
   * on each: git's own "commit failed" on stderr, and the hook's reason on
   * stdout. Picking one stream drops the half the reader needs.
   */
  get detail(): string {
    return failureText(this.result, { both: true })
  }

  /**
   * @param argv - The arguments the command ran with.
   * @param result - The result of the failed run. A bytes runner's stdout is
   * decoded as UTF-8 into `result`, so the error reads like any other.
   * @param binary - The binary that ran, when known.
   */
  constructor(argv: string[], result: CommandResult<string | Buffer>, binary?: string | undefined) {
    super(buildFailure(result, { binary, argv }))
    const stderr = stderrOrError(result)
    const command = binary === undefined ? argv : [binary, ...argv]
    // The long form, for logs: it names the full command. `failure.message` is
    // the one line for a person.
    this.message =
      `command failed (exit ${result.exitCode}): ${shellJoin(command)}` +
      (stderr ? `\n${stderr}` : '')
    this.name = 'CommandFailed'
    this.binary = binary
    this.argv = argv
    this.result = decodedResult(result)
  }
}

/**
 * Whether `error` is a {@link CommandFailed}, by shape rather than `instanceof`:
 * a carried {@link CommandFailure} plus the `argv` and `result` of the run. Two
 * installed copies of this package (a monorepo consumer with mixed ranges) have
 * two `CommandFailed` classes, and `instanceof` is false across them.
 */
export function isCommandFailed(error: unknown): error is CommandFailed {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { failure?: unknown; argv?: unknown; result?: unknown }
  return (
    isFailure(e.failure) &&
    Array.isArray(e.argv) &&
    typeof e.result === 'object' &&
    e.result !== null
  )
}

/**
 * Run a command and throw if it fails. Use it where the only sensible
 * response to failure is to stop, instead of writing
 * `if (r.exitCode !== 0) throw` after each `run`.
 *
 * Takes any runner whose `run` returns a {@link CommandResult}, with that
 * runner's own options: a `withDefaults` runner needs only the options it
 * did not bind. A {@link BytesCommandRunner} returns `CommandResult<Buffer>`;
 * its `CommandFailed` carries stdout decoded as UTF-8.
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
export function runChecked(
  runner: BytesCommandRunner,
  argv: string[],
  opts: CommandRunOptions,
): CommandResult<Buffer>
export function runChecked<P extends unknown[], S extends string | Buffer = string>(
  runner: {
    readonly binary?: string | undefined
    run(argv: string[], ...opts: P): CommandResult<S>
  },
  argv: string[],
  ...opts: NoInfer<P>
): CommandResult<S>
export function runChecked(
  runner: {
    readonly binary?: string | undefined
    run(argv: string[], ...opts: unknown[]): CommandResult<string | Buffer>
  },
  argv: string[],
  ...opts: unknown[]
): CommandResult<string | Buffer> {
  const result = runner.run(argv, ...opts)
  if (result.exitCode !== 0) throw new CommandFailed(argv, result, runner.binary)
  return result
}

/**
 * Run `fn`; if it throws {@link CommandFailed}, throw `mapper(e)` instead.
 * Any other error propagates untouched, as does `fn`'s return value. Replaces
 * `catch (e) { if (isCommandFailed(e)) throw new X(...); throw e }`.
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
    if (isCommandFailed(e)) throw mapper(e)
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
    if (isCommandFailed(e)) return onFailed(e)
    throw e
  }
}

// Under `bun test`, once a large module graph is loaded in the test process,
// child-process stdio breaks. The child runs, its own `<in >out` redirects
// work, and its file changes land. But the stdin, stdout and stderr the parent
// gives it come back empty. Seen for sync and async spawns, pipes and
// parent-opened fds, on every Bun 1.2.x-1.3.x. It does not happen under
// `bun run`. A suite that runs commands after importing a large module graph
// hits it on every run.
// Only Bun's test runner is affected, so the workaround needs both the Bun
// runtime and `NODE_ENV=test` (which `bun test` sets). Jest and Vitest also
// set `NODE_ENV=test`, but they run on Node and keep the pipe path below.
const CHILD_STDIO_CORRUPTED =
  process.versions['bun'] !== undefined && process.env['NODE_ENV'] === 'test'

/** Turns a finished `spawnSync` into a {@link CommandResult}. Exported for tests. */
export function fromSpawnSync<S extends string | Buffer>(
  proc: { status: number | null; signal: NodeJS.Signals | null; error?: Error | undefined },
  stdout: S,
  stderr: string,
): CommandResult<S> {
  const code = (proc.error as NodeJS.ErrnoException | undefined)?.code
  return {
    exitCode: proc.status ?? 1,
    // Bun reports a failed spawn with `status` undefined, not null.
    ...(proc.status == null ? { neverExited: true as const, ...syncStop(proc) } : {}),
    // A real status with a timeout: the child exited, but a process it started
    // held the pipes until the deadline. With the cap: the child passed it and
    // exited before the kill landed.
    ...(proc.status != null && (code === 'ETIMEDOUT' || code === 'ENOBUFS')
      ? { outputIncomplete: true as const }
      : {}),
    stdout,
    stderr,
    // `proc.error` is set for a failed spawn, a timeout, the output cap, or a
    // failed stdin write. The first three usually leave `status` null; when
    // they do not, `outputIncomplete` is set above. A stdin write error can
    // come with a child that did exit, so it is kept either way.
    ...(proc.error ? { error: proc.error.message } : {}),
  }
}

/**
 * Capture output the one way that works under `bun test`. The child does its
 * own `<in >out 2>err` redirects to temp files, and the runner reads the files
 * back. `binary` and `argv` are passed as separate `sh` positional parameters
 * and never parsed by the shell, so spaces, shell characters and `$()` in an
 * argument have no effect. `exec` replaces `sh`, so the exit status, cwd, env
 * and timeout all belong to the child, as on the pipe path.
 */
function runViaChildRedirect(
  binary: string,
  argv: string[],
  opts: CommandRunOptions,
  timeoutMs: number | undefined,
  bytes: boolean,
): CommandResult<string | Buffer> {
  const { env } = mergedEnv(opts)
  // A binary that cannot be found would make `exec` fail and `sh` exit 127,
  // which reads as the command's own answer. Check first, so the result is
  // the same stand-in the pipe path reports for a failed spawn. This also
  // keeps a binary named like an option (`-a`) from reaching `exec` as one,
  // unless an executable named `-a` is on PATH.
  if (which(binary, { cwd: opts.cwd, env: { PATH: env['PATH'] } }) === undefined) {
    return emptyStdout(spawnFailure(`spawnSync ${binary} ENOENT`), bytes)
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
        // SIGKILL, not spawnSync's default SIGTERM. The timeout is a hard
        // cap. spawnSync sends the signal on expiry and then keeps waiting for
        // an exit, so a child that ignores SIGTERM would run to completion.
        killSignal: 'SIGKILL',
        env,
      },
    )
    // The child's `>` and `2>` create the redirect files, so neither exists
    // when `sh` itself never ran. The case that matters is a spawn that fails
    // with EAGAIN when the process table is full. It must not throw ENOENT
    // here. A missing file reads as empty, as the pipe path reports for a
    // child that wrote nothing.
    const readOrEmpty = (p: string): Buffer => {
      try {
        return readFileSync(p)
      } catch {
        return Buffer.alloc(0)
      }
    }
    // Output goes to a file, so there is no maxBuffer. Only the disk limits it.
    const stdout = readOrEmpty(outFile)
    return fromSpawnSync(proc, bytes ? stdout : stdout.toString(), readOrEmpty(errFile).toString())
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
 * Processes it started keep running, so a run that may start background work
 * (an install with postinstall scripts, a daemon) belongs on
 * `spawnRunnerAsync` with `processGroup: true`. Captured output is capped at
 * 256 MB per stream, or `maxOutputBytes`. Under `bun test` (the Bun
 * runtime with `NODE_ENV=test`) it captures through `/bin/sh` and temp files
 * instead of pipes (see `runViaChildRedirect`).
 *
 * @param binary - A name looked up on `PATH`, or a path. On Windows a `.cmd`
 *   or `.bat` file runs through `cmd.exe` (see the README's Platforms section).
 * @param options - See {@link SpawnRunnerOptions}.
 * @returns A runner for that binary.
 *
 * @example
 * ```ts
 * const git = spawnRunner('git')
 * const r = git.run(['status', '--porcelain'], { cwd: '.', timeoutMs: 10_000 })
 * if (r.exitCode === 0) console.log(r.stdout)
 * ```
 */
export function spawnRunner(binary: string, options: SpawnRunnerOptions = {}): CommandRunner {
  return {
    binary,
    run: (argv, opts) => {
      const target = lookupBinary(binary, options, opts)
      if (target === undefined) return spawnFailure(notOnAbsolutePath('spawnSync', binary))
      return runSync(target, argv, opts, false) as CommandResult
    },
  }
}

/**
 * Options for {@link spawnRunner} and `spawnRunnerAsync`.
 *
 * @experimental
 */
export interface SpawnRunnerOptions {
  /**
   * Find a bare `binary` on absolute `PATH` entries only, and spawn the
   * absolute path found. A relative or empty entry is looked up from the
   * child's `cwd`, and a Windows spawn of a bare name searches `cwd` first,
   * so without this a file planted in that folder can run in its place. Use
   * it for a command run inside a folder you do not trust. Not found reads as
   * a missing binary (`ENOENT`). A `binary` with a separator is a path and is
   * run as given. See `which` with `absolutePathOnly`. Default `false`.
   */
  absolutePathOnly?: boolean | undefined
}

/**
 * The file to spawn for `binary`: itself, or with `absolutePathOnly` the
 * absolute match on `PATH` (from `opts.env` over the parent's), or
 * `undefined` when there is none.
 */
export function lookupBinary(
  binary: string,
  options: SpawnRunnerOptions,
  opts: Pick<CommandRunOptions, 'env'>,
): string | undefined {
  if (options.absolutePathOnly !== true) return binary
  if (binary.includes('/') || (process.platform === 'win32' && binary.includes('\\'))) {
    return binary
  }
  return which(binary, { env: opts.env, absolutePathOnly: true })
}

/** The spawn error text for a binary {@link lookupBinary} did not find. */
export function notOnAbsolutePath(spawnName: string, binary: string): string {
  return `${spawnName} ${binary} ENOENT: not found on an absolute PATH entry`
}

/**
 * A {@link BytesCommandRunner}: {@link spawnRunner} with stdout returned as
 * the bytes the child wrote, never decoded. Use it where decoding would
 * change the data: invalid UTF-8 decodes to U+FFFD, so a hash of decoded
 * output is not the hash of the bytes. Stderr is decoded as UTF-8, so
 * `failureText` and `CommandFailed` read as they do for text. `maxOutputBytes`
 * cuts stdout at exactly the cap. It takes no {@link SpawnRunnerOptions}, so
 * no `absolutePathOnly`. Everything else is as for `spawnRunner`, including
 * the `bun test` capture path.
 *
 * @param binary - A name looked up on `PATH`, or a path. On Windows a `.cmd`
 *   or `.bat` file runs through `cmd.exe` (see the README's Platforms section).
 * @returns A runner for that binary.
 *
 * @example
 * ```ts
 * const git = spawnRunnerBytes('git')
 * const blob = runChecked(git, ['cat-file', 'blob', sha], { cwd: '.' }).stdout
 * const digest = createHash('sha256').update(blob).digest('hex')
 * ```
 *
 * @experimental
 */
export function spawnRunnerBytes(binary: string): BytesCommandRunner {
  return {
    binary,
    run: (argv, opts) => runSync(binary, argv, opts, true) as CommandResult<Buffer>,
  }
}

/** The sync capture runners' `run`; `bytes` keeps stdout as a `Buffer`. */
function runSync(
  binary: string,
  argv: string[],
  opts: CommandRunOptions,
  bytes: boolean,
): CommandResult<string | Buffer> {
  const timeoutMs = normalizeTimeout(opts.timeoutMs)
  const cap = normalizeOutputCap(opts.maxOutputBytes) ?? DEFAULT_SYNC_OUTPUT_CAP
  const cwdMessage = cwdError(`spawnSync ${binary}`, binary, argv, opts)
  if (cwdMessage !== undefined) return emptyStdout(spawnFailure(cwdMessage), bytes)
  if (CHILD_STDIO_CORRUPTED) return runViaChildRedirect(binary, argv, opts, timeoutMs, bytes)
  const plan = spawnPlan(binary, argv, opts)
  if ('refusal' in plan) return emptyStdout(spawnFailure(plan.refusal), bytes)
  const proc = spawnSync(plan.file, plan.args, {
    ...planOptions(plan),
    cwd: opts.cwd,
    maxBuffer: cap,
    timeout: timeoutMs,
    // See `runViaChildRedirect`: the default SIGTERM is not a hard cap.
    killSignal: 'SIGKILL',
    input: opts.input,
    ...mergedEnv(opts),
  })
  // Past the cap, a stream can end mid-character; cut it back to a whole one.
  const text = (b: Buffer | null | undefined) =>
    b == null ? '' : (b.length > cap ? utf8Prefix(b, cap) : b).toString()
  const capped = (proc.error as NodeJS.ErrnoException | undefined)?.code === 'ENOBUFS'
  const stderr = capped ? text(proc.stderr) : (proc.stderr?.toString() ?? '')
  if (bytes) {
    const out = proc.stdout ?? Buffer.alloc(0)
    return fromSpawnSync(proc, out.length > cap ? out.subarray(0, cap) : out, stderr)
  }
  return fromSpawnSync(proc, capped ? text(proc.stdout) : (proc.stdout?.toString() ?? ''), stderr)
}

/** `result`, a run with no output, with stdout as a bytes runner reports it when `bytes`. */
export function emptyStdout(result: CommandResult, bytes: boolean): CommandResult<string | Buffer> {
  return bytes ? { ...result, stdout: Buffer.alloc(0) } : result
}

/** `result` with a bytes runner's stdout decoded as UTF-8, for messages. */
export function decodedResult(result: CommandResult<string | Buffer>): CommandResult {
  const { stdout } = result
  return typeof stdout === 'string'
    ? (result as CommandResult)
    : { ...result, stdout: stdout.toString() }
}
