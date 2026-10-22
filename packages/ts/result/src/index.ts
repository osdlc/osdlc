/**
 * `@osdlc/result`: a plain-object `Result` and a human-friendly `Failure`.
 *
 * A function that can fail in a way the caller should handle returns a
 * {@link Result}: `{ ok: true, value }` or `{ ok: false, error }`. The error is
 * usually a {@link Failure}: a `kind` to branch on, a `message` for people, and
 * optionally a `hint` (what to do next), a `detail` (the raw tool output) and
 * the `cause` that produced it. A Result is a plain object, so it survives
 * JSON, structured clone and a test's `toEqual`. Async results are just
 * `Promise<Result<…>>`.
 */

/** The success arm of a {@link Result}. */
export type Ok<T> = { readonly ok: true; readonly value: T }

/** The failure arm of a {@link Result}. */
export type Err<E> = { readonly ok: false; readonly error: E }

/** Either a value or an error. `E` defaults to {@link Failure}. */
export type Result<T, E = Failure> = Ok<T> | Err<E>

/**
 * A failure written for people first. `kind` is the part code branches on; make
 * it a string-literal union per layer so a `switch` over it is exhaustive.
 */
export interface Failure<K extends string = string> {
  /** What went wrong, as a stable machine-readable name. */
  kind: K
  /** One plain sentence for a person. */
  message: string
  /** What to do about it, when the layer that knows can say. */
  hint?: string
  /** The raw output behind the message, such as a tool's stderr. */
  detail?: string
  /** The error or failure that produced this one. */
  cause?: unknown
}

/** A successful {@link Result}. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

/** A failed {@link Result}. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error }
}

/** Narrow a {@link Result} to its success arm. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok
}

/** Narrow a {@link Result} to its failure arm. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok
}

/** Transform the value of a success; a failure passes through. */
export function map<T, E, U>(result: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return result.ok ? ok(f(result.value)) : result
}

/** Transform the error of a failure; a success passes through. */
export function mapErr<T, E, F>(result: Result<T, E>, f: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(f(result.error))
}

/** Chain a step that can itself fail; the first failure wins. */
export function andThen<T, E, U, F>(
  result: Result<T, E>,
  f: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.ok ? f(result.value) : result
}

/** The value of a success, else `fallback`. */
export function unwrapOr<T, E, U>(result: Result<T, E>, fallback: U): T | U {
  return result.ok ? result.value : fallback
}

/**
 * The value of a success; a failure throws. A {@link Failure} error throws a
 * {@link FailureError} carrying it; any other error throws an `Error` whose
 * `cause` is that error.
 *
 * @throws {@link FailureError} or `Error`.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value
  const { error } = result
  if (isFailure(error)) throw new FailureError(error)
  throw new Error(`unwrap on an Err: ${String(error)}`, { cause: error })
}

/** Handle both arms and produce one value. */
export function match<T, E, R>(
  result: Result<T, E>,
  arms: { ok: (value: T) => R; err: (error: E) => R },
): R {
  return result.ok ? arms.ok(result.value) : arms.err(result.error)
}

/** Run `fn`; a throw becomes the error `toError` makes of it. */
export function attempt<T, E>(fn: () => T, toError: (thrown: unknown) => E): Result<T, E> {
  try {
    return ok(fn())
  } catch (thrown) {
    return err(toError(thrown))
  }
}

/** Await `fn`; a rejection (or a sync throw) becomes the error `toError` makes of it. */
export async function attemptAsync<T, E>(
  fn: () => Promise<T> | T,
  toError: (thrown: unknown) => E,
): Promise<Result<T, E>> {
  try {
    return ok(await fn())
  } catch (thrown) {
    return err(toError(thrown))
  }
}

/**
 * A {@link Failure} as a thrown error. `message` is the failure's message and
 * `cause` is the failure's `cause`; the whole failure is on `failure`.
 */
export class FailureError<F extends Failure = Failure> extends Error {
  readonly failure: F

  constructor(failure: F) {
    super(failure.message, failure.cause === undefined ? undefined : { cause: failure.cause })
    this.name = 'FailureError'
    this.failure = failure
  }
}

/** Whether `x` has the shape of a {@link Failure}: a string `kind` and a string `message`. */
export function isFailure(x: unknown): x is Failure {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { kind?: unknown }).kind === 'string' &&
    typeof (x as { message?: unknown }).message === 'string'
  )
}

/** One plain line for people: the message, then the hint when there is one. */
export function describe(failure: Failure): string {
  return failure.hint === undefined || failure.hint === ''
    ? failure.message
    : `${failure.message} ${failure.hint}`
}
