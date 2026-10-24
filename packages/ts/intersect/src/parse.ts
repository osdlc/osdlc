/**
 * Parse a path-like glob string into a `SegmentPattern`: split it on the
 * separator into segments, each kept as written. It does not guess whether a
 * segment names a directory or a file.
 */
import { IntersectError } from './errors.ts'
import type { SegmentPattern } from './segments/index.ts'

/**
 * Split a path-like glob into segments on the separator. Each segment is kept
 * as written. One trailing separator (which would give an empty last segment)
 * is dropped, so `src/api/` equals `src/api`. Nothing else is collapsed.
 *
 * @param pathLike - A path-like glob string, e.g. `"src/api/**"`.
 * @param opts - Parsing options. `separator` overrides the split character. The
 * default is `"/"`, and an empty string means the default too.
 * @returns The {@link SegmentPattern}: the segments in order.
 * @remarks A pattern with no wildcards matches only that exact path
 * (`src/siteA/components` matches that path, not files beneath it). To match a
 * subtree, end the pattern with `**`.
 * @throws {@link IntersectError} with code `INVALID_ARGUMENT` when `pathLike` is not a string.
 * @example
 * ```ts
 * parse("src/api/**");  // ["src", "api", "**"]
 * parse("src/api/");    // ["src", "api"]   (trailing separator dropped)
 * parse("README.md");   // ["README.md"]    (no wildcards: an exact path)
 * ```
 */
export function parse(pathLike: string, opts?: { separator?: string }): SegmentPattern {
  if (typeof pathLike !== 'string') {
    throw new IntersectError(
      'INVALID_ARGUMENT',
      `expected a pattern string, got ${describe(pathLike)}`,
    )
  }
  // An empty separator would split the string into characters, so use the default.
  const separator = opts?.separator || '/'
  const segments = pathLike.split(separator)
  // Drop the one empty last segment that a trailing separator gives.
  if (segments.length > 1 && segments[segments.length - 1] === '') {
    segments.pop()
  }
  return segments
}

/** The characters the segment tokenizer reads as glob syntax (and `(`, which opens an extglob). */
const GLOB_META = /[\\*?[\]{}(]/g

/**
 * Escape a concrete path so the pattern parser reads it as a literal name.
 * Callers that hold a real path (the root entry's `matches` family and `./fs`)
 * run it through this before parsing, so `pages/[id].vue` is that name and not
 * a character class.
 */
export function literal(path: string): string {
  return path.replace(GLOB_META, '\\$&')
}

/** A short description of a bad argument for an error message. */
export function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array with a non-string element'
  return typeof value
}
