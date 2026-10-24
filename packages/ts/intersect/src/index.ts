/**
 * The path API, the package root (`@osdlc/intersect`).
 *
 * Parses glob strings into `SegmentPattern`s (via `./parse`), accepts one
 * pattern or an array of them (`string | string[]`), and exports the registry.
 * It does not touch the filesystem. Each function turns its `Patterns` into a
 * list of `SegmentPattern`s, then calls the segment core (`./segments`).
 *
 * A string is read as the glob it is. A pattern with no wildcards matches only
 * that exact path (`src/siteA/components`). A subtree is written with `**`
 * (`src/siteA/components/**`).
 *
 * Patterns are globs. A concrete path passed to `matches`, `whichMatch`,
 * {@link Matcher.matches} or `Registry.matching` is read as a literal name, so
 * `pages/[id].vue` is that file and not a character class.
 *
 * The functions here take strings. The `./segments` entry point has functions
 * with the same names (`intersects`, `matches`, `witness`) that take
 * pre-split segment arrays. The import path says which one you call.
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

export type { Options, SegmentPattern } from './segments/index.ts'
export { IntersectError } from './errors.ts'
export type { IntersectErrorCode } from './errors.ts'
export type { Labeled, Registry } from './registry.ts'
export { index } from './registry.ts'
export { parse } from './parse.ts'

/**
 * One glob string or an array of them. A single string is a set of one. An
 * array matches the union of its patterns.
 */
export type Patterns = string | readonly string[]

/**
 * A compiled set of patterns, for testing one scope against many paths or
 * patterns. Built by {@link compile}, which parses each pattern once. Every
 * method reuses the parsed set. Its `overlapping` filters its argument. The
 * free function {@link overlapping} filters its first argument instead.
 *
 * A `Matcher` passed as an argument is used for its pattern strings only. They
 * are parsed again, and this matcher's options apply to the whole comparison.
 * The argument's own options are ignored.
 */
export interface Matcher {
  /** The source patterns, normalized to an array. */
  readonly patterns: readonly string[]
  /** Does a concrete path match this set? The path is read literally, not as a glob. */
  matches(path: string): boolean
  /** Does this set overlap another set of patterns or a matcher? */
  intersects(other: Patterns | Matcher): boolean
  /** Which of `candidates` overlap this set, in the order given (filters the argument). */
  overlapping(candidates: Patterns): string[]
  /** An example path common to this set and `other`, or `null`. */
  witness(other: Patterns | Matcher): string | null
}

/** The separator used to join a witness's segments into a path. */
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

/** A `Matcher` is an object with a `patterns` array. Anything else is `Patterns`. */
function isMatcher(value: unknown): value is Matcher {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as { patterns?: unknown }).patterns)
  )
}

/** The pattern strings of `Patterns` or of a `Matcher`. */
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
 * Compile a set of patterns once, then query it many times. Each pattern is
 * parsed into a `SegmentPattern` up front, and every method reuses the parsed
 * set. Use it when one scope is tested against many paths or patterns.
 *
 * @param patterns - The patterns to compile ({@link Patterns}).
 * @param opts - Matching options ({@link Options}) used by every query.
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
 * Do two sets of patterns share a matching path? Every other function in the
 * package builds on this question.
 *
 * @param a - The first patterns ({@link Patterns}).
 * @param b - The second patterns ({@link Patterns}).
 * @param opts - Matching options ({@link Options}). Defaults apply when omitted.
 * @returns `true` when some path matches both `a` and `b`, else `false`.
 * @throws {@link IntersectError} for unsupported syntax or a bad argument.
 * @remarks Takes strings. The `./segments` function of the same name takes
 * pre-split segment arrays. A pattern with no wildcards matches only that exact
 * path, so `src/x` and `src/x/y` are disjoint (a child is not the path). To
 * match a subtree, end the pattern with `**`. Dotfiles are excluded unless
 * `{ dot: true }`.
 * @example
 * ```ts
 * intersects("src/api/**", "src/api/handler.ts"); // true  (the file is inside the subtree)
 * intersects("src/api/**", "src/web/**");         // false (disjoint subtrees)
 *
 * // Exact-match rule (no wildcards):
 * intersects("src/siteA/components", "src/siteA/components");            // true  (same path)
 * intersects("src/siteA/components", "src/siteA/components/Button.vue"); // false (a child, not the path)
 *
 * // Dotfiles:
 * intersects("*", ".env");               // false (dotfiles excluded by default)
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
 * `{`, `}`, `(` and `\` in it are ordinary characters, so `pages/[id].vue` is that
 * file name. (The patterns are globs.)
 * @param patterns - The patterns to test against ({@link Patterns}).
 * @param opts - Matching options ({@link Options}). Defaults apply when omitted.
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
 * @param patterns - The patterns to filter ({@link Patterns}).
 * @param opts - Matching options ({@link Options}). Defaults apply when omitted.
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
 * Which patterns in `query` overlap the `candidates`, in `query` order. Use it
 * to detect conflicts between two sets of claimed paths.
 *
 * @param query - The patterns to filter ({@link Patterns}).
 * @param candidates - The patterns to test `query` against ({@link Patterns}).
 * A single string is a set of one.
 * @param opts - Matching options ({@link Options}). Defaults apply when omitted.
 * @returns The subset of `query` (in query order) that overlaps some candidate.
 * @throws {@link IntersectError} for unsupported syntax or a bad argument.
 * @remarks Returns a subset of the first argument, `query`.
 * {@link Matcher.overlapping} returns a subset of its argument instead, so the
 * two filter opposite sides.
 * @example
 * ```ts
 * const taskA = ["src/api/**", "src/db/schema.ts"];
 * const taskB = ["src/api/routes/*.ts", "docs/**"];
 *
 * overlapping(taskA, taskB);        // ["src/api/**"]  (the claim that overlaps: a likely conflict)
 * overlapping(["docs/**"], taskA);  // []              (no overlap)
 *
 * // The two directions, on the same data:
 * overlapping(taskA, taskB);                // ["src/api/**"]            (a subset of taskA)
 * compile(taskA).overlapping(taskB);        // ["src/api/routes/*.ts"]   (a subset of taskB)
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
 * An example path that both sets match, or `null` when they are disjoint. It
 * lets a caller say where two sets overlap, not only that they do.
 *
 * @param a - The first patterns ({@link Patterns}).
 * @param b - The second patterns ({@link Patterns}).
 * @param opts - Matching options ({@link Options}). Defaults apply when omitted.
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
 * witness("src/api/**", "src/api/handler.ts"); // "src/api/handler.ts" (a path both match)
 * witness("src/api/**", "src/web/**");         // null                 (no common path)
 * ```
 */
export function witness(a: Patterns, b: Patterns, opts?: Options): string | null {
  return compile(a, opts).witness(b)
}
