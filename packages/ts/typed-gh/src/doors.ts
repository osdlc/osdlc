/**
 * The three call styles, as `@osdlc/typed-git` has them: the method that
 * throws, `gh.try.*` and `gh.soft.*`.
 *
 *   - The method that throws returns a value or throws. A failed `gh` throws a
 *     `FailureError` carrying the classified `GhFailure` (its `cause` is the
 *     `CommandFailed`). So a caller that reports it, such as `runMain`, shows
 *     "signed out" or "rate limited" and not a bare exit code. Output that
 *     exited 0 but could not be read throws one of kind `unreadable`. A verb
 *     that reads one thing (`prView`, `issueView`, `repoView`) returns `null`
 *     when GitHub says there is no such thing.
 *   - `try` makes the same call and returns the failure as
 *     `Result<T, GhFailure>`. It catches a thrown failure (a `FailureError`, or
 *     a `CommandFailed` from `raw`-level code) and nothing else. A `RangeError`
 *     for a bad argument still throws.
 *   - `soft` makes the same call and returns `null` for a failure. Only the
 *     queries have a soft form. No mutation does.
 *
 * `try` and `soft` are proxies over the whole client, so a new method needs no
 * change here.
 */

import {
  CommandFailed,
  isCommandFailed,
  methodFacade,
  runFailed,
  tryMethods,
  tryMethodsAsync,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '@osdlc/command-seam'
import { FailureError, isFailure, type Failure, type Result } from '@osdlc/result'

import { classifyGhFailure, type GhFailure, unreadableFailure } from './failure.ts'
import type { GhVerb } from './verbs.ts'

/**
 * Read the result of running `verb` as the methods that throw do.
 *
 * A checked verb has already thrown on a non-zero exit (the runner is
 * {@link runCheckedGh}). A probe (`installed`, `authStatus`, `api`, `raw`)
 * carries its failure in its value. A read that exited non-zero throws the
 * classified failure, unless the verb's `absent` says the result is still an
 * answer: gh's "there is no such thing", which `parse` turns into `null`, or a
 * partial `graphql` response. A read that exited 0 but parsed to `null` could
 * not be read completely, and throws.
 *
 * A result flagged `outputIncomplete` throws for every verb but a probe, as
 * typed-git's `gate` does: gh exited, but the runner stopped reading at the
 * output cap or a timeout, so a parse would take cut-short output as whole.
 * Both read a result through command-seam's `runFailed`.
 *
 * @throws `FailureError` carrying the classified {@link GhFailure} for a failed run.
 * @throws `FailureError` carrying an `unreadable` {@link GhFailure}.
 */
export function settle<T>(verb: GhVerb<T>, result: CommandResult, binary: string | undefined): T {
  if (verb.probe === true) return verb.parse(result)
  // A checked verb's runner has already thrown on a non-zero exit.
  const failed = verb.checked
    ? result.outputIncomplete === true
    : runFailed(result, (r) => verb.absent?.(r) === true)
  if (failed) throw ghFailureError(new CommandFailed(verb.argv, result, binary))
  // A non-zero exit that got this far is an answer the verb's `absent` accepted.
  if (verb.checked || result.exitCode !== 0) return verb.parse(result)
  const value = verb.parse(result)
  if (value === null) {
    throw new FailureError(unreadableFailure(verb.argv, result.stdout, binary))
  }
  return value
}

/**
 * The error the methods that throw raise for a failed run: a `FailureError` carrying
 * the {@link GhFailure} that {@link classifyGhFailure} reads from it, with the
 * `CommandFailed` as its `cause`. Anything else is returned as it is.
 */
export function ghFailureError(error: unknown): unknown {
  return isCommandFailed(error) ? new FailureError(classifyGhFailure(error)) : error
}

/**
 * Run `argv` and throw {@link ghFailureError}'s classified failure unless gh
 * exited 0 with its whole output. Output cut short (`outputIncomplete`) is a
 * failure too, which `runChecked` alone would not catch: it checks only the
 * exit code.
 */
export function runCheckedGh(
  runner: CommandRunner,
  argv: string[],
  opts: CommandRunOptions,
): CommandResult {
  try {
    return whole(runner.run(argv, opts), argv, runner.binary)
  } catch (error) {
    throw ghFailureError(error)
  }
}

/** {@link runCheckedGh} for an awaitable runner, rejecting with the classified failure. */
export async function runCheckedGhAsync(
  runner: AsyncCommandRunner,
  argv: string[],
  opts: AsyncCommandRunOptions,
): Promise<CommandResult> {
  try {
    return whole(await runner.run(argv, opts), argv, runner.binary)
  } catch (error) {
    throw ghFailureError(error)
  }
}

/** `result`, or a `CommandFailed` thrown when it is a failure (command-seam's `runFailed`). */
function whole(result: CommandResult, argv: string[], binary: string | undefined): CommandResult {
  if (runFailed(result)) throw new CommandFailed(argv, result, binary)
  return result
}

/** The members `try` and `soft` leave out: `raw`, `rawChecked`, helpers that run nothing, and properties. */
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

/**
 * A method's call signatures as `[args, return]` pairs: its last two when it
 * is overloaded (`graphql` is, on its `partial` option), and its one
 * signature twice when it is not. The types below map each pair, so `try` and
 * `soft` keep both of a method's overloads.
 */
type Signatures<F> = F extends {
  (...a: infer A1): infer R1
  (...a: infer A2): infer R2
}
  ? [[A1, R1], [A2, R2]]
  : never

/** Every synchronous client method, returning a `Result<T, GhFailure>`. */
export type TriedSync<C> = {
  [K in keyof Triable<C>]: Signatures<Triable<C>[K]> extends [
    [infer A1 extends unknown[], infer R1],
    [infer A2 extends unknown[], infer R2],
  ]
    ? { (...a: A1): Result<R1, GhFailure>; (...a: A2): Result<R2, GhFailure> }
    : never
}

/** Every awaitable client method, promising a `Result<T, GhFailure>`. */
export type TriedAsync<C> = {
  [K in keyof Triable<C>]: Signatures<Triable<C>[K]> extends [
    [infer A1 extends unknown[], Promise<infer R1>],
    [infer A2 extends unknown[], Promise<infer R2>],
  ]
    ? {
        (...a: A1): Promise<Result<R1, GhFailure>>
        (...a: A2): Promise<Result<R2, GhFailure>>
      }
    : never
}

/**
 * The queries that have a soft form. A mutation has none. If a write's failure
 * were dropped, the caller would believe the write worked.
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
  [K in SoftMethod & keyof C]: Signatures<C[K]> extends [
    [infer A1 extends unknown[], infer R1],
    [infer A2 extends unknown[], infer R2],
  ]
    ? { (...a: A1): OrNull<R1>; (...a: A2): OrNull<R2> }
    : never
}

/**
 * Whether `error` carries a failure to return, rather than a bug to rethrow.
 * Checked by shape, not `instanceof`, because two installed copies of
 * command-seam or result each have their own classes.
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

/** The failure a thrown value carries, or `null` for a bug to rethrow. */
function recognize(error: unknown): GhFailure | null {
  return isGhFailure(error) ? failureOf(error) : null
}

/**
 * Wrap a synchronous client so every method returns a `Result<T, GhFailure>`.
 * The proxy is command-seam's `tryMethods`, so a new method needs no entry.
 */
export function triedSync<C extends object>(client: C): TriedSync<C> {
  return tryMethods(client, recognize) as unknown as TriedSync<C>
}

/** Wrap an awaitable client so every method promises a `Result<T, GhFailure>`. */
export function triedAsync<C extends object>(client: C): TriedAsync<C> {
  return tryMethodsAsync(client, recognize) as unknown as TriedAsync<C>
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
  return methodFacade(client, (call, name) => {
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
  return methodFacade(client, async (call, name) => {
    checkSoft(name)
    try {
      return await call()
    } catch (error) {
      if (isGhFailure(error)) return null
      throw error
    }
  }) as Soft<C>
}
