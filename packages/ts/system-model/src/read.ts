/**
 * Bounded reads of a repository's files. A repository is untrusted input, so
 * a read must not follow a link out of the tree, block on a device or a pipe,
 * or load a file of any size.
 */

import { lstat, open, realpath, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'

/** The largest file a runner or detection reads: 4 MiB. A larger file is skipped. */
export const MAX_READ_BYTES = 4 * 1024 * 1024

/** A file's text, or why it was not read. */
export type BoundedRead = { text: string } | { skipped: string; missing?: true }

/**
 * Read `relPath` under `root` as UTF-8, or say why not.
 *
 * Skipped: a symlink whose target is outside `root`, anything that is not a
 * regular file (a directory, a device such as `/dev/zero`, a pipe), and a file
 * larger than `max` bytes. A missing file is `missing: true`.
 */
export async function readBounded(
  root: string,
  relPath: string,
  max: number = MAX_READ_BYTES,
): Promise<BoundedRead> {
  const abs = join(root, relPath)
  let target = abs
  let size: number
  try {
    const link = await lstat(abs)
    if (link.isSymbolicLink()) {
      target = await realpath(abs)
      const realRoot = await realpath(root)
      if (target !== realRoot && !target.startsWith(realRoot + sep)) {
        return { skipped: 'a symlink that leaves the repository' }
      }
    }
    // Checked by path before opening, because opening a pipe blocks.
    const info = await stat(target)
    if (!info.isFile()) return { skipped: 'not a regular file' }
    if (info.size > max) return { skipped: `larger than ${max} bytes` }
    size = info.size
  } catch (err) {
    return { skipped: message(err), missing: true }
  }

  let handle
  try {
    handle = await open(target, 'r')
  } catch (err) {
    return { skipped: message(err) }
  }
  try {
    // One byte past the size seen, so a file that grew since the check is caught.
    const buffer = Buffer.alloc(Math.min(size, max) + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
    }
    if (length > size) return { skipped: 'changed while it was read' }
    return { text: buffer.subarray(0, length).toString('utf-8') }
  } catch (err) {
    return { skipped: message(err) }
  } finally {
    await handle.close()
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
