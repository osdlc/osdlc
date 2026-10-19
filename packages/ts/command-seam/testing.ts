/**
 * `@osdlc/command-seam/testing`: fakes for tests, kept out of the main
 * entry so production code never imports them.
 *
 * - `fakeRunner` answers capture-runner calls from a table and records them.
 * - `fakeBytesRunner` does the same for the bytes runners.
 * - `fakeNeverExited` builds the result of a run that never exited.
 * - `fakeProcess` is a managed-process handle the test ends by hand.
 */

import {
  signalName,
  type ManagedProcessExit,
  type ManagedProcessHandle,
  type ManagedProcessRunner,
  type ManagedProcessRunOptions,
} from './process.ts'
import {
  asAsync,
  type AsyncBytesCommandRunner,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
} from './async.ts'
import { shellQuote } from './quote.ts'
import type {
  BytesCommandRunner,
  CommandOutput,
  CommandResult,
  CommandRunner,
  NeverExitedReason,
} from './sync.ts'

/**
 * One call a fake received.
 *
 * @experimental
 */
export interface FakeCall<O> {
  argv: string[]
  opts: O
}

/** What a fake answers: fields over `{ exitCode: 0, stdout: '', stderr: '' }`. */
type FakeAnswer<O extends CommandOutput = string> = Partial<CommandResult<O>>

/** A fake's answer table, or a function that picks an answer. */
type FakeAnswers<O extends CommandOutput> =
  | Readonly<Record<string, FakeAnswer<O>>>
  | ((argv: string[], opts: AsyncCommandRunOptions) => FakeAnswer<O> | undefined)

/**
 * What `fakeRunner` returns.
 *
 * @experimental
 */
export interface FakeRunner {
  /** Pass this to the code under test. */
  runner: CommandRunner
  /**
   * The same fake as an {@link AsyncCommandRunner}, for async code. It shares
   * the answers and `calls`.
   */
  asyncRunner: AsyncCommandRunner
  /**
   * Every call, in order: a copy of its argv and a shallow copy of its
   * options. Typed with the async options, so a call made through
   * `asyncRunner` shows its `signal` or `processGroup`.
   */
  calls: FakeCall<AsyncCommandRunOptions>[]
}

/**
 * A fake {@link CommandRunner} that answers from a table and records every
 * call.
 *
 * `answers` maps an argv to the result fields that differ from a clean
 * empty run: `{ exitCode: 0, stdout: '', stderr: '' }`. The key is each
 * argument quoted with `shellQuote`, joined with single spaces: a plain
 * argument stays as it is, and one with a space or a shell character is
 * single-quoted, so `['-m', 'a b']` is `-m 'a b'` and cannot match
 * `['-m', 'a', 'b']`. It can also be a function of the call; return
 * `undefined` for no answer.
 *
 * A call with no answer reports a failed spawn, as a missing binary would:
 * `exitCode: 1`, `neverExited: true`, `reason: 'spawn'`, and
 * `fakeRunner: no answer for: <key>` in `error`, where `<key>` is the table
 * key that would answer it. So `ran()` is false and `runChecked` throws.
 * Code that reads a failed run as an answer may still go on, so assert on
 * `calls` to be sure every call was expected.
 *
 * Through `asyncRunner`, `signal` and `processGroup` are recorded but do
 * nothing, and `onSpawn` is never called.
 *
 * @param answers - Results by argv, or a function that picks one.
 * @returns The runner, the same fake as an async runner, and the list of
 * calls they received.
 *
 * @example
 * ```ts
 * const { runner, calls } = fakeRunner({ 'rev-parse --short HEAD': { stdout: 'abc\n' } })
 * runner.run(['rev-parse', '--short', 'HEAD'], { cwd: '/repo' }).stdout // 'abc\n'
 * calls[0]?.opts.cwd // '/repo'
 * ```
 *
 * @experimental
 */
export function fakeRunner(answers: FakeAnswers<string>): FakeRunner {
  const calls: FakeCall<AsyncCommandRunOptions>[] = []
  const runner: CommandRunner = { run: fakeRun('fakeRunner', answers, '', calls) }
  return { runner, asyncRunner: asAsync(runner), calls }
}

/**
 * What `fakeBytesRunner` returns.
 *
 * @experimental
 */
export interface FakeBytesRunner {
  /** Pass this to the code under test. */
  runner: BytesCommandRunner
  /** The same fake as an {@link AsyncBytesCommandRunner}. It shares the answers and `calls`. */
  asyncRunner: AsyncBytesCommandRunner
  /** Every call, in order, as for `fakeRunner`. */
  calls: FakeCall<AsyncCommandRunOptions>[]
}

/**
 * {@link fakeRunner} for the bytes runners: answers hold `stdout` and
 * `stderr` as a `Buffer`, over an empty run whose streams are empty buffers.
 * Keys, the no-answer result and `calls` are as for `fakeRunner`.
 *
 * @param answers - Results by argv, or a function that picks one.
 * @returns The runner, the same fake as an async runner, and the list of
 * calls they received.
 *
 * @example
 * ```ts
 * const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
 * const { runner } = fakeBytesRunner({ 'cat-file blob abc': { stdout: png } })
 * runner.run(['cat-file', 'blob', 'abc'], { cwd: '/repo' }).stdout // png
 * ```
 *
 * @experimental
 */
export function fakeBytesRunner(answers: FakeAnswers<Buffer>): FakeBytesRunner {
  const calls: FakeCall<AsyncCommandRunOptions>[] = []
  const runner: BytesCommandRunner = {
    run: fakeRun('fakeBytesRunner', answers, Buffer.alloc(0), calls),
  }
  return { runner, asyncRunner: asAsync(runner), calls }
}

/** A fake's `run`: record the call, then answer it from `answers`. */
function fakeRun<O extends CommandOutput>(
  name: string,
  answers: FakeAnswers<O>,
  empty: O,
  calls: FakeCall<AsyncCommandRunOptions>[],
): (argv: string[], opts: AsyncCommandRunOptions) => CommandResult<O> {
  const lookup =
    typeof answers === 'function'
      ? answers
      : (argv: string[]) => {
          const key = keyOf(argv)
          return Object.hasOwn(answers, key) ? answers[key] : undefined
        }
  return (argv, opts) => {
    calls.push({ argv: [...argv], opts: { ...opts } })
    const answer = lookup(argv, opts)
    if (answer !== undefined) return { exitCode: 0, stdout: empty, stderr: empty, ...answer }
    const error = `${name}: no answer for: ${keyOf(argv)}`
    return { exitCode: 1, stdout: empty, stderr: empty, neverExited: true, reason: 'spawn', error }
  }
}

/**
 * A `fakeRunner` table key. Not `shellJoin`: argv here has no binary name, so
 * a first argument with `=` (such as `--git-dir=/r`) is not a command name
 * and needs no quotes.
 */
function keyOf(argv: readonly string[]): string {
  return argv.map(shellQuote).join(' ')
}

/**
 * A fake answer for a run that never exited, with the fields the real
 * runners set together for `reason`: `exitCode: 1`, `neverExited: true`,
 * `reason`, `error: 'fake: <reason>'`, and `signal` where the sync runner
 * sets one (`SIGKILL` for `timeout` and `output`, `SIGTERM` for `signal`).
 * A death by a signal from elsewhere has no `error`, as on the real runners.
 * `fields` override any of these, such as the `signal` or the `error`.
 * It serves `fakeBytesRunner` too: `O` is inferred from where it is used.
 *
 * @param reason - Why the run never exited.
 * @param fields - Fields to set over the defaults.
 * @returns An answer for `fakeRunner`.
 *
 * @example
 * ```ts
 * const { runner } = fakeRunner({ 'fetch origin': fakeNeverExited('timeout') })
 * runner.run(['fetch', 'origin'], { cwd: '/repo' }).reason // 'timeout'
 * ```
 *
 * @experimental
 */
export function fakeNeverExited<O extends CommandOutput = string>(
  reason: NeverExitedReason,
  fields: Partial<CommandResult<O>> = {},
): Partial<CommandResult<O>> {
  const signal = NEVER_EXITED_SIGNAL[reason]
  return {
    exitCode: 1,
    neverExited: true,
    reason,
    ...(signal === undefined ? {} : { signal }),
    ...(reason === 'signal' ? {} : { error: `fake: ${reason}` }),
    ...fields,
  }
}

/** The signal the sync runner reports for each reason, where it reports one. */
const NEVER_EXITED_SIGNAL: Record<NeverExitedReason, NodeJS.Signals | undefined> = {
  spawn: undefined,
  timeout: 'SIGKILL',
  abort: undefined,
  signal: 'SIGTERM',
  output: 'SIGKILL',
}

/**
 * Options for {@link fakeProcess}.
 *
 * @experimental
 */
export interface FakeProcessOptions {
  /** The handle's pid. Default `4242`. */
  pid?: number | undefined
  /**
   * Which signals sent through `kill()` end the process, as for a process
   * that does not handle them: `exited` settles with `reason: 'abort'`.
   * `true` (the default) is every signal, `false` none, and a list only
   * those, such as `['SIGKILL']` for a process that survives `SIGTERM`.
   */
  exitOnKill?: boolean | readonly NodeJS.Signals[] | undefined
}

/**
 * What `fakeProcess` returns: a handle, plus the controls a test needs.
 *
 * @experimental
 */
export interface FakeProcess extends ManagedProcessHandle {
  /**
   * End the process: settle `exited` with these fields over
   * `{ exitCode: 0, signal: null }`. Only the first end counts, as for a
   * real process. To fake a death by a signal from elsewhere, pass
   * `{ exitCode: 1, signal, neverExited: true, reason: 'signal' }`, as
   * `managedProcessRunner` reports it.
   */
  exit(result?: Partial<ManagedProcessExit>): void
  /** Every signal passed to `kill()`, in order; `SIGTERM` when none was given. */
  signals: (NodeJS.Signals | number)[]
  /** A runner that returns this handle from every `run`. */
  runner: ManagedProcessRunner
  /** Every call `runner` received. */
  calls: FakeCall<ManagedProcessRunOptions>[]
}

/**
 * A fake {@link ManagedProcessHandle}: it starts nothing, and `exited`
 * settles when the test calls `exit()`, or when the code under test calls
 * `kill()` (see `exitOnKill`).
 *
 * @param opts - The pid, and which signals sent through `kill()` end the process.
 * @returns The handle, with `exit()`, the signals sent and a runner that
 * serves it.
 *
 * @example
 * ```ts
 * const proc = fakeProcess()
 * const server = proc.runner.run(['server.js'], { cwd: '.' })
 * proc.exit({ exitCode: 0 })
 * await server.exited // { exitCode: 0, signal: null }
 * ```
 *
 * @experimental
 */
export function fakeProcess(opts: FakeProcessOptions = {}): FakeProcess {
  const pid = opts.pid ?? 4242
  const exitOnKill = opts.exitOnKill ?? true
  let settle: (exit: ManagedProcessExit) => void = () => {}
  let settled = false
  const exited = new Promise<ManagedProcessExit>((resolve) => (settle = resolve))
  const exit = (result: Partial<ManagedProcessExit> = {}): void => {
    if (settled) return
    settled = true
    settle({ exitCode: 0, signal: null, ...result })
  }
  const signals: (NodeJS.Signals | number)[] = []
  const calls: FakeCall<ManagedProcessRunOptions>[] = []

  const proc: FakeProcess = {
    pid,
    exited,
    kill(signal: NodeJS.Signals | number = 'SIGTERM'): void {
      signals.push(signal)
      const name = typeof signal === 'number' ? signalName(signal) : signal
      // Signal 0 (a probe) and unknown numbers end nothing.
      if (name === undefined) return
      if (exitOnKill === false) return
      if (exitOnKill !== true && !exitOnKill.includes(name)) return
      exit({ exitCode: 1, signal: name, neverExited: true, reason: 'abort' })
    },
    exit,
    signals,
    calls,
    runner: {
      run(argv, runOpts) {
        calls.push({ argv: [...argv], opts: { ...runOpts } })
        return proc
      },
    },
  }
  return proc
}
