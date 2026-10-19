/**
 * Intersect L1 — registry over labeled pattern-sets (`index`).
 *
 * A reverse index over *labeled* pattern-sets — artifacts that declare the
 * paths they govern (a UI guideline, a coding standard's list of paths).
 * Given a scope it answers which artifacts apply. Pure; targets need not
 * exist. Registration order is significant and preserved; a duplicate `id`
 * throws at construction.
 *
 * Builds only on the path API (`./index`) — it compiles each entry via
 * `compile` and never reaches the filesystem layer.
 */
import { compile } from './index.ts'
import type { Matcher, Options, Patterns } from './index.ts'

/**
 * An artifact and the pattern-set it declares — an `index()` entry.
 *
 * @typeParam T - The id type. Defaults to `string`; pass a union or branded
 * type to keep the returned ids typed.
 */
export interface Labeled<T = string> {
  /** The artifact's identifier, echoed back by the registry's queries. */
  id: T
  /** The path-pattern set this artifact governs (a single string or a set). */
  patterns: Patterns
}

/**
 * A reverse index answering which labeled pattern-sets apply to a scope or path.
 *
 * @typeParam T - The id type carried through from the {@link Labeled} entries.
 */
export interface Registry<T = string> {
  /** The entries as supplied, in registration order. */
  readonly entries: readonly Labeled<T>[]
  /** Ids whose set OVERLAPS the scope, in registry order. (A subtree scope is written `dir/**`.) */
  applicableTo(scope: Patterns): T[]
  /** Ids whose set matches a CONCRETE path, in registry order. */
  matching(path: string): T[]
}

/**
 * Build the reverse index over labeled pattern-sets. Retains entry order and
 * compiles each entry's patterns once, up front.
 *
 * @typeParam T - The id type, inferred from `entries`.
 * @param entries - The labeled pattern-sets to index, in significant order.
 * @param opts - Matching semantics ({@link Options}) applied to every entry.
 * @returns A {@link Registry} whose queries echo matching ids in registration order.
 * @throws Error `duplicate registry id '<id>'` if any `id` is supplied twice —
 * rejected at construction rather than silently keeping first or last.
 * @remarks Registration order is significant and preserved: register
 * general-to-specific and read a query result as a prioritization (first =
 * most general, last = most specific). Intersect returns the order; the caller
 * picks the precedence rule. Pure — target paths need not exist.
 * @example
 * ```ts
 * const guidelines = index([
 *   { id: "guidelines/api", patterns: ["src/api/**"] },
 *   { id: "guidelines/db",  patterns: ["src/db/**"] },
 * ]);
 *
 * guidelines.applicableTo("src/api/**"); // ["guidelines/api"]  — db does not overlap
 * guidelines.matching("src/db/pool.ts"); // ["guidelines/db"]
 * ```
 * @example Duplicate ids throw at construction:
 * ```ts
 * index([
 *   { id: "a", patterns: ["src/**"] },
 *   { id: "a", patterns: ["docs/**"] }, // same id, registered twice
 * ]);
 * // → Error: duplicate registry id 'a'
 * ```
 */
export function index<T = string>(entries: Iterable<Labeled<T>>, opts?: Options): Registry<T> {
  const ordered: Labeled<T>[] = []
  const compiled: { id: T; matcher: Matcher }[] = []
  const seen = new Set<T>()

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`duplicate registry id '${String(entry.id)}'`)
    }
    seen.add(entry.id)
    ordered.push(entry)
    compiled.push({ id: entry.id, matcher: compile(entry.patterns, opts) })
  }

  return {
    entries: ordered,
    applicableTo(scope: Patterns): T[] {
      return compiled.filter((e) => e.matcher.intersects(scope)).map((e) => e.id)
    },
    matching(path: string): T[] {
      return compiled.filter((e) => e.matcher.matches(path)).map((e) => e.id)
    },
  }
}
