// The error and warning types. No filesystem and no `node:*` import: the
// `./lexical` entry loads this module.

/**
 * Why a path was refused. The kinds are the snake_case names of the Rust
 * `PathError` variants, except Rust `NotUtf8`, which has no kind here.
 *
 * - `empty`, `nul`, `tilde`, `windows_path`, `absolute`, `parent_segment`,
 *   `degenerate_segment`: `lexical.validateRelative` refused the relative path.
 * - `escapes`: the path is proved to lie outside the root.
 * - `unresolvable`: the check followed more than `MAX_LINK_HOPS` links or
 *   spent its resolver calls, so it cannot prove where the path lands.
 * - `empty_root`: the root is the empty path.
 * - `not_under_root`: `lexical.toRelative` was given a path that does not
 *   start with the root.
 * - `not_absolute`: an argument that must be absolute is relative or empty.
 * - `reserved_name`, `alternate_stream`: on Windows, a segment is a device
 *   name or names an alternate data stream. Only `PathGuard` refuses these,
 *   and only on Windows.
 */
export type PathErrorKind =
  | 'empty'
  | 'nul'
  | 'tilde'
  | 'windows_path'
  | 'absolute'
  | 'parent_segment'
  | 'degenerate_segment'
  | 'escapes'
  | 'unresolvable'
  | 'empty_root'
  | 'not_under_root'
  | 'not_absolute'
  | 'reserved_name'
  | 'alternate_stream'

/**
 * The error every refused path throws. Read `kind` to tell the reasons apart.
 *
 * @example
 * ```ts
 * try {
 *   lexical.validateRelative('../x')
 * } catch (error) {
 *   if (error instanceof PathError) console.log(error.kind) // 'parent_segment'
 * }
 * ```
 */
export class PathError extends Error {
  override readonly name = 'PathError'
  readonly kind: PathErrorKind

  constructor(kind: PathErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

/**
 * A segment that names a device or an alternate data stream on Windows, and an
 * ordinary file elsewhere. `kind` is the {@link PathErrorKind} the guard
 * refuses it with on Windows. `segment` is the segment as it appears in the
 * normalised path, with `/` separators.
 *
 * @example
 * ```ts
 * const warning: PathWarning = { kind: 'reserved_name', segment: 'NUL.txt' }
 * ```
 */
export interface PathWarning {
  kind: 'reserved_name' | 'alternate_stream'
  segment: string
}
