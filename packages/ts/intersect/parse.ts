/**
 * Intersect L1 — parse a path-like glob string into a `SegmentPattern`.
 *
 * The seam between path strings and the segment core: it splits a path-like
 * glob on the separator into segments, each of which is a glob token taken
 * verbatim. No inference — there is NO directory/file/ambiguity classification.
 * See `docs/planning/decisions/D-4FRD-intersect-api/layered-api.md`.
 */
import type { SegmentPattern } from './segments/index.ts'

/**
 * Split a path-like glob into segments on the separator. Each segment is a glob
 * token, verbatim — no classification. A trailing separator (which splits into
 * an empty final segment) is normalized off, so `src/api/` == `src/api`.
 * Nothing else is collapsed or inferred.
 *
 * @param pathLike - A path-like glob string, e.g. `"src/api/**"`.
 * @param opts - Parsing options. `separator` overrides the split character (default `"/"`).
 * @returns The {@link SegmentPattern} — the segments in order, the segment core's unit.
 * @remarks No inference: a pattern with no wildcards is an exact-path match
 * (`src/siteA/components` matches only that path, not files beneath it); opt
 * into a subtree explicitly with a trailing `**`. Only a single trailing
 * separator is normalized off.
 * @example
 * ```ts
 * parse("src/api/**");  // ["src", "api", "**"]
 * parse("src/api/");    // ["src", "api"]   — trailing separator normalized off
 * parse("README.md");   // ["README.md"]    — no wildcards → an exact-path match
 * ```
 */
export function parse(pathLike: string, opts?: { separator?: string }): SegmentPattern {
  const separator = opts?.separator ?? '/'
  const segments = pathLike.split(separator)
  // Normalize off a trailing separator: an empty final segment from a path that
  // ends with the separator. Only the one trailing empty is dropped.
  if (segments.length > 1 && segments[segments.length - 1] === '') {
    segments.pop()
  }
  return segments
}
