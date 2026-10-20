/**
 * Intersect L1 — path API (`intersect`, the package root).
 *
 * Parses path-like glob strings into `SegmentPattern`s (via `./parse`), adds
 * set-awareness (`string | string[]`), and exposes the registry. Pure — no
 * filesystem. Each primitive coerces `Patterns` to a set of `SegmentPattern`s,
 * then defers to the segment core (`./segments`).
 *
 * No inference: a path-like string is the glob it literally is. A pattern with
 * NO wildcards is an exact-path match (`src/siteA/components` matches only that
 * path); a subtree is written explicitly (`src/siteA/components/**`).
 *
 * Patterns are globs; a concrete path you pass to `matches`, `whichMatch`,
 * {@link Matcher.matches} or `Registry.matching` is read as the literal name it
 * is, so `pages/[id].vue` is that file and not a character class.
 *
 * The functions here take path-like STRINGS. The `./segments` entry point has
 * functions with the same names (`intersects`, `matches`, `witness`) that take
 * pre-split segment arrays; the import path says which layer you call.
 *
 * Unsupported syntax and bad arguments throw {@link IntersectError}.
 *
 * @module intersect
 */
import * as segments from './segments/index.ts'
import type { Options, SegmentPattern } from './segments/index.ts'
import { assertSupported } from './segments/automaton.ts'
import { search } from './segments/product.ts'
import { IntersectError } from './errors.ts'
import { describe, literal, parse } from './parse.ts'

// Re-export the shared core types and the registry surface from the package root.
export type { Options, SegmentPattern } from './segments/index.ts'
export { IntersectError } from './errors.ts'
export type { IntersectErrorCode } from './errors.ts'
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
 *
 * A `Matcher` passed as an argument is used for its pattern strings only. They
 * are parsed again, and this matcher's options apply to the whole comparison;
 * the argument's own options are ignored.
 */
export interface Matcher {
  /** The source patterns, normalized to an array. */
  readonly patterns: readonly string[]
  /** Does a concrete path match this set? The path is read literally, not as a glob. */
  matches(path: string): boolean
  /** Does this set overlap another pattern-set or matcher? */
  intersects(other: Patterns | Matcher): boolean
  /** Which of `candidates` overlap this set, in the order given (filters the argument). */
  overlapping(candidates: Patterns): string[]
  /** An example path common to this set and `other`, or `null`. */
  witness(other: Patterns | Matcher): string | null
}

/** The separator used to stringify a witness back into a path. */
const WITNESS_SEPARATOR = '/'

/** Check `patterns` is a string or an array of strings, and return it as an array. */
function asList(patterns: unknown): readonly string[] {
  if (typeof patterns === 'string') return [patterns]
  if (Array.isArray(patterns) && patterns.every((p) => typeof p === 'string')) {
    return patterns as readonly string[]
  }
  throw new IntersectError(
    'INVALID_ARGUMENT',
    `expected a pattern string or an array of pattern strings, got ${describe(patterns)}`,
  )
}

/** A `Matcher` is an object that carries a `patterns` array; everything else is `Patterns`. */
function isMatcher(value: unknown): value is Matcher {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as { patterns?: unknown }).patterns)
  )
}

/** The pattern strings behind `Patterns` or a `Matcher` — reused when the other side is compiled. */
function patternStrings(value: unknown): readonly string[] {
  return isMatcher(value) ? asList(value.patterns) : asList(value)
}

/** Parse one pattern string and reject syntax this package does not support. */
function parsePattern(pattern: string): SegmentPattern {
  const parsed = parse(pattern)
  assertSupported(parsed)
  return parsed
}

/** Parse a concrete path as the literal name it is. */
function parsePath(path: unknown): SegmentPattern {
  if (typeof path !== 'string') {
    throw new IntersectError('INVALID_ARGUMENT', `expected a path string, got ${describe(path)}`)
  }
  return parse(literal(path))
}

/**
 * Compile a pattern-set once, then query it many times. Parses each pattern
 * into a `SegmentPattern` up front; every method reuses that parsed set.
 * Amortizes the parse when a fixed scope is tested against many paths/patterns.
 *
 * @param patterns - The pattern-set to compile ({@link Patterns}).
 * @param opts - Matching semantics ({@link Options}) baked into every query.
 * @returns A {@link Matcher} bound to `patterns` and `opts`.
 * @throws {@link IntersectError} with code `UNSUPPORTED_SYNTAX`, `PATTERN_TOO_DEEP` or
 * `INVALID_ARGUMENT`, raised here and not at the first query.
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
  const parsed: SegmentPattern[] = patternList.map(parsePattern)

  // An argument is parsed again from its strings, so the receiver's `opts` apply.
  const parseOther = (other: Patterns | Matcher): SegmentPattern[] =>
    patternStrings(other).map(parsePattern)

  return {
    patterns: patternList,
    matches(path: string): boolean {
      const target = parsePath(path)
      return parsed.some((pat) => segments.matches(target, pat, opts))
    },
    intersects(other: Patterns | Matcher): boolean {
      const others = parseOther(other)
      return parsed.some((a) => others.some((b) => segments.intersects(a, b, opts)))
    },
    overlapping(candidates: Patterns): string[] {
      return asList(candidates).filter((c) => {
        const cand = parsePattern(c)
        return parsed.some((a) => segments.intersects(a, cand, opts))
      })
    },
    witness(other: Patterns | Matcher): string | null {
      const others = parseOther(other)
      for (const a of parsed) {
        for (const b of others) {
          const w = search(a, b, opts, true)
          if (w !== null) return w.join(WITNESS_SEPARATOR)
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
 * @throws {@link IntersectError} for unsupported syntax or a bad argument.
 * @remarks Takes path-like strings. The `./segments` function of the same name
 * takes pre-split segment arrays.
 * A pattern with no wildcards is an EXACT-path match, so
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
 * @param path - The concrete path to test. It is read literally: `*`, `?`, `[`, `]`,
 * `{`, `}` and `\` in it are ordinary characters, so `pages/[id].vue` is that
 * file name. (The patterns are globs.)
 * @param patterns - The pattern-set to test against ({@link Patterns}).
 * @param opts - Matching semantics ({@link Options}); defaults apply when omitted.
 * @returns `true` when `path` matches at least one pattern, else `false`.
 * @remarks The `./segments` function of the same name takes a pre-split path
 * and reads it as a pattern.
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
 * @param path - The concrete path to test, read literally (see {@link matches}).
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
  const target = parsePath(path)
  return asList(patterns).filter((p) => segments.matches(target, parsePattern(p), opts))
}

/**
 * Which patterns in `query` overlap the `candidates` set, in `query` order —
 * the conflict-detection primitive.
 *
 * @param query - The pattern-set to filter and return a subset of ({@link Patterns}).
 * @param candidates - The patterns to test `query` against for overlap
 * ({@link Patterns}; a single string is a one-element set).
 * @param opts - Matching semantics ({@link Options}); defaults apply when omitted.
 * @returns The subset of `query` (in query order) that overlaps some candidate.
 * @throws {@link IntersectError} for unsupported syntax or a bad argument.
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
 *
 * // The two directions, on the same data:
 * overlapping(taskA, taskB);                // ["src/api/**"]            — a subset of taskA
 * compile(taskA).overlapping(taskB);        // ["src/api/routes/*.ts"]   — a subset of taskB
 * ```
 */
export function overlapping(query: Patterns, candidates: Patterns, opts?: Options): string[] {
  const queryList = asList(query)
  const parsedCandidates: SegmentPattern[] = asList(candidates).map(parsePattern)
  return queryList.filter((q) => {
    const qp = parsePattern(q)
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
 * @throws {@link IntersectError} for unsupported syntax or a bad argument.
 * @remarks The returned string always matches both sets. The search skips a
 * path that ends in an empty segment, because `parse` drops a trailing
 * separator and no string spells it, and goes on to a longer path. So `null`
 * means disjoint, with one exception: when the only common path ends in an
 * empty segment (`a/{,x}` against `a/{,y}` has only `a/`), this returns `null`
 * even though {@link intersects} says `true`. An empty segment before a `**` or
 * inside a brace such as `{,x}` can produce such a pair.
 * @example
 * ```ts
 * witness("src/api/**", "src/api/handler.ts"); // "src/api/handler.ts" — a path both match
 * witness("src/api/**", "src/web/**");         // null                 — no common path
 * ```
 */
export function witness(a: Patterns, b: Patterns, opts?: Options): string | null {
  return compile(a, opts).witness(b)
}
