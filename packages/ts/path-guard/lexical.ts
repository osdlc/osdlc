/**
 * Why a path was refused. The kinds are the snake_case names of the Rust
 * `PathError` variants, except Rust `NotUtf8`, which has no kind here.
 * `escapes` also covers a path the check cannot prove stays inside: an empty
 * root, more than `MAX_LINK_HOPS` links, or a spent resolver-call budget.
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

/**
 * The error every refused path throws. Read `kind` to tell the reasons apart.
 *
 * @example
 * ```ts
 * try {
 *   validateRelative('../x')
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
 * Layer 1: lexical validation of a relative path. The caller joins it onto a
 * root. Port of the Rust `validate_relative`.
 *
 * Returns the normalised form (backslashes folded to `/`, no trailing slash).
 * Touches no filesystem. Refuses an empty path, a NUL byte, a leading `~`, a
 * Windows drive or UNC prefix, an absolute path, and an empty, `.` or `..`
 * segment. The checks run in that order, and segments are checked left to right.
 *
 * @throws {PathError} Kind `empty`, `nul`, `tilde`, `windows_path`, `absolute`,
 * `degenerate_segment` or `parent_segment`, by the order above.
 * @example
 * ```ts
 * validateRelative('notes\\a.md/') // 'notes/a.md'
 * validateRelative('a//b') // throws PathError, kind 'degenerate_segment'
 * ```
 */
export function validateRelative(raw: string): string {
  const shown = JSON.stringify(raw)
  if (raw === '') throw new PathError('empty', 'path is empty')
  if (raw.includes('\0')) throw new PathError('nul', 'path contains a NUL byte')
  if (raw.startsWith('~')) {
    throw new PathError('tilde', `path starts with \`~\`, which a shell would expand: ${shown}`)
  }
  // `C:\x`, `C:/x`, and UNC `\\server\share`.
  if (/^[A-Za-z]:/.test(raw) || raw.startsWith('\\\\')) {
    throw new PathError('windows_path', `path looks like a Windows drive or UNC path: ${shown}`)
  }

  const unified = raw.replaceAll('\\', '/')
  if (unified.startsWith('/')) {
    throw new PathError('absolute', `path must be relative, got absolute path ${shown}`)
  }

  const trimmed = unified.replace(/\/+$/, '')
  if (trimmed === '') throw new PathError('empty', 'path is empty')
  for (const seg of trimmed.split('/')) {
    if (seg === '' || seg === '.') {
      throw new PathError('degenerate_segment', `path contains an empty or \`.\` segment: ${shown}`)
    }
    if (seg === '..') {
      throw new PathError('parent_segment', `path contains a parent-directory segment: ${shown}`)
    }
  }
  return trimmed
}
