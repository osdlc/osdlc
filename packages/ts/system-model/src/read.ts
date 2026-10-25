/**
 * Bounded reads of a repository's files. A repository is untrusted input, so
 * a read must not leave the tree (through a symlink anywhere on the path, or
 * through `..`), block on a device or a pipe, or load a file of any size.
 */

import { constants } from 'node:fs'
import { open, realpath, stat, type FileHandle } from 'node:fs/promises'
import { isAbsolute, join, sep } from 'node:path'

/** The largest file a runner or detection reads: 4 MiB. A larger file is skipped. */
export const MAX_READ_BYTES = 4 * 1024 * 1024

/** A file's text, or why it was not read. */
export type BoundedRead = { text: string } | { skipped: string; missing?: true }

/** Where a root-relative path really is, or why it is refused. */
export type Resolved = { real: string } | { skipped: string; missing?: true; outside?: true }

/**
 * Resolve `relPath` under `root` to its real path, following every symlink on
 * the way. The result must be inside the real `root`.
 *
 * Refused: an absolute path, a path with a `..` segment, and a path whose real
 * location is outside the root (a symlinked file or parent directory that
 * points out). A path that does not exist is `missing: true`.
 */
export async function resolveInside(root: string, relPath: string): Promise<Resolved> {
  if (isAbsolute(relPath) || relPath.split(/[\\/]/).includes('..')) {
    return { skipped: 'a path outside the repository', outside: true }
  }
  let real: string
  let realRoot: string
  try {
    realRoot = await realpath(root)
    real = await realpath(join(root, relPath))
  } catch (err) {
    return { skipped: message(err), missing: true }
  }
  if (real !== realRoot && !real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)) {
    return { skipped: 'a symlink that leaves the repository', outside: true }
  }
  return { real }
}

/**
 * Read `relPath` under `root` as UTF-8, or say why not.
 *
 * Skipped: a path that leaves `root` (see {@link resolveInside}), anything that
 * is not a regular file (a directory, a device such as `/dev/zero`, a pipe),
 * and a file larger than `max` bytes. A missing file is `missing: true`.
 */
export async function readBounded(
  root: string,
  relPath: string,
  max: number = MAX_READ_BYTES,
): Promise<BoundedRead> {
  const resolved = await resolveInside(root, relPath)
  if (!('real' in resolved)) {
    return resolved.missing
      ? { skipped: resolved.skipped, missing: true }
      : { skipped: resolved.skipped }
  }
  const read = await readRegular(resolved.real, max)
  return 'bytes' in read ? { text: read.bytes.toString('utf-8') } : read
}

/** The bytes of a regular file at a real path, or why they were not read. */
export type RegularRead = { bytes: Buffer } | { skipped: string; missing?: true }

/**
 * Read a regular file of at most `max` bytes. `real` must already be resolved
 * (see {@link resolveInside}).
 *
 * The path is checked before it is opened, because opening a pipe blocks. It
 * is then opened with `O_NONBLOCK` and `O_NOFOLLOW` and checked again on the
 * handle, so a file swapped for a pipe or a symlink between the two steps is
 * still refused.
 */
export async function readRegular(
  real: string,
  max: number = MAX_READ_BYTES,
): Promise<RegularRead> {
  try {
    const info = await stat(real)
    if (!info.isFile()) return { skipped: 'not a regular file' }
    if (info.size > max) return { skipped: `larger than ${max} bytes` }
  } catch (err) {
    return { skipped: message(err), missing: true }
  }

  let handle: FileHandle
  try {
    // Both flags are 0 on Windows, where neither exists.
    handle = await open(
      real,
      constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0),
    )
  } catch (err) {
    return { skipped: message(err) }
  }
  try {
    const info = await handle.stat()
    if (!info.isFile()) return { skipped: 'not a regular file' }
    if (info.size > max) return { skipped: `larger than ${max} bytes` }
    const size = info.size
    // One byte past the size seen, so a file that grew since the check is caught.
    const buffer = Buffer.alloc(size + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
    }
    if (length > size) return { skipped: 'changed while it was read' }
    return { bytes: buffer.subarray(0, length) }
  } catch (err) {
    return { skipped: message(err) }
  } finally {
    await handle.close()
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
