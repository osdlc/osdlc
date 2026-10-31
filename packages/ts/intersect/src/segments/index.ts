/**
 * The segment core (`@osdlc/intersect/segments`).
 *
 * The engine. It works on patterns already split into path segments
 * (`SegmentPattern`). It never parses strings and never touches the
 * filesystem. It compares two patterns at a time.
 *
 * The conformance suite specifies these types and their behaviour. The engine
 * builds an automaton for each pattern and searches the product of the two
 * (`./automaton.ts`, `./product.ts`). It has no runtime dependencies.
 *
 * `intersects`, `matches` and `witness` share their names with the path API in
 * the package root. Here they take segment arrays, not strings, and `matches`
 * reads its path as a pattern. The import path says which one you call.
 *
 * @module segments
 */
import { search } from './product.ts'

export { IntersectError } from '../errors.ts'
export type { IntersectErrorCode } from '../errors.ts'

/**
 * One pattern already split into path segments, e.g. `["src","**","*.vue"]`.
 * It holds no separators. Each element is a glob, kept as written. A concrete
 * path is a `SegmentPattern` with no wildcards.
 */
export type SegmentPattern = readonly string[]

/** Matching options, shared by the segment core and the path API. */
export interface Options {
  /** Match paths ignoring ASCII case: only `A`-`Z` and `a`-`z` fold; `Ä` and `ä` differ. Default `false`. */
  caseInsensitive?: boolean
  /** Let `*`/`**` match a leading-dot segment. Default `false` (dotfiles are excluded). */
  dot?: boolean
  /** A globstar between separators may span zero segments (so `a`/`**`/`b` matches `a/b`). Default `true`. */
  globstarMatchesZero?: boolean
}

/**
 * Do two segment patterns share a matching path? Every other function in the
 * package builds on this question.
 *
 * @param a - The first segment pattern.
 * @param b - The second segment pattern.
 * @param opts - Matching options ({@link Options}). Defaults apply when omitted.
 * @returns `true` when some path matches both `a` and `b`, else `false`.
 * @throws {@link IntersectError} with code `UNSUPPORTED_SYNTAX` or `PATTERN_TOO_DEEP`.
 * @remarks Takes segment arrays. The root `intersects` takes strings. A pattern
 * with no wildcards matches only that exact path, so two literal segment
 * arrays intersect only when they are equal. A subtree is written with `**`.
 * @example
 * ```ts
 * intersects(["src", "**", "*.vue"], ["src", "siteA", "components", "Button.vue"]); // true
 * intersects(["src", "api", "**"], ["src", "web", "**"]);                           // false
 * ```
 */
export function intersects(a: SegmentPattern, b: SegmentPattern, opts?: Options): boolean {
  return search(a, b, opts) !== null
}

/**
 * Does a path, split into segments, match a segment pattern? This is
 * {@link intersects} with a literal pattern on one side: a concrete path
 * intersects `pattern` exactly when it matches it.
 *
 * @param path - The concrete path, already split into segments.
 * @param pattern - The segment pattern to test against.
 * @param opts - Matching options ({@link Options}). Defaults apply when omitted.
 * @returns `true` when `path` falls within `pattern`, else `false`.
 * @remarks Unlike the root `matches`, `path` is read as a pattern here, not as
 * a literal name. Escape glob characters in it yourself.
 * @example
 * ```ts
 * matches(["src", "api", "user.ts"], ["src", "**", "*.ts"]); // true
 * matches(["README.md"], ["src", "**"]);                     // false
 * ```
 */
export function matches(path: SegmentPattern, pattern: SegmentPattern, opts?: Options): boolean {
  return search(path, pattern, opts) !== null
}

/**
 * An example path both patterns match, or `null` when they are disjoint. It
 * lets a caller say where two patterns overlap. It costs nothing extra: it is
 * the path the search already found to answer {@link intersects}.
 *
 * @param a - The first segment pattern.
 * @param b - The second segment pattern.
 * @param opts - Matching options ({@link Options}). Defaults apply when omitted.
 * @returns A `SegmentPattern` both `a` and `b` match, or `null` if none exists.
 * @remarks Takes segment arrays. The root `witness` takes strings. A segment of
 * the result may be the empty string, which is valid for segment arrays. The
 * root `witness` joins the segments into a string. It skips a result whose
 * last segment is empty and keeps searching, because `parse` drops a trailing
 * separator, so no path string can write that result.
 * @example
 * ```ts
 * witness(["src", "api", "**"], ["src", "**", "handler.ts"]); // ["src", "api", "handler.ts"]
 * witness(["src", "api", "**"], ["src", "web", "**"]);        // null
 * ```
 */
export function witness(
  a: SegmentPattern,
  b: SegmentPattern,
  opts?: Options,
): SegmentPattern | null {
  return search(a, b, opts)
}
