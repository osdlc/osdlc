import { randomBytes } from 'node:crypto'
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Write `data` as JSON to `path` through a fsynced temp file and a rename, so
 * a reader never sees half a file. The temp file sits beside `path` because a
 * rename across filesystems is not atomic.
 */
export function writeJsonAtomic(path: string, data: unknown): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`
  try {
    const fd = openSync(tmp, 'wx')
    try {
      writeSync(fd, `${JSON.stringify(data, null, 2)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, path)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
  // A platform that refuses a directory fsync skips it; the file is already durable.
  let dfd: number | undefined
  try {
    dfd = openSync(dir, 'r')
    fsyncSync(dfd)
  } catch {
  } finally {
    if (dfd !== undefined) closeSync(dfd)
  }
}
