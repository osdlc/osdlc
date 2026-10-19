/**
 * Helpers for reading a {@link CommandResult}: did it run and succeed, what
 * to tell a person, and its stdout as JSON.
 *
 * None of them throw for a failed command: a failure stays a value the
 * caller reads. Use `runChecked` when stopping on failure is the only
 * sensible response.
 */

import type { AsyncCommandRunner, AsyncCommandRunOptions } from './async.ts'
import type { CommandOutput, CommandResult, CommandRunner, CommandRunOptions } from './sync.ts'

/**
 * Whether the process started and exited 0. `exitCode` alone is not enough:
 * a spawn failure, timeout or abort reports a stand-in `1`, and a caller that
 * reads exit codes as answers must rule that out first.
 *
 * Takes any runner's result: a `CommandResult`, a `StreamResult` or a
 * `ManagedProcessExit`.
 *
 * @returns `true` when `neverExited` is not set and `exitCode` is 0.
 */
export function ran(result: { exitCode: number; neverExited?: boolean | undefined }): boolean {
  return result.neverExited !== true && result.exitCode === 0
}

/**
 * The child's trimmed stderr, else the runner's trimmed `error` (a failed
 * spawn, a timeout, an abort), else `''`. Use it where a failure message reads
 * stderr: since the runner's message is only in `error`, reading `stderr`
 * alone shows nothing when the command never ran. A bytes runner's stderr is
 * decoded as UTF-8.
 *
 * @param result - A run's result.
 * @returns The text, trimmed; `''` when both are empty.
 * @experimental
 *
 * @example
 * ```ts
 * const r = spawnRunner('git').run(['fetch'], { cwd: '.' })
 * if (!ran(r)) console.error(`fetch failed: ${stderrOrError(r)}`)
 * ```
 */
export function stderrOrError(
  result: Pick<CommandResult<CommandOutput>, 'stderr' | 'error'>,
): string {
  return asText(result.stderr).trim() || (result.error?.trim() ?? '')
}

/** Output as text: a bytes runner's output decoded as UTF-8. */
function asText(output: CommandOutput): string {
  return typeof output === 'string' ? output : output.toString()
}

/** Options for {@link failureText}. */
export interface FailureTextOptions {
  /**
   * Return both streams instead of one: trimmed stderr (or the runner's
   * `error`, when the child wrote no stderr) and trimmed stdout,
   * newline-joined, empty ones dropped. Empty when stderr, `error` and stdout
   * are all empty; there is no `exit N` fallback. This is what `CommandFailed.detail`
   * returns. Use it when both halves matter, such as a git hook that rejects
   * a commit: git's own error is on stderr, the hook's reason on stdout.
   */
  both?: boolean | undefined
}

/**
 * The failure text to show a person. By default it picks one stream, which
 * suits a one-line message: trimmed stderr, else the runner's trimmed
 * `error` (a failed spawn, a timeout), else trimmed stdout (some commands
 * explain a failure there), else `exit N`. With `both: true` it
 * joins both streams (see {@link FailureTextOptions.both}). A bytes runner's
 * output is decoded as UTF-8.
 *
 * @param result - The result of a failed run.
 * @param opts - `both: true` to join both streams.
 * @returns The message. Non-empty unless `both` is set and there is no text
 * at all.
 */
export function failureText(
  result: Pick<CommandResult<CommandOutput>, 'exitCode' | 'stdout' | 'stderr' | 'error'>,
  opts: FailureTextOptions = {},
): string {
  const stderr = stderrOrError(result)
  const stdout = asText(result.stdout).trim()
  if (opts.both === true) return [stderr, stdout].filter(Boolean).join('\n')
  return stderr || stdout || `exit ${result.exitCode}`
}

/**
 * The first non-blank line of `text`, trimmed; `fallback` when there is
 * none. For short diagnostics from multi-line tool output.
 *
 * @param text - Usually `stdout` or `stderr`.
 * @param fallback - Returned when every line is blank. Defaults to `''`.
 * @experimental
 */
export function firstLine(text: string, fallback = ''): string {
  return (
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '') ?? fallback
  )
}

/**
 * Outcome of {@link runJson}: a parsed value, or why there is none. Two
 * fields are named `reason`: `j.reason` says why there is no value (`failed`,
 * `unparseable` or `invalid`), and `j.result.reason` says why the command
 * never finished, when it did not (see `NeverExitedReason`).
 *
 * @experimental
 */
export type JsonRun<T> =
  | { ok: true; value: T; result: CommandResult }
  | {
      ok: false
      /**
       * `failed`: did not run, or exited with a code not in `okExitCodes`.
       * `unparseable`: exited with an accepted code, and stdout was not JSON.
       */
      reason: 'failed' | 'unparseable'
      /** A human-readable explanation (the failure text, or the parse error). */
      message: string
      result: CommandResult
    }
  | {
      ok: false
      /** `invalid`: stdout was JSON, and the `parse` option threw for it. */
      reason: 'invalid'
      /** `stdout JSON was rejected: ` and the thrown error's message. */
      message: string
      /** What `parse` threw, such as a schema library's error with its issue list. */
      cause: unknown
      result: CommandResult
    }

/**
 * Options for {@link runJson}, apart from `parse`, which is typed by the
 * value it returns. A value typed `RunJsonOptions` leaves `T` to the caller.
 *
 * @experimental
 */
export interface RunJsonOptions {
  /**
   * Skip leading non-JSON output (log lines, banners). The JSON is the rest of
   * stdout from the first line (after `\n` or `\r`) that starts with `{` or
   * `[` and parses to the end, so a `[INFO] ...` prefix is skipped too.
   * Trailing output is not handled. Off by default: strict `JSON.parse` of
   * the whole stdout.
   */
  tolerateLeadingLog?: boolean | undefined
  /**
   * Exit codes that count as an answer, for a tool that prints JSON and
   * exits non-zero on purpose (`npm outdated --json` exits 1 when anything is
   * outdated). Default `[0]`. List `0` too if it still counts. A run that
   * never exited is `failed` whatever its stand-in code. Output from an
   * accepted non-zero exit must still parse, so pass a `parse` that rejects
   * the tool's own error output.
   */
  okExitCodes?: readonly number[] | undefined
}

/** The `parse` option of `runJson` and its siblings. `T` is what it returns. */
interface ParseOption<T> {
  /**
   * Check the parsed value and return it typed, such as a schema's `parse`.
   * A throw makes the outcome `invalid`. It must be sync: a returned promise
   * is also `invalid`. Without it, `T` is the caller's claim and is not
   * checked.
   */
  parse?: ((value: unknown) => T) | undefined
}

/** Options with an optional `parse`. */
type JsonOptions<T> = RunJsonOptions & ParseOption<T>

/**
 * Parse a finished run's stdout as JSON, if it ran and exited with a code in
 * `okExitCodes` (default `[0]`). Without the `parse` option, `T` is the
 * caller's claim about the shape and is not checked; pass `parse` when the
 * producer is not trusted. Never throws.
 *
 * @param result - A finished run.
 * @param opts - Parse options.
 * @returns `{ ok: true, value }`, or `{ ok: false, reason, message }` with
 * `reason` `failed` (did not run, or exited with a code not accepted),
 * `unparseable`, or `invalid` (`parse` threw; `cause` holds what it threw).
 * @experimental
 */
export function parseJsonResult<T = unknown>(
  result: CommandResult,
  opts: JsonOptions<T> = {},
): JsonRun<T> {
  const okExitCodes = opts.okExitCodes ?? [0]
  if (result.neverExited === true || !okExitCodes.includes(result.exitCode)) {
    return { ok: false, reason: 'failed', message: failureText(result), result }
  }
  const parsed = tryParse(result.stdout, opts.tolerateLeadingLog === true)
  if (!parsed.ok) {
    return {
      ok: false,
      reason: 'unparseable',
      message: `stdout is not JSON: ${parsed.error}`,
      result,
    }
  }
  if (opts.parse === undefined) return { ok: true, value: parsed.value as T, result }
  let value: T
  try {
    value = opts.parse(parsed.value)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      reason: 'invalid',
      message: `stdout JSON was rejected: ${why}`,
      cause: e,
      result,
    }
  }
  if (isThenable(value)) {
    // An async `parse` (such as `parseAsync`): its verdict would arrive too
    // late, so say so, and keep its rejection from going unhandled.
    value.then(undefined, () => {})
    return {
      ok: false,
      reason: 'invalid',
      message: 'stdout JSON was rejected: parse returned a promise; it must be sync',
      cause: value,
      result,
    }
  }
  return { ok: true, value, result }
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    (typeof v === 'object' || typeof v === 'function') &&
    v !== null &&
    typeof (v as { then?: unknown }).then === 'function'
  )
}

function tryParse(
  stdout: string,
  tolerateLeadingLog: boolean,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(stdout) }
  } catch (e) {
    const start = tolerateLeadingLog ? jsonStart(stdout) : -1
    if (start > 0) {
      try {
        return { ok: true, value: JSON.parse(stdout.slice(start)) }
      } catch {
        // Report the whole-stdout error below.
      }
    }
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Where the JSON starts for `tolerateLeadingLog`: the line starting with `{` or
 * `[` whose brackets stay open until the last bracket in stdout closes them.
 * Only that line's suffix can parse, so stdout is parsed once more at most.
 * A JSON string holds no raw line break, so string state resets at each one.
 * `-1` when no line qualifies.
 */
function jsonStart(stdout: string): number {
  // The bracket depth after each bracket outside a string, in order.
  const depths: number[] = []
  // Each candidate line: where it starts, its first bracket's index in
  // `depths`, and the depth before that bracket.
  const lines: { at: number; first: number; before: number }[] = []
  let depth = 0
  let inString = false
  for (let i = 0; i < stdout.length; i++) {
    const c = stdout[i]
    if (c === '\n' || c === '\r') {
      inString = false
    } else if (inString) {
      if (c === '"') inString = false
      else if (c === '\\' && stdout[i + 1] !== '\n' && stdout[i + 1] !== '\r') i++
    } else if (c === '"') {
      inString = true
    } else if (c === '{' || c === '[') {
      const prev = stdout[i - 1]
      if (prev === '\n' || prev === '\r') lines.push({ at: i, first: depths.length, before: depth })
      depths.push(++depth)
    } else if (c === '}' || c === ']') {
      depths.push(--depth)
    }
  }
  const end = depths.at(-1)
  // The lowest depth from each bracket on, leaving out the last bracket.
  let low = Infinity
  let next = depths.length - 2
  for (let k = lines.length - 1; k >= 0; k--) {
    const { at, first, before } = lines[k]!
    for (; next >= first; next--) low = Math.min(low, depths[next]!)
    if (before === end && low > before) return at
  }
  return -1
}

/**
 * The runner's options tuple, `[opts]` or `[opts?]`, with the `runJson`
 * options added. A conditional rather than a mapped type, so `T` can be inferred
 * from `parse`; `NoInfer` keeps `P` inferred from the runner alone.
 */
type WithJsonOptions<P extends unknown[], T> = P extends [opts: infer O]
  ? [opts: NoInfer<O> & JsonOptions<T>]
  : P extends [opts?: infer O]
    ? [opts?: NoInfer<O> & JsonOptions<T>]
    : never

/**
 * Run a command with a sync runner and parse its stdout as JSON
 * ({@link parseJsonResult}). Never throws for a failed command; a programmer
 * error, such as an invalid `timeoutMs`, throws. With the `parse` option,
 * `T` is what `parse` returns.
 *
 * Takes the runner's own options, so a `withDefaults` runner needs only the
 * options it did not bind.
 *
 * @param runner - Runs the command; pass a fake in tests.
 * @param argv - Arguments, without the binary name.
 * @param opts - Per-call options and {@link RunJsonOptions}.
 * @returns A {@link JsonRun}: the parsed value, or why there is none.
 *
 * @example
 * ```ts
 * const gh = spawnRunner('gh')
 * const r = runJson<{ login: string }>(gh, ['api', 'user'], { cwd: '.' })
 * if (r.ok) console.log(r.value.login)
 * else console.error(r.message)
 * ```
 *
 * @experimental
 */
export function runJson<T = unknown>(
  runner: CommandRunner,
  argv: string[],
  opts: CommandRunOptions & JsonOptions<T>,
): JsonRun<T>
// A runner that needs no options, such as one with `cwd` bound. Its only type
// parameter is `T`, so `runJson<T>(bound, argv)` compiles: naming `T` on the
// generic overload below would also fix `P` to its default.
export function runJson<T = unknown>(
  runner: { run(argv: string[]): CommandResult },
  argv: string[],
  opts?: Partial<CommandRunOptions> & JsonOptions<T>,
): JsonRun<T>
export function runJson<T = unknown, P extends unknown[] = [opts: CommandRunOptions]>(
  runner: { run(argv: string[], ...opts: P): CommandResult },
  argv: string[],
  ...opts: WithJsonOptions<P, T>
): JsonRun<T>
export function runJson<T>(
  runner: { run(argv: string[], ...opts: unknown[]): CommandResult },
  argv: string[],
  ...opts: unknown[]
): JsonRun<T> {
  const { run, json } = splitJsonOptions<T>(opts)
  return parseJsonResult<T>(runner.run(argv, ...run), json)
}

/**
 * The async version of {@link runJson}. Never rejects for a failed command;
 * a programmer error, such as an invalid `timeoutMs`, rejects. `parse` is
 * sync, as in `runJson`.
 *
 * @experimental
 */
export async function runJsonAsync<T = unknown>(
  runner: AsyncCommandRunner,
  argv: string[],
  opts: AsyncCommandRunOptions & JsonOptions<T>,
): Promise<JsonRun<T>>
// A runner that needs no options; see the same overload of `runJson`.
export async function runJsonAsync<T = unknown>(
  runner: { run(argv: string[]): Promise<CommandResult> },
  argv: string[],
  opts?: Partial<AsyncCommandRunOptions> & JsonOptions<T>,
): Promise<JsonRun<T>>
export async function runJsonAsync<
  T = unknown,
  P extends unknown[] = [opts: AsyncCommandRunOptions],
>(
  runner: { run(argv: string[], ...opts: P): Promise<CommandResult> },
  argv: string[],
  ...opts: WithJsonOptions<P, T>
): Promise<JsonRun<T>>
export async function runJsonAsync<T>(
  runner: { run(argv: string[], ...opts: unknown[]): Promise<CommandResult> },
  argv: string[],
  ...opts: unknown[]
): Promise<JsonRun<T>> {
  const { run, json } = splitJsonOptions<T>(opts)
  return parseJsonResult<T>(await runner.run(argv, ...run), json)
}

/** Split `runJson`'s options into the runner's and the parse step's. */
function splitJsonOptions<T>(opts: unknown[]): { run: unknown[]; json: JsonOptions<T> } {
  if (opts[0] === undefined) return { run: [], json: {} }
  const { tolerateLeadingLog, parse, okExitCodes, ...run } = opts[0] as JsonOptions<T>
  return { run: [run], json: { tolerateLeadingLog, parse, okExitCodes } }
}
