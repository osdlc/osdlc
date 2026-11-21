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
/** A successful {@link Result}. */
export function ok(value) {
    return { ok: true, value };
}
/** A failed {@link Result}. */
export function err(error) {
    return { ok: false, error };
}
/** Narrow a {@link Result} to its success arm. */
export function isOk(result) {
    return result.ok;
}
/** Narrow a {@link Result} to its failure arm. */
export function isErr(result) {
    return !result.ok;
}
/** Transform the value of a success; a failure passes through. */
export function map(result, f) {
    return result.ok ? ok(f(result.value)) : result;
}
/** Transform the error of a failure; a success passes through. */
export function mapErr(result, f) {
    return result.ok ? result : err(f(result.error));
}
/** Chain a step that can itself fail; the first failure wins. */
export function andThen(result, f) {
    return result.ok ? f(result.value) : result;
}
/** The value of a success, else `fallback`. */
export function unwrapOr(result, fallback) {
    return result.ok ? result.value : fallback;
}
/**
 * The value of a success; a failure throws. A {@link Failure} error throws a
 * {@link FailureError} carrying it; any other error throws an `Error` whose
 * `cause` is that error.
 *
 * @throws {@link FailureError} or `Error`.
 */
export function unwrap(result) {
    if (result.ok)
        return result.value;
    const { error } = result;
    if (isFailure(error))
        throw new FailureError(error);
    throw new Error(`unwrap on an Err: ${String(error)}`, { cause: error });
}
/** Handle both arms and produce one value. */
export function match(result, arms) {
    return result.ok ? arms.ok(result.value) : arms.err(result.error);
}
/** Run `fn`; a throw becomes the error `toError` makes of it. */
export function attempt(fn, toError) {
    try {
        return ok(fn());
    }
    catch (thrown) {
        return err(toError(thrown));
    }
}
/** Await `fn`; a rejection (or a sync throw) becomes the error `toError` makes of it. */
export async function attemptAsync(fn, toError) {
    try {
        return ok(await fn());
    }
    catch (thrown) {
        return err(toError(thrown));
    }
}
/**
 * A {@link Failure} as a thrown error. `message` is the failure's message and
 * `cause` is the failure's `cause`; the whole failure is on `failure`.
 */
export class FailureError extends Error {
    failure;
    constructor(failure) {
        super(failure.message, failure.cause === undefined ? undefined : { cause: failure.cause });
        this.name = 'FailureError';
        this.failure = failure;
    }
}
/** Whether `x` has the shape of a {@link Failure}: a string `kind` and a string `message`. */
export function isFailure(x) {
    return (typeof x === 'object' &&
        x !== null &&
        typeof x.kind === 'string' &&
        typeof x.message === 'string');
}
/** One plain line for people: the message, then the hint when there is one. */
export function describe(failure) {
    return failure.hint === undefined || failure.hint === ''
        ? failure.message
        : `${failure.message} ${failure.hint}`;
}
