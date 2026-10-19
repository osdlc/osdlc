/**
 * Intersect L0 — segment core (`intersect/segments`).
 *
 * The pure, primitive engine. It reasons over patterns already split into
 * path segments (`SegmentPattern`); it never parses strings and never touches
 * the filesystem. Pairwise and minimal. See
 * `docs/planning/decisions/D-4FRD-intersect-api/layered-api.md`.
 *
 * The type surface is the contract the fixture corpus specifies. The engine is
 * a synchronized product of two per-pattern sequence automata plus reachability
 * (`./automaton.ts`, `./product.ts`); it has zero runtime dependencies.
 *
 * @module segments
 */
import { search } from './product.ts'

/**
 * One pattern already split into path segments, e.g. `["src","**","*.vue"]`.
 * The core's unit: no separators, no strings to parse. Each element is a glob
 * token taken verbatim; a concrete path is just a `SegmentPattern` with no
 * wildcards.
 */
export type SegmentPattern = readonly string[]

/** Matching semantics, shared by the segment core and the path API. */
export interface Options {
  /** Match paths ignoring ASCII case. Default `false`. */
  caseInsensitive?: boolean
  /** Let `*`/`**` match a leading-dot segment. Default `false` (dotfiles are excluded). */
  dot?: boolean
  /** A globstar between separators may span zero segments (so `a`/`**`/`b` matches `a/b`). Default `true`. */
  globstarMatchesZero?: boolean
}

/**
 * Do two segment-patterns share a common matching path? The load-bearing
 * primitive: every other question in the library is a shape over it.
 *
 * @param a - The first segment-pattern.
 * @param b - The second segment-pattern.
 * @param opts - Matching semantics ({@link Options}); defaults apply when omitted.
 * @returns `true` when some path matches both `a` and `b`, else `false`.
 * @remarks A pattern with no wildcards is an exact-path match, so two literal
 * segment arrays intersect only when equal. Subtrees are opted into with `**`.
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
 * Does a concrete segmented path match a segment-pattern? The degenerate case
 * of {@link intersects}: a concrete path is a literal `SegmentPattern`, so it
 * intersects `pattern` exactly when it matches it.
 *
 * @param path - The concrete path, already split into segments.
 * @param pattern - The segment-pattern to test against.
 * @param opts - Matching semantics ({@link Options}); defaults apply when omitted.
 * @returns `true` when `path` falls within `pattern`, else `false`.
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
 * An example common path (the reachability witness), or `null` when disjoint.
 * Turns "these overlap" into "these overlap at X". The witness is free — it is
 * the path the engine already walked to prove {@link intersects}.
 *
 * @param a - The first segment-pattern.
 * @param b - The second segment-pattern.
 * @param opts - Matching semantics ({@link Options}); defaults apply when omitted.
 * @returns A `SegmentPattern` both `a` and `b` match, or `null` if none exists.
 * @remarks A segment of the witness may be the empty string — legal here, since
 * this layer answers in segment vectors. The path API's `witness` stringifies,
 * and skips a vector whose LAST segment is empty: `parse` normalizes a trailing
 * separator back off, so no path string spells it.
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
