// Text-only checks: no filesystem and no `node:*` import. The `./lexical` entry
// loads this module (see lexical-entry.ts), and `resolve.ts` builds on it.

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

/**
 * Turn an absolute path back into a root-relative one with `/` separators:
 * `/v/Notes/a.md` under `/v` becomes `Notes/a.md`, and the root itself becomes
 * `''`. `abs` is under `root` by whole components, so `/vault2` is not under
 * `/vault`. A `.` component is dropped. Touches no filesystem. POSIX paths only.
 * Port of the Rust `to_relative`.
 *
 * @throws {PathError} Kind `escapes` if `abs` is not under `root`, and kind
 * `parent_segment` if the relative part holds a `..`, or if `root` is empty and
 * `abs` is absolute.
 * @example
 * ```ts
 * toRelative('/v', '/v/Notes/a.md') // 'Notes/a.md'
 * toRelative('/v', '/other/a.md') // throws PathError, kind 'escapes'
 * ```
 */
export function toRelative(root: string, abs: string): string {
  // Rust also throws `NotUtf8` for a component that is not valid UTF-8. A
  // TypeScript path is a string, so that case does not exist here.
  // An empty root is a prefix of every path in Rust, so an absolute `abs` leaves
  // the root component in the relative part, which Rust reports as a parent
  // segment. Match it. A later release gives this case its own kind.
  if (components(root).segs.length === 0 && !components(root).absolute && abs.startsWith('/')) {
    throw new PathError(
      'parent_segment',
      `path contains a parent-directory segment: ${JSON.stringify(abs)}`,
    )
  }
  if (!startsWith(abs, root)) {
    throw new PathError(
      'escapes',
      `path escapes the root: ${JSON.stringify(abs)} resolves outside ${JSON.stringify(root)}`,
    )
  }
  const rel = components(abs).segs.slice(components(root).segs.length)
  if (rel.includes('..')) {
    throw new PathError(
      'parent_segment',
      `path contains a parent-directory segment: ${JSON.stringify(rel.join('/'))}`,
    )
  }
  // As Rust skips `Component::CurDir`. `components` leaves a `.` only at the
  // start of a relative path, which lands here when `root` is empty.
  return rel.filter((seg) => seg !== '.').join('/')
}

/** Whole-component prefix test, as Rust's `Path::starts_with`. */
export function startsWith(path: string, base: string): boolean {
  const p = components(path)
  const b = components(base)
  return (
    p.absolute === b.absolute &&
    b.segs.length <= p.segs.length &&
    b.segs.every((seg, i) => p.segs[i] === seg)
  )
}

/**
 * Rust's `Path::components` for a POSIX path: empty segments and `.` are
 * dropped, except a `.` that starts a relative path.
 */
export function components(path: string): { absolute: boolean; segs: string[] } {
  const absolute = path.startsWith('/')
  const segs = path
    .split('/')
    .filter((seg, i) => seg !== '' && (seg !== '.' || (i === 0 && !absolute)))
  return { absolute, segs }
}

/**
 * Is `path` the same as `root`, or beneath it, judged by text alone? Both must
 * be absolute POSIX paths. `.` is dropped and `..` removed with the component
 * before it, so `/vault/../etc` is not under `/vault`. Compared by whole
 * components, so `/vault2` is not under `/vault`. A trailing `/` is ignored.
 * Returns false, and does not throw, when either path is relative.
 *
 * Touches no filesystem and follows no symlink, so it cannot see a link that
 * leads out of `root`. Use `resolveInside` or `contains` for that. Unlike
 * `isInside`, it uses no `node:path`, and a relative input is never joined onto
 * the working directory.
 *
 * @example
 * ```ts
 * isUnder('/vault', '/vault/a/b.md') // true
 * isUnder('/vault', '/vault2/a.md') // false
 * isUnder('/vault', '/vault/../etc') // false
 * isUnder('/vault', 'a.md') // false
 * ```
 */
export function isUnder(root: string, path: string): boolean {
  const r = fold(root)
  const p = fold(path)
  return r !== null && p !== null && r.every((seg, i) => p[i] === seg)
}

/** The components of an absolute path with `.` and `..` folded; null if relative. */
function fold(path: string): string[] | null {
  if (!path.startsWith('/')) return null
  const out: string[] = []
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out
}
