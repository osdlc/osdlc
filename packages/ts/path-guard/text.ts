// Pure text helpers: no filesystem and no `node:*` import, so the `./lexical`
// entry loads in a browser. `resolve.ts` builds on them.

import { PathError } from './lexical.ts'

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
