import { constants, type Stats } from 'node:fs'
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'

// These helpers call Node `fs` directly and take no `Resolver`.

/**
 * Lexical check: `path` is `root` or lies under it once both are normalized.
 * Touches no filesystem and does not throw.
 *
 * @example
 * ```ts
 * isInside('/vault', '/vault/a/b.md') // true
 * isInside('/vault', '/vault/../etc') // false
 * ```
 */
export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * Real path of `path` when it lies under the already-resolved `realRoot`; otherwise null.
 *
 * @throws {Error} What `fs.realpath` throws, such as `ENOENT`, when `path` does not exist.
 * @example
 * ```ts
 * await realPathInside('/vault', '/vault/link-to-outside') // null
 * await realPathInside('/vault', '/vault/a.md') // '/vault/a.md'
 * ```
 */
export async function realPathInside(realRoot: string, path: string): Promise<string | null> {
  const realTarget = await realpath(path)
  return isInside(realRoot, realTarget) ? realTarget : null
}

/**
 * An open file that passed the containment checks of {@link openContainedFile}.
 * `handle` is read-only and non-blocking. `stats` came from that handle.
 * The caller must close `handle`.
 */
export interface ContainedFile {
  handle: FileHandle
  stats: Stats
}

/**
 * Opens `path` when it resolves inside `realRoot`. A target outside is not opened, so an outside
 * FIFO cannot hang the call. After the open, `path` is resolved again and the handle is accepted
 * only when it is the file `lstat` finds at that real path (same device and inode), so a file or
 * parent directory swapped for a symlink before the open is refused.
 * Remaining window: a parent directory swapped out, back, and out again across the open, the
 * re-resolve and the `lstat` still passes. Node has no per-component no-follow open to close it.
 * The open is non-blocking, so a FIFO cannot hang the call, but it also succeeds for a directory
 * and for any other non-regular file: the handle can be one. The caller checks `stats.isFile()`
 * before it reads.
 * Returns null when a check fails. On a failed check or a throw, this function closes the
 * handle. On success it does not: the caller closes `handle`.
 *
 * @throws {Error} What `fs.realpath` or `fs.open` throws, such as `ENOENT`, when `path`
 * does not exist.
 * @example
 * ```ts
 * const file = await openContainedFile(realRoot, '/vault/a.md')
 * if (file !== null) {
 *   try {
 *     if (file.stats.isFile()) console.log(await file.handle.readFile('utf8'))
 *   } finally {
 *     await file.handle.close()
 *   }
 * }
 * ```
 */
export async function openContainedFile(
  realRoot: string,
  path: string,
): Promise<ContainedFile | null> {
  if ((await realPathInside(realRoot, path)) === null) return null
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const stats = await handle.stat()
    const realPath = await realPathInside(realRoot, path)
    // lstat, not stat: a final component swapped for a symlink after the re-resolve reports the
    // link's inode, so the handle no longer matches.
    const resolved = realPath === null ? null : await lstat(realPath)
    if (resolved !== null && resolved.dev === stats.dev && resolved.ino === stats.ino) {
      return { handle, stats }
    }
  } catch (error) {
    await handle.close()
    throw error
  }
  await handle.close()
  return null
}

/**
 * Reads `path` through `openContainedFile`. Returns null when the file is not inside `realRoot`
 * or is not a regular file.
 * Closes the handle itself.
 *
 * @throws {Error} What `fs.realpath` or `fs.open` throws, such as `ENOENT`, when `path`
 * does not exist.
 * @example
 * ```ts
 * const bytes = await readContainedFile(realRoot, '/vault/a.md') // Buffer, or null
 * ```
 */
export async function readContainedFile(realRoot: string, path: string): Promise<Buffer | null> {
  const file = await openContainedFile(realRoot, path)
  if (file === null) return null
  try {
    return file.stats.isFile() ? await file.handle.readFile() : null
  } finally {
    await file.handle.close()
  }
}

/** A path that passed {@link existingPathInside}. */
export interface ContainedPath {
  /** Checked real path, the one to read. */
  realPath: string
  /** Lexical path relative to `root`, for URLs. */
  relativePath: string
}

/**
 * Resolves an existing `path` that stays inside `root` both as written and after symlinks;
 * otherwise null. Returns null, and does not throw, when `path` does not exist.
 *
 * @example
 * ```ts
 * await existingPathInside('/vault', '/vault', '/vault/notes/a.md')
 * // { realPath: '/vault/notes/a.md', relativePath: 'notes/a.md' }
 * ```
 */
export async function existingPathInside(
  root: string,
  realRoot: string,
  path: string,
): Promise<ContainedPath | null> {
  if (!isInside(root, path)) return null
  try {
    const realPath = await realPathInside(realRoot, path)
    return realPath === null ? null : { realPath, relativePath: relative(root, path) }
  } catch {
    return null
  }
}
