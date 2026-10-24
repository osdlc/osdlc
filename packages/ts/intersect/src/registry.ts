/**
 * The registry (`index`): an index of labeled sets of patterns, such as a UI
 * guideline or a coding standard and the paths each one covers. Given a
 * scope, it answers which entries apply. It does not read the disk, so the
 * paths need not exist. Entries keep the order they were given in. A
 * duplicate `id` throws when the registry is built.
 *
 * It uses only the path API (`./index`): it compiles each entry with
 * `compile` and never imports the filesystem entry.
 */
import { compile } from './index.ts'
import { IntersectError } from './errors.ts'
import type { Matcher, Options, Patterns } from './index.ts'

/**
 * One `index()` entry: an id and the patterns it covers.
 *
 * @typeParam T - The id type. Defaults to `string`; pass a union or branded
 * type to keep the returned ids typed.
 */
export interface Labeled<T = string> {
  /** The entry's id, returned by the registry's queries. */
  id: T
  /** The patterns this entry covers (a single string or an array). */
  patterns: Patterns
}

/**
 * An index that answers which labeled sets of patterns apply to a scope or a path.
 *
 * @typeParam T - The id type carried through from the {@link Labeled} entries.
 */
export interface Registry<T = string> {
  /** The entries as given, in order. */
  readonly entries: readonly Labeled<T>[]
  /** Ids whose patterns overlap the scope, in registry order. (A subtree scope is written `dir/**`.) */
  applicableTo(scope: Patterns): T[]
  /** Ids whose patterns match a concrete path (read literally, not as a glob), in registry order. */
  matching(path: string): T[]
}

/**
 * Build the registry. It keeps the entries in order and compiles each entry's
 * patterns once, up front.
 *
 * @typeParam T - The id type, inferred from `entries`.
 * @param entries - The labeled sets of patterns to index. Their order matters.
 * @param opts - Matching options ({@link Options}) applied to every entry.
 * @returns A {@link Registry} whose queries return matching ids in the order given.
 * @throws {@link IntersectError} with code `DUPLICATE_REGISTRY_ID` if any `id` is
 * given twice, rather than keeping the first or the last without a word.
 * Unsupported pattern syntax throws here too (`UNSUPPORTED_SYNTAX`,
 * `PATTERN_TOO_DEEP`).
 * @remarks The order of entries is kept. Register them from general to
 * specific, and read a query result as a priority list: first is most
 * general, last is most specific. This package returns the order. The caller
 * picks the precedence rule. The paths need not exist.
 * @example
 * ```ts
 * const guidelines = index([
 *   { id: "guidelines/api", patterns: ["src/api/**"] },
 *   { id: "guidelines/db",  patterns: ["src/db/**"] },
 * ]);
 *
 * guidelines.applicableTo("src/api/**"); // ["guidelines/api"]  (db does not overlap)
 * guidelines.matching("src/db/pool.ts"); // ["guidelines/db"]
 * ```
 * @example Duplicate ids throw when the registry is built:
 * ```ts
 * index([
 *   { id: "a", patterns: ["src/**"] },
 *   { id: "a", patterns: ["docs/**"] }, // same id, registered twice
 * ]);
 * // → IntersectError (code DUPLICATE_REGISTRY_ID): duplicate registry id 'a'
 * ```
 */
export function index<T = string>(entries: Iterable<Labeled<T>>, opts?: Options): Registry<T> {
  const ordered: Labeled<T>[] = []
  const compiled: { id: T; matcher: Matcher }[] = []
  const seen = new Set<T>()

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new IntersectError(
        'DUPLICATE_REGISTRY_ID',
        `duplicate registry id '${String(entry.id)}'`,
      )
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
