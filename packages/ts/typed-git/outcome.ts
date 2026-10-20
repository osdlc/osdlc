/**
 * The inspection door — `git.try.*`, and the {@link GitOutcome} it returns.
 *
 * For callers that genuinely tolerate failure: a hook that must never break a
 * commit, a status endpoint that must always answer. `try` is a facade over
 * the whole client rather than a per-verb option, so a new verb costs nothing
 * here. Two rules make it honest:
 *
 *   - It catches `CommandFailed` and nothing else. A `TypeError` from a
 *     programmer mistake propagates; this is not a blanket catch.
 *   - A declared absence is `{ ok: true }`. `git.try.configGet("no.such.key")`
 *     is `{ ok: true, value: null }`, because absence is an answer, not a
 *     failure.
 */

import { CommandFailed } from '@osdlc/command-seam'

/** The result of a git call that was allowed to fail. */
export type GitOutcome<T> = { ok: true; value: T } | { ok: false; error: CommandFailed }

/**
 * The methods `try` mirrors: everything but the escape hatches, the
 * re-rooting helper, and `try` itself. `raw` already returns a
 * `CommandResult` and never throws; `rawChecked` is the deliberate throwing
 * door; `at(cwd)` returns a fresh client that has its own `.try`. The types
 * omit them, but the runtime proxy wraps every function property, these
 * included.
 */
type Triable<C> = Omit<C, 'raw' | 'rawChecked' | 'at' | 'try' | 'soft' | 'cwd'>

/** Every synchronous client method, returning a {@link GitOutcome}. */
export type TriedSync<C> = {
  [K in keyof Triable<C>]: Triable<C>[K] extends (...a: infer A) => infer R
    ? (...a: A) => GitOutcome<R>
    : never
}

/** Every awaitable client method, promising the same union. */
export type TriedAsync<C> = {
  [K in keyof Triable<C>]: Triable<C>[K] extends (...a: infer A) => Promise<infer R>
    ? (...a: A) => Promise<GitOutcome<R>>
    : never
}

/** `CommandFailed` becomes an outcome; anything else stays a throw. */
function asOutcome<T>(error: unknown): GitOutcome<T> {
  if (error instanceof CommandFailed) return { ok: false, error }
  throw error
}

/**
 * A `Proxy` rather than a generated object: it mirrors whatever the client
 * has, including composed methods like `isDirty` that call through the gated
 * ones, without a per-verb entry to keep in step. Methods are invoked on the
 * client itself, not on the proxy, so private state stays reachable.
 */
function facade<C extends object, F>(
  client: C,
  wrap: (call: () => unknown, name: string) => F,
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

/** Wrap a synchronous client so every method returns a {@link GitOutcome}. */
export function triedSync<C extends object>(client: C): TriedSync<C> {
  return facade(client, (call): GitOutcome<unknown> => {
    try {
      return { ok: true, value: call() }
    } catch (error) {
      return asOutcome(error)
    }
  }) as TriedSync<C>
}

/** Wrap an awaitable client so every method promises a {@link GitOutcome}. */
export function triedAsync<C extends object>(client: C): TriedAsync<C> {
  return facade(client, async (call): Promise<GitOutcome<unknown>> => {
    try {
      return { ok: true, value: await call() }
    } catch (error) {
      return asOutcome(error)
    }
  }) as TriedAsync<C>
}

// ── the soft door ───────────────────────────────────────────────────────────

/**
 * What a verb's absence value is, by return type: `[]` for a list, `null` for
 * a nullable, `false` for a boolean. A verb returning anything else (a
 * record, a `Set`, free text) has no absence value, so it has no soft form.
 *
 * Mind the boolean kind: `false` is the answer for "could not ask" too, so
 * `soft.isDirty` reads a broken repo as clean and `soft.branchExists` as
 * "no such branch". Do not gate a destructive action on a `false` from `soft`;
 * use `try` there.
 */
type SoftKind<R> = R extends readonly unknown[]
  ? 'empty'
  : null extends R
    ? 'null'
    : R extends boolean
      ? 'false'
      : never

type Unwrap<R> = R extends Promise<infer U> ? U : R

/** The client methods that have an absence value, each mapped to its {@link SoftKind}. */
export type SoftKinds<C> = {
  [
    K in keyof Triable<C> as Triable<C>[K] extends (...a: never[]) => infer R
      ? [SoftKind<Unwrap<R>>] extends [never]
        ? never
        : K
      : never
  ]: Triable<C>[K] extends (...a: never[]) => infer R ? SoftKind<Unwrap<R>> : never
}

/**
 * Every client method that has an absence value, returning that value
 * instead of throwing `CommandFailed`. One type for both clients: an
 * awaitable method already returns a `Promise`.
 */
export type Soft<C> = {
  [K in keyof SoftKinds<C>]: Triable<C>[K] extends (...a: infer A) => infer R
    ? (...a: A) => R
    : never
}

/**
 * The soft door's table type: which absence value each softable verb falls back
 * to. Typed against the client so a new list/nullable/boolean verb is a
 * compile error here until it is declared, and so a wrong entry cannot
 * compile; `Git` and `AsyncGit` read this one table, so they cannot drift.
 */
export type SoftTable = Record<string, 'empty' | 'null' | 'false'>

/** A table that must name exactly the softable methods of `C`, each with the right kind. */
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
      if (error instanceof CommandFailed) return fallbackFor(table, name)
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
      if (error instanceof CommandFailed) return fallbackFor(table, name)
      throw error
    }
  }) as Soft<C>
}
