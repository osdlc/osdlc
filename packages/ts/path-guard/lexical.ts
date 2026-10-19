/**
 * Why a path was refused. The names match the shared fixture and the Rust
 * crate's `PathError` variants.
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

export class PathError extends Error {
  override readonly name = 'PathError'
  readonly kind: PathErrorKind

  constructor(kind: PathErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

/**
 * Layer 1: lexical validation of a root-relative path. Port of the Rust
 * `validate_relative`.
 *
 * Returns the normalised form (backslashes folded to `/`, no trailing slash).
 * Touches no filesystem. Throws a {@link PathError} for an empty path, a NUL
 * byte, a leading `~`, a Windows drive or UNC prefix, an absolute path, and an
 * empty, `.` or `..` segment, checked in that order.
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
