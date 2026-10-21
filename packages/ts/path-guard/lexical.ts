// The `lexical` namespace: text-only checks. No filesystem, no ambient state
// such as the working directory, and no `node:*` import. Every export of this
// module is a member of `lexical`, so helpers live in `text.ts`.

import { PathError, type PathWarning } from './errors.ts'
import { components, foldPosix, windowsNames } from './text.ts'

/**
 * Lexical validation of a relative path. The caller joins it onto a root.
 * Port of the Rust `lexical::validate_relative`.
 *
 * Returns the normalised form (backslashes folded to `/`, no trailing slash).
 * Touches no filesystem. Refuses an empty path, a NUL byte, a leading `~`, a
 * Windows drive or UNC prefix (a single letter then `:` included), an absolute
 * path, and an empty, `.` or `..` segment. The checks run in that order, and
 * segments are checked left to right.
 *
 * A segment that is a Windows device name (`NUL`, `com1.txt`) or names an
 * alternate data stream (`a:b`) is accepted, on every platform. When the path
 * is accepted, `onWarning` is called once for each such segment, in order.
 * `PathGuard` refuses these segments on Windows.
 *
 * @throws {PathError} Kind `empty`, `nul`, `tilde`, `windows_path`, `absolute`,
 * `degenerate_segment` or `parent_segment`, by the order above.
 * @example
 * ```ts
 * lexical.validateRelative('notes\\a.md/') // 'notes/a.md'
 * lexical.validateRelative('a//b') // throws PathError, kind 'degenerate_segment'
 * lexical.validateRelative('logs/NUL', { onWarning: (w) => console.log(w) })
 * // 'logs/NUL', after logging { kind: 'reserved_name', segment: 'NUL' }
 * ```
 */
export function validateRelative(
  raw: string,
  options: { onWarning?: (warning: PathWarning) => void } = {},
): string {
  const shown = JSON.stringify(raw)
  if (raw === '') throw new PathError('empty', 'path is empty')
  if (raw.includes('\0')) throw new PathError('nul', 'path contains a NUL byte')
  if (raw.startsWith('~')) {
    throw new PathError('tilde', `path starts with \`~\`, which a shell would expand: ${shown}`)
  }
  // `C:\x`, `C:/x`, `C:x`, and UNC `\\server\share`.
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
  if (options.onWarning) for (const warning of windowsNames(trimmed)) options.onWarning(warning)
  return trimmed
}

/**
 * Is `path` the same as `root`, or beneath it, judged by text alone? Both must
 * be absolute POSIX paths, on every platform. `.` is dropped and `..` removed
 * with the component before it, so `/vault/../etc` is not under `/vault`.
 * Compared by whole components, so `/vault2` is not under `/vault`. A trailing
 * `/` is ignored. Port of the Rust `lexical::is_under`.
 *
 * Touches no filesystem and follows no symlink, so it cannot see a link that
 * leads out of `root`. Use `PathGuard.contains` for that, and for Windows
 * paths. A caller with a relative path joins the working directory itself, with
 * {@link absolute}.
 *
 * @throws {PathError} Kind `empty_root` when `root` is empty, and kind
 * `not_absolute` when `root` or `path` is relative or `path` is empty. The root
 * is checked first.
 * @example
 * ```ts
 * lexical.isUnder('/vault', '/vault/a/b.md') // true
 * lexical.isUnder('/vault', '/vault2/a.md') // false
 * lexical.isUnder('/vault', '/vault/../etc') // false
 * lexical.isUnder('/vault', 'a.md') // throws PathError, kind 'not_absolute'
 * ```
 */
export function isUnder(root: string, path: string): boolean {
  checkRoot(root)
  checkAbsolute(path)
  const r = foldPosix(root)
  const p = foldPosix(path)
  return r.every((seg, i) => p[i] === seg)
}

/**
 * `path` made absolute against `cwd` and folded as text: `.` dropped, `..`
 * removed with the component before it, no trailing slash. An absolute `path`
 * ignores `cwd`, but `cwd` must still be absolute. POSIX paths on every
 * platform: `\` is part of a name. Port of the Rust `lexical::absolute`.
 *
 * Touches no filesystem, follows no symlink and reads no working directory, so
 * it cannot tell whether the result stays inside any root. A `..` at the root
 * stays at the root, and a leading `..` in a relative path pops the last
 * component of `cwd`.
 *
 * @throws {PathError} Kind `not_absolute` when `cwd` is relative or empty.
 * @example
 * ```ts
 * lexical.absolute('/srv/data/a/./b/../c/', '/w') // '/srv/data/a/c'
 * lexical.absolute('/srv/../../etc', '/w') // '/etc'
 * lexical.absolute('a/../b', process.cwd()) // `${process.cwd()}/b` on POSIX
 * ```
 */
export function absolute(path: string, cwd: string): string {
  checkAbsolute(cwd, 'cwd')
  const segs = foldPosix(path.startsWith('/') ? path : `${cwd}/${path}`)
  return `/${segs.join('/')}`
}

/**
 * Turn an absolute path back into a root-relative one with `/` separators:
 * `/v/Notes/a.md` under `/v` becomes `Notes/a.md`, and the root itself becomes
 * `''`. `abs` is under `root` by whole components, so `/vault2` is not under
 * `/vault`. A `.` component is dropped. Touches no filesystem. POSIX paths on
 * every platform. Port of the Rust `lexical::to_relative`.
 *
 * @throws {PathError} Kind `empty_root` when `root` is empty, `not_absolute`
 * when `root` or `abs` is relative or `abs` is empty, `not_under_root` when
 * `abs` does not start with `root`, and `parent_segment` when the relative part
 * holds a `..`. In that order.
 * @example
 * ```ts
 * lexical.toRelative('/v', '/v/Notes/a.md') // 'Notes/a.md'
 * lexical.toRelative('/v', '/other/a.md') // throws PathError, kind 'not_under_root'
 * ```
 */
export function toRelative(root: string, abs: string): string {
  // Rust also throws `NotUtf8` for a component that is not valid UTF-8. A
  // TypeScript path is a string, so that case does not exist here.
  checkRoot(root)
  checkAbsolute(abs)
  const r = components(root).segs
  const p = components(abs).segs
  if (r.length > p.length || !r.every((seg, i) => p[i] === seg)) {
    throw new PathError(
      'not_under_root',
      `path is not under the root: ${JSON.stringify(abs)} does not start with ${JSON.stringify(root)}`,
    )
  }
  const rel = p.slice(r.length)
  if (rel.includes('..')) {
    throw new PathError(
      'parent_segment',
      `path contains a parent-directory segment: ${JSON.stringify(rel.join('/'))}`,
    )
  }
  return rel.join('/')
}

/** Throws `empty_root` for an empty root and `not_absolute` for a relative one. */
function checkRoot(root: string): void {
  if (root === '') throw new PathError('empty_root', 'root is empty')
  checkAbsolute(root, 'root')
}

/** Throws `not_absolute` unless `path` starts with `/`. */
function checkAbsolute(path: string, what = 'path'): void {
  if (!path.startsWith('/')) {
    throw new PathError('not_absolute', `${what} must be absolute, got ${JSON.stringify(path)}`)
  }
}
