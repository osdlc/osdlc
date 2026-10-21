// `PathGuard`: the containment checks, bound to one filesystem. No `node:fs`
// import: the filesystem is the `Resolver` the caller passes.

import { PathError, type PathWarning } from './errors.ts'
import { validateRelative } from './lexical.ts'
import {
  MAX_LINK_HOPS,
  WINDOWS,
  existingPrefix,
  isAbsolutePath,
  joinPath,
  native,
  platformPath,
  slash,
  under,
  type Resolver,
} from './resolve.ts'
import { windowsNames } from './text.ts'

/**
 * The containment checks against one filesystem, the `Resolver` it was built
 * with. Every path it takes as a place on the filesystem must be absolute; it
 * never reads the working directory. `nodeGuard` in `@osdlc/path-guard/node`
 * is a guard over the real disk.
 *
 * On Windows the guard reads `\` as a separator and a drive or UNC share as a
 * root, and folds `..` as text before it follows a link. It refuses a segment
 * that is a device name or names an alternate data stream. On other platforms
 * it accepts such a segment and calls `onWarning` for it. With no `onWarning`
 * the guard is silent; it never writes to the console.
 *
 * @example
 * ```ts
 * const guard = new PathGuard(resolver, { onWarning: (w) => console.warn(w.kind, w.segment) })
 * guard.resolve('/srv/data', 'notes/a.md') // '/srv/data/notes/a.md'
 * ```
 */
export class PathGuard {
  readonly #resolver: Resolver
  readonly #onWarning: ((warning: PathWarning) => void) | undefined

  constructor(resolver: Resolver, options: { onWarning?: (warning: PathWarning) => void } = {}) {
    this.#resolver = resolver
    this.#onWarning = options.onWarning
  }

  /**
   * Validate `raw` with `lexical.validateRelative`, join it onto `root`, and
   * prove the result stays inside. Port of the Rust `Guard::resolve`.
   *
   * Neither the path nor the root need exist: each is checked by the real path
   * of its deepest existing ancestor, so a create-new-file call uses the same
   * check as a read. A dangling symlink on the path is checked by where its
   * target would land. Returns the joined path (not its real path), with `\`
   * separators on Windows.
   *
   * On Windows a device name or an alternate data stream in `raw` is refused
   * before the filesystem is read. Elsewhere `onWarning` is called once for each,
   * in order, when the path is returned.
   *
   * @throws {PathError} Kind `empty_root` for an empty `root` and `not_absolute`
   * for a relative one, checked first. Then any kind `lexical.validateRelative`
   * throws for `raw`, and on Windows `reserved_name` or `alternate_stream`.
   * Then kind `unresolvable` when the walk of `root` or of the result follows
   * more than {@link MAX_LINK_HOPS} links or spends its resolver calls, and
   * `escapes` when the result lies outside `root`, or when the resolver answers
   * a real path that is not canonical (relative, or with a `.` or `..`
   * segment) for `root` or for a part of the result.
   * @example
   * ```ts
   * guard.resolve('/vault', 'notes/a.md') // '/vault/notes/a.md'
   * guard.resolve('/vault', '../etc') // throws PathError, kind 'parent_segment'
   * ```
   */
  resolve(root: string, raw: string): string {
    checkRoot(root, 'root')
    const rel = validateRelative(raw)
    const warnings = windowsNames(rel)
    const first = warnings[0]
    if (WINDOWS && first !== undefined) {
      const what =
        first.kind === 'reserved_name' ? 'a reserved device name' : 'an alternate data stream'
      throw new PathError(
        first.kind,
        `path names ${what} on Windows: ${JSON.stringify(first.segment)} in ${JSON.stringify(raw)}`,
      )
    }
    const joined = native(joinPath(slash(root), rel))
    const realRoot = existingPrefix(this.#resolver, root)
    const real = existingPrefix(this.#resolver, joined)
    if (realRoot === null || real === null) {
      throw new PathError(
        'unresolvable',
        `cannot resolve ${JSON.stringify(raw)} under ${JSON.stringify(root)}: more than ${MAX_LINK_HOPS} links, or too many resolver calls`,
      )
    }
    // A real root that is not absolute, such as the empty path a broken
    // resolver may answer, would hold every relative path.
    if (!isAbsolutePath(realRoot) || !under(real, realRoot)) {
      throw new PathError(
        'escapes',
        `path escapes the root: ${JSON.stringify(raw)} resolves outside ${JSON.stringify(native(realRoot))}`,
      )
    }
    if (this.#onWarning) for (const warning of warnings) this.#onWarning(warning)
    return joined
  }

  /**
   * Like {@link PathGuard.resolve}, but returns null instead of throwing a
   * {@link PathError}. Errors that are not a {@link PathError} still propagate.
   *
   * @example
   * ```ts
   * guard.tryResolve('/vault', 'notes/a.md') // '/vault/notes/a.md'
   * guard.tryResolve('/vault', '../etc') // null
   * ```
   */
  tryResolve(root: string, raw: string): string | null {
    try {
      return this.resolve(root, raw)
    } catch (error) {
      if (error instanceof PathError) return null
      throw error
    }
  }

  /**
   * Is `inner` the same directory as `outer`, or beneath it, once both are
   * reduced to the real path of what exists? Compared by whole components, so
   * `/vault-bee` is not inside `/vault-b`. False when the answer cannot be
   * proved: either walk follows more than {@link MAX_LINK_HOPS} links or spends
   * its resolver calls, or the resolver answers a real path that is not
   * canonical (relative, or with a `.` or `..` segment). Port of the Rust
   * `Guard::contains`.
   *
   * Does not throw for a missing path; it compares what exists and keeps the
   * rest as written.
   *
   * @throws {PathError} Kind `empty_root` for an empty `outer`, and
   * `not_absolute` for a relative `outer` or a relative or empty `inner`. `outer`
   * is checked first.
   * @example
   * ```ts
   * guard.contains('/vault', '/vault/notes/new.md') // true, when /vault holds no escaping link
   * guard.contains('/vault-b', '/vault-bee') // false
   * ```
   */
  contains(outer: string, inner: string): boolean {
    checkRoot(outer, 'outer')
    checkAbsolute(inner, 'inner')
    const realOuter = existingPrefix(this.#resolver, outer)
    const realInner = existingPrefix(this.#resolver, inner)
    return (
      realOuter !== null &&
      realInner !== null &&
      isAbsolutePath(realOuter) &&
      under(realInner, realOuter)
    )
  }

  /**
   * The real path of as much of `absPath` as exists, with the rest re-attached
   * and any `..` in it folded against that real path. A dangling symlink is
   * followed to its target. Where the walk gives up (more than
   * {@link MAX_LINK_HOPS} links, or too many resolver calls), or the resolver
   * answers a real path that is not canonical, returns `absPath`
   * with `..` folded as text, so the answer never holds a `..`. A missing path
   * is not an error. On Windows the answer has `\` separators. Port of the Rust
   * `Guard::real_path`.
   *
   * @throws {PathError} Kind `not_absolute` when `absPath` is relative or empty.
   * @example
   * ```ts
   * guard.realPath('/no/such/dir/../x') // '/no/such/x'
   * ```
   */
  realPath(absPath: string): string {
    checkAbsolute(absPath, 'path')
    const found = existingPrefix(this.#resolver, absPath)
    return found !== null && isAbsolutePath(found) ? native(found) : platformPath.resolve(absPath)
  }
}

/** Throws `empty_root` for an empty root and `not_absolute` for a relative one. */
function checkRoot(root: string, what: string): void {
  if (root === '') throw new PathError('empty_root', `${what} is empty`)
  checkAbsolute(root, what)
}

/** Throws `not_absolute` unless `path` is absolute on this platform. */
function checkAbsolute(path: string, what: string): void {
  if (!isAbsolutePath(path)) {
    throw new PathError('not_absolute', `${what} must be absolute, got ${JSON.stringify(path)}`)
  }
}
