/**
 * Intersect L1 — path API (`intersect`, the package root).
 *
 * Parses path-like glob strings into `SegmentPattern`s (via `./parse`), adds
 * set-awareness (`string | string[]`), and exposes the registry. Pure — no
 * filesystem. Each primitive coerces `Patterns` to a set of `SegmentPattern`s,
 * then defers to the segment core (`./segments`). See
 * `docs/planning/decisions/D-4FRD-intersect-api/layered-api.md`.
 *
 * No inference: a path-like string is the glob it literally is. A pattern with
 * NO wildcards is an exact-path match (`src/siteA/components` matches only that
 * path); a subtree is written explicitly (`src/siteA/components/**`).
 *
 * @module intersect
 */
import * as segments from './segments/index.ts'
import type { Options, SegmentPattern } from './segments/index.ts'
import { parse } from './parse.ts'

// Re-export the shared core types and the registry surface from the package root.
export type { Options, SegmentPattern } from './segments/index.ts'
export type { Labeled, Registry } from './registry.ts'
export { index } from './registry.ts'
export { parse } from './parse.ts'

/**
 * Path-like glob string(s) the friendly API accepts. A single string is a
 * one-element set; an array is a set — its union.
 */
export type Patterns = string | readonly string[]

/**
 * A compiled pattern-set for amortized queries against many paths/patterns.
 * Built by {@link compile}, which parses each pattern once; every method reuses
 * that parsed set. Its `overlapping` filters the ARGUMENT (contrast the free
 * {@link overlapping}, which filters its first argument).
 */
export interface Matcher {
  /** The source patterns, normalized to an array. */
  readonly patterns: readonly string[]
  /** Does a concrete path match this set? */
  matches(path: string): boolean
  /** Does this set overlap another pattern-set or matcher? */
  intersects(other: Patterns | Matcher): boolean
  /** Which of `candidates` overlap this set, in the order given (filters the argument). */
  overlapping(candidates: readonly string[]): string[]
  /** An example path common to this set and `other`, or `null`. */
  witness(other: Patterns | Matcher): string | null
}

/** The separator used to stringify a witness back into a path. */
const WITNESS_SEPARATOR = '/'

/**
 * Can this segment vector be spelled as a path string? No, when it has more
 * than one segment and the last one is empty: joining puts a trailing separator
 * on the string, and {@link parse} normalizes exactly that back off — so the
 * round-trip loses the segment and the string matches neither side. A
 * non-trailing empty segment is spellable (`["a","","b"]` -> `"a//b"`).
 */
function spellableAsPath(w: SegmentPattern): boolean {
  return !(w.length > 1 && w[w.length - 1] === '')
}

/** Normalize `Patterns` to an array of pattern strings (a single string is a one-element set). */
function asList(patterns: Patterns): readonly string[] {
  return typeof patterns === 'string' ? [patterns] : patterns
}

/** A `Matcher` is a non-string, non-array object; everything else is `Patterns`. */
function isMatcher(value: Patterns | Matcher): value is Matcher {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The pattern strings behind `Patterns` or a `Matcher` — reused when the other side is compiled. */
function patternStrings(value: Patterns | Matcher): readonly string[] {
  return isMatcher(value) ? value.patterns : asList(value)
}

/**
 * Compile a pattern-set once, then query it many times. Parses each pattern
 * into a `SegmentPattern` up front; every method reuses that parsed set.
 * Amortizes the parse when a fixed scope is tested against many paths/patterns.
 *
 * @param patterns - The pattern-set to compile ({@link Patterns}).
 * @param opts - Matching semantics ({@link Options}) baked into every query.
 * @returns A {@link Matcher} bound to `patterns` and `opts`.
 * @example
 * ```ts
 * const scope = compile(["src/api/**", "src/db/**"]);
 *
 * scope.matches("src/api/user.ts");                 // true
 * scope.matches("test/api/user.test.ts");           // false
 * scope.overlapping(["docs/**", "src/db/pool.ts"]); // ["src/db/pool.ts"]
 * ```
 */
export function compile(patterns: Patterns, opts?: Options): Matcher {
  const patternList: readonly string[] = [...asList(patterns)]
  const parsed: SegmentPattern[] = patternList.map((p) => parse(p))

  const parseOther = (other: Patterns | Matcher): SegmentPattern[] =>
    patternStrings(other).map((p) => parse(p))

  return {
    patterns: patternList,
    matches(path: string): boolean {
      const target = parse(path)
      return parsed.some((pat) => segments.matches(target, pat, opts))
    },
    intersects(other: Patterns | Matcher): boolean {
      const others = parseOther(other)
      return parsed.some((a) => others.some((b) => segments.intersects(a, b, opts)))
    },
    overlapping(candidates: readonly string[]): string[] {
      return candidates.filter((c) => {
        const cand = parse(c)
        return parsed.some((a) => segments.intersects(a, cand, opts))
      })
    },
    witness(other: Patterns | Matcher): string | null {
      const others = parseOther(other)
      for (const a of parsed) {
        for (const b of others) {
          const w = segments.witness(a, b, opts)
          if (w !== null && spellableAsPath(w)) return w.join(WITNESS_SEPARATOR)
        }
      }
      return null
    },
  }
}

/**
 * Do two pattern-sets share a common matching path? The load-bearing primitive.
 *
 * @param a - The first pattern-set ({@link Patterns}).
 * @param b - The second pattern-set ({@link Patterns}).
 * @param opts - Matching semantics ({@link Options}); defaults apply when omitted.
 * @returns `true` when some path matches both `a` and `b`, else `false`.
 * @remarks A pattern with no wildcards is an EXACT-path match, so
 * `src/x` and `src/x/y` are disjoint (a child is not the path); opt into a
 * subtree with a trailing `**`. Dotfiles are excluded unless `{ dot: true }`.
 * @example
 * ```ts
 * intersects("src/api/**", "src/api/handler.ts"); // true  — the file is inside the subtree
 * intersects("src/api/**", "src/web/**");         // false — disjoint subtrees
 *
 * // Exact-match rule (no wildcards):
 * intersects("src/siteA/components", "src/siteA/components");            // true  (same path)
 * intersects("src/siteA/components", "src/siteA/components/Button.vue"); // false (a child, not the path)
 *
 * // Dot default:
 * intersects("*", ".env");               // false — dotfiles excluded by default
 * intersects("*", ".env", { dot: true }); // true
 * ```
 */
export function intersects(a: Patterns, b: Patterns, opts?: Options): boolean {
  return compile(a, opts).intersects(b)
}

/**
 * Does a concrete path match any pattern in the set?
 *
 * @param path - The concrete path to test.
 * @param patterns - The pattern-set to test against ({@link Patterns}).
 * @param opts - Matching semantics ({@link Options}); defaults apply when omitted.
 * @returns `true` when `path` matches at least one pattern, else `false`.
 * @example
 * ```ts
 * matches("src/api/user.ts", ["src/api/**", "docs/**"]); // true  (first pattern)
 * matches("README.md",       ["src/api/**", "docs/**"]); // false
 * ```
 */
export function matches(path: string, patterns: Patterns, opts?: Options): boolean {
  return compile(patterns, opts).matches(path)
}

/**
 * Which patterns in the set match a concrete path, in the order given.
 *
 * @param path - The concrete path to test.
 * @param patterns - The pattern-set to filter ({@link Patterns}).
 * @param opts - Matching semantics ({@link Options}); defaults apply when omitted.
 * @returns The subset of `patterns` that match `path`, in input order.
 * @example
 * ```ts
 * whichMatch("src/api/user.ts", ["src/api/**", "src/**", "docs/**"]);
 * // → ["src/api/**", "src/**"]   (docs/** does not match)
 * ```
 */
export function whichMatch(path: string, patterns: Patterns, opts?: Options): string[] {
  const target = parse(path)
  return asList(patterns).filter((p) => segments.matches(target, parse(p), opts))
}

/**
 * Which patterns in `query` overlap the `candidates` set, in `query` order —
 * the conflict-detection primitive.
 *
 * @param query - The pattern-set to filter and return a subset of ({@link Patterns}).
 * @param candidates - The patterns to test `query` against for overlap.
 * @param opts - Matching semantics ({@link Options}); defaults apply when omitted.
 * @returns The subset of `query` (in query order) that overlaps some candidate.
 * @remarks Returns a subset of the FIRST argument, `query`. Contrast
 * {@link Matcher.overlapping}, which returns a subset of ITS argument — the two
 * conventions filter opposite sides.
 * @example
 * ```ts
 * const taskA = ["src/api/**", "src/db/schema.ts"];
 * const taskB = ["src/api/routes/*.ts", "docs/**"];
 *
 * overlapping(taskA, taskB);        // ["src/api/**"]  — the overlapping claim → predicted conflict
 * overlapping(["docs/**"], taskA);  // []              — no overlap
 * ```
 */
export function overlapping(
  query: Patterns,
  candidates: readonly string[],
  opts?: Options,
): string[] {
  const parsedCandidates: SegmentPattern[] = candidates.map((c) => parse(c))
  return asList(query).filter((q) => {
    const qp = parse(q)
    return parsedCandidates.some((c) => segments.intersects(qp, c, opts))
  })
}

/**
 * An example path common to both sets (turns "overlap" into "overlap at X"), or
 * `null` when disjoint.
 *
 * @param a - The first pattern-set ({@link Patterns}).
 * @param b - The second pattern-set ({@link Patterns}).
 * @param opts - Matching semantics ({@link Options}); defaults apply when omitted.
 * @returns A concrete path matching both sets, or `null` if none exists.
 * @remarks The returned string always matches both sets. A segment-vector that
 * no path string can spell — one ending in an empty segment, which only a
 * degenerate pattern such as `{,x}` produces — is not reported; for such a pair
 * this returns `null` even though {@link intersects} (which answers over segment
 * vectors, not path strings) says `true`.
 * @example
 * ```ts
 * witness("src/api/**", "src/api/handler.ts"); // "src/api/handler.ts" — a path both match
 * witness("src/api/**", "src/web/**");         // null                 — no common path
 * ```
 */
export function witness(a: Patterns, b: Patterns, opts?: Options): string | null {
  return compile(a, opts).witness(b)
}
