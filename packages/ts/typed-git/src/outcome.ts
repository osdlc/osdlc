/**
 * `git.try.*` and `git.soft.*`, and the `Result<T, GitFailure>` that `try`
 * returns.
 *
 * `try` is for callers that must tolerate failure: a hook that must never
 * break a commit, a status endpoint that must always answer. It wraps the
 * whole client rather than being a per-verb option, so a new verb needs no
 * code here. Two rules apply:
 *
 *   - It catches a thrown git failure and nothing else. That is the
 *     `FailureError` the throwing methods raise, or a bare `CommandFailed`.
 *     Both are recognised by shape, so two installed copies of command-seam or
 *     result agree. It returns the {@link GitFailure}, whose `cause` is the
 *     `CommandFailed`. A `TypeError` from a programmer mistake still
 *     propagates.
 *   - A declared absence is `{ ok: true }`. `git.try.configGet("no.such.key")`
 *     is `{ ok: true, value: null }`, because absence is an answer, not a
 *     failure.
 */

import { err, ok, type Result } from '@osdlc/result'

import { thrownGitFailure, type GitFailure } from './failure.ts'

/**
 * The methods `try` mirrors: everything except `raw`, `rawChecked`, `at`,
 * and `try` itself. `raw` already returns a `CommandResult` and never throws.
 * `rawChecked` exists to throw. `at(cwd)` returns a new client that has its
 * own `.try`. The types leave them out, but the runtime proxy wraps every
 * function property, these included.
 */
type Triable<C> = Omit<C, 'raw' | 'rawChecked' | 'at' | 'try' | 'soft' | 'cwd'>

/** Every synchronous client method, returning a `Result<T, GitFailure>`. */
export type TriedSync<C> = {
  [K in keyof Triable<C>]: Triable<C>[K] extends (...a: infer A) => infer R
    ? (...a: A) => Result<R, GitFailure>
    : never
}

/** Every awaitable client method, promising the same union. */
export type TriedAsync<C> = {
  [K in keyof Triable<C>]: Triable<C>[K] extends (...a: infer A) => Promise<infer R>
    ? (...a: A) => Promise<Result<R, GitFailure>>
    : never
}

/** A thrown git failure becomes an `err`; anything else is thrown again. */
function asFailure(error: unknown): Result<never, GitFailure> {
  const failure = thrownGitFailure(error)
  if (failure !== null) return err(failure)
  throw error
}

/**
 * A `Proxy` rather than a generated object: it mirrors whatever the client
 * has, including methods like `isDirty` that call other verbs, with no
 * per-verb entry to keep in step. Methods are invoked on the
 * client itself, not on the proxy, so private state stays reachable.
 */
function facade<C extends object, F>(
  client: C,
  wrap: (call: () => unknown, name: string) => F,
): unknown {
  return new Proxy(client, {
    get(target, prop) {
      // Read from the target, not the proxy: a getter (`try` itself) must run
      // against the real client rather than recursing through the proxy.
      const value: unknown = Reflect.get(target, prop)
      if (typeof value !== 'function') return value
      const method = value as (...a: unknown[]) => unknown
      const name = String(prop)
      return (...args: unknown[]) => wrap(() => method.apply(target, args), name)
    },
  })
}

/** Wrap a synchronous client so every method returns a `Result<T, GitFailure>`. */
export function triedSync<C extends object>(client: C): TriedSync<C> {
  return facade(client, (call): Result<unknown, GitFailure> => {
    try {
      return ok(call())
    } catch (error) {
      return asFailure(error)
    }
  }) as TriedSync<C>
}

/** Wrap an awaitable client so every method promises a `Result<T, GitFailure>`. */
export function triedAsync<C extends object>(client: C): TriedAsync<C> {
  return facade(client, async (call): Promise<Result<unknown, GitFailure>> => {
    try {
      return ok(await call())
    } catch (error) {
      return asFailure(error)
    }
  }) as TriedAsync<C>
}

// ── git.soft ────────────────────────────────────────────────────────────────

/**
 * What a verb's absence value is, by return type: `[]` for a list, `null` for
 * a nullable, `false` for a boolean. A verb returning anything else (a
 * record, a `Set`, free text) has no absence value, so it has no soft form.
 *
 * Take care with booleans. `false` is also the answer for "could not ask", so
 * `soft.isDirty` reads a broken repo as clean and `soft.branchExists` reads it
 * as "no such branch". Do not base a destructive action on a `false` from
 * `soft`. Use `try` there.
 */
type SoftKind<R> = R extends readonly unknown[]
  ? 'empty'
  : null extends R
    ? 'null'
    : R extends boolean
      ? 'false'
      : never

type Unwrap<R> = R extends Promise<infer U> ? U : R

/**
 * Methods left out of `soft` although their return type has an absence
 * value. `configRemoveSection` is a mutation, and no mutation has a soft form.
 */
type NoSoftForm = 'configRemoveSection'

/** The client methods that have an absence value, each mapped to its {@link SoftKind}. */
export type SoftKinds<C> = {
  [
    K in keyof Triable<C> as K extends NoSoftForm
      ? never
      : Triable<C>[K] extends (...a: never[]) => infer R
        ? [SoftKind<Unwrap<R>>] extends [never]
          ? never
          : K
        : never
  ]: Triable<C>[K] extends (...a: never[]) => infer R ? SoftKind<Unwrap<R>> : never
}

/**
 * Every client method that has an absence value, returning that value
 * instead of throwing the classified failure. One type for both clients: an
 * awaitable method already returns a `Promise`.
 */
export type Soft<C> = {
  [K in keyof SoftKinds<C>]: Triable<C>[K & keyof Triable<C>] extends (...a: infer A) => infer R
    ? (...a: A) => R
    : never
}

/**
 * The type of the `soft` table: which absence value each verb with a soft form
 * falls back to. It is typed against the client, so a new list, nullable or
 * boolean verb is a compile error until it is added, and a wrong entry does
 * not compile. `Git` and `AsyncGit` read the same table, so they cannot
 * differ.
 */
export type SoftTable = Record<string, 'empty' | 'null' | 'false'>

/** A table that must name exactly the methods of `C` that have a soft form, each with the right kind. */
export type SoftTableFor<C> = SoftKinds<C>

function fallbackFor(table: SoftTable, name: string): unknown {
  const kind = table[name]
  if (kind === undefined) {
    throw new TypeError(
      `git.soft.${name} has no absence value; call it through git.try (or the plain verb) instead`,
    )
  }
  return kind === 'empty' ? [] : kind === 'null' ? null : false
}

/** Wrap a synchronous client so a failed call returns the verb's absence value. */
export function softSync<C extends object>(client: C, table: SoftTable): Soft<C> {
  return facade(client, (call, name) => {
    try {
      return call()
    } catch (error) {
      if (thrownGitFailure(error) !== null) return fallbackFor(table, name)
      throw error
    }
  }) as Soft<C>
}

/** Wrap an awaitable client so a failed call resolves to the verb's absence value. */
export function softAsync<C extends object>(client: C, table: SoftTable): Soft<C> {
  return facade(client, async (call, name) => {
    try {
      return await call()
    } catch (error) {
      if (thrownGitFailure(error) !== null) return fallbackFor(table, name)
      throw error
    }
  }) as Soft<C>
}
