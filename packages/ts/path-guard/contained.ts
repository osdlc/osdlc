import { constants, type Stats } from 'node:fs'
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'

/** Lexical check: `path` is `root` or lies under it once both are normalized. */
export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/** Real path of `path` when it lies under the already-resolved `realRoot`; otherwise null. Throws when `path` is missing. */
export async function realPathInside(realRoot: string, path: string): Promise<string | null> {
  const realTarget = await realpath(path)
  return isInside(realRoot, realTarget) ? realTarget : null
}

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
 * Returns null when a check fails. The caller closes the handle.
 * Throws when `path` does not exist.
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
 * Throws when `path` no longer exists.
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

export interface ContainedPath {
  /** Checked real path, the one to read. */
  realPath: string
  /** Lexical path relative to `root`, for URLs. */
  relativePath: string
}

/** Resolves an existing `path` that stays inside `root` both as written and after symlinks; otherwise null. */
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
