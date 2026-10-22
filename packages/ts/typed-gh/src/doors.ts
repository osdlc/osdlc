/**
 * The three doors, as `@osdlc/typed-git` has them: the plain verb (checked),
 * `gh.try.*` and `gh.soft.*`.
 *
 *   - **Plain / checked**: a value, or a throw. A failed `gh` throws a
 *     `FailureError` carrying the classified `GhFailure` (its `cause` is the
 *     `CommandFailed`), so a caller that reports it, such as `runMain`, reads
 *     "signed out" or "rate limited" and not a bare exit; output that exited 0
 *     but could not be read throws one of kind `unreadable`. A verb that
 *     reads one thing (`prView`, `issueView`, `repoView`) answers `null` when
 *     GitHub says there is no such thing: absence is an answer.
 *   - **`try`**: the same call, with the failure returned as
 *     `Result<T, GhFailure>`. It catches a thrown failure (a `FailureError`, or a
 *     `CommandFailed` from `raw`-level code) and nothing else: a `RangeError` for a bad argument still throws.
 *   - **`soft`**: the same call, with `null` for a failure. Only the queries
 *     have a soft form; no mutation does.
 *
 * Both are facades over the whole client, so a new method costs nothing here.
 */

import {
  CommandFailed,
  isCommandFailed,
  runChecked,
  runCheckedAsync,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '@osdlc/command-seam'
import { err, FailureError, isFailure, ok, type Failure, type Result } from '@osdlc/result'

import { classifyGhFailure, type GhFailure, unreadableFailure } from './failure.ts'
import type { GhVerb } from './verbs.ts'

/**
 * Read the result of running `verb` as the plain door does.
 *
 * A checked verb has already thrown on a non-zero exit (the runner is
 * `runChecked`), and a probe (`installed`, `authStatus`, `api`) carries its
 * failure in its value. A read that exited non-zero throws `CommandFailed`,
 * unless the verb's `absent` says gh's answer was "there is no such thing",
 * which `parse` turns into `null`. A read that exited 0 but parsed to `null`
 * could not be read completely, and throws.
 *
 * @throws `FailureError` carrying the classified {@link GhFailure} for a failed run.
 * @throws `FailureError` carrying an `unreadable` {@link GhFailure}.
 */
export function settle<T>(verb: GhVerb<T>, result: CommandResult, binary: string | undefined): T {
  if (verb.checked || verb.probe === true) return verb.parse(result)
  if (result.neverExited === true || result.exitCode !== 0) {
    if (result.neverExited !== true && verb.absent?.(result) === true) return verb.parse(result)
    throw ghFailureError(new CommandFailed(verb.argv, result, binary))
  }
  const value = verb.parse(result)
  if (value === null) {
    throw new FailureError(unreadableFailure(verb.argv, result.stdout, binary))
  }
  return value
}

/**
 * The error the plain door throws for a failed run: a `FailureError` carrying
 * the {@link GhFailure} that {@link classifyGhFailure} reads from it, with the
 * `CommandFailed` as its `cause`. Anything else is returned as it is.
 */
export function ghFailureError(error: unknown): unknown {
  return isCommandFailed(error) ? new FailureError(classifyGhFailure(error)) : error
}

/** {@link runChecked}, throwing {@link ghFailureError}'s classified failure. */
export function runCheckedGh(
  runner: CommandRunner,
  argv: string[],
  opts: CommandRunOptions,
): CommandResult {
  try {
    return runChecked(runner, argv, opts)
  } catch (error) {
    throw ghFailureError(error)
  }
}

/** {@link runCheckedAsync}, rejecting with {@link ghFailureError}'s classified failure. */
export async function runCheckedGhAsync(
  runner: AsyncCommandRunner,
  argv: string[],
  opts: AsyncCommandRunOptions,
): Promise<CommandResult> {
  try {
    return await runCheckedAsync(runner, argv, opts)
  } catch (error) {
    throw ghFailureError(error)
  }
}

/** The methods the doors leave out: the escape hatches, pure helpers and plain properties. */
type Triable<C> = Omit<
  C,
  | 'raw'
  | 'rawChecked'
  | 'at'
  | 'withRepo'
  | 'ownerRepo'
  | 'try'
  | 'soft'
  | 'cwd'
  | 'repo'
  | 'hostname'
>

/** Every synchronous client method, returning a `Result<T, GhFailure>`. */
export type TriedSync<C> = {
  [K in keyof Triable<C>]: Triable<C>[K] extends (...a: infer A) => infer R
    ? (...a: A) => Result<R, GhFailure>
    : never
}

/** Every awaitable client method, promising a `Result<T, GhFailure>`. */
export type TriedAsync<C> = {
  [K in keyof Triable<C>]: Triable<C>[K] extends (...a: infer A) => Promise<infer R>
    ? (...a: A) => Promise<Result<R, GhFailure>>
    : never
}

/**
 * The queries that have a soft form. A mutation has none: swallowing the failure
 * of a write is how a caller ends up believing it worked.
 */
export const SOFT_METHODS = [
  'prList',
  'prView',
  'prFind',
  'openPrFor',
  'prViewSettled',
  'prBody',
  'graphql',
  'labelList',
  'issueList',
  'issueView',
  'repoList',
  'repoView',
  'searchPrs',
  'prReviewThreads',
] as const

/** The name of a method with a soft form. */
export type SoftMethod = (typeof SOFT_METHODS)[number]

type OrNull<R> = R extends Promise<infer U> ? Promise<U | null> : R | null

/** Each queried method again, returning `null` instead of throwing. One type for both clients. */
export type Soft<C> = {
  [K in SoftMethod & keyof C]: C[K] extends (...a: infer A) => infer R
    ? (...a: A) => OrNull<R>
    : never
}

/**
 * Whether `error` carries a failure to hand back rather than a bug to let
 * through. By shape, not `instanceof`: two installed copies of command-seam or
 * result each have their own classes.
 */
function isGhFailure(error: unknown): error is { failure: Failure } {
  return (
    typeof error === 'object' &&
    error !== null &&
    isFailure((error as { failure?: unknown }).failure)
  )
}

/** The failure a caught `CommandFailed` or `FailureError` stands for. */
export function failureOf(error: { failure: Failure }): GhFailure {
  const thrown: unknown = error
  return isCommandFailed(thrown) ? classifyGhFailure(thrown) : (error.failure as GhFailure)
}

function facade<C extends object>(
  client: C,
  wrap: (call: () => unknown, name: string) => unknown,
): unknown {
  return new Proxy(client, {
    get(target, prop) {
      // Read from the target, not the proxy: a getter (`try` itself) must run
      // against the real client rather than recursing through the facade.
      const value: unknown = Reflect.get(target, prop)
      if (typeof value !== 'function') return value
      const method = value as (...a: unknown[]) => unknown
      const name = String(prop)
      return (...args: unknown[]) => wrap(() => method.apply(target, args), name)
    },
  })
}

/** Wrap a synchronous client so every method returns a `Result<T, GhFailure>`. */
export function triedSync<C extends object>(client: C): TriedSync<C> {
  return facade(client, (call): Result<unknown, GhFailure> => {
    try {
      return ok(call())
    } catch (error) {
      if (isGhFailure(error)) return err(failureOf(error))
      throw error
    }
  }) as TriedSync<C>
}

/** Wrap an awaitable client so every method promises a `Result<T, GhFailure>`. */
export function triedAsync<C extends object>(client: C): TriedAsync<C> {
  return facade(client, async (call): Promise<Result<unknown, GhFailure>> => {
    try {
      return ok(await call())
    } catch (error) {
      if (isGhFailure(error)) return err(failureOf(error))
      throw error
    }
  }) as TriedAsync<C>
}

function checkSoft(name: string): void {
  if (!(SOFT_METHODS as readonly string[]).includes(name)) {
    throw new TypeError(
      `gh.soft.${name} has no soft form; call it through gh.try (or the plain method) instead`,
    )
  }
}

/** Wrap a synchronous client so a failed query returns `null`. */
export function softSync<C extends object>(client: C): Soft<C> {
  return facade(client, (call, name) => {
    checkSoft(name)
    try {
      return call()
    } catch (error) {
      if (isGhFailure(error)) return null
      throw error
    }
  }) as Soft<C>
}

/** Wrap an awaitable client so a failed query resolves to `null`. */
export function softAsync<C extends object>(client: C): Soft<C> {
  return facade(client, async (call, name) => {
    checkSoft(name)
    try {
      return await call()
    } catch (error) {
      if (isGhFailure(error)) return null
      throw error
    }
  }) as Soft<C>
}
