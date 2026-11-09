/**
 * The one place the package opens or creates a lock file. Every read of a lock,
 * marker or release name goes through {@link inspectLock}, which opens the path
 * without following a symlink and without blocking, then checks on that same
 * descriptor that it is a regular file before reading a byte. A claim's temp
 * file is created exclusively, with its mode set before any content is written.
 */

import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'

/** What sits at a lock path that is not a lock file. */
export type NotALockKind = 'symlink' | 'directory' | 'other'

/**
 * Something other than a regular file is at the lock path: a symlink, a
 * directory (such as one left by an older mkdir-based lock), a FIFO, a socket
 * or a device. It cannot be a lock this package wrote, and it is never opened
 * for reading, so a symlink's target is not read and a FIFO cannot block.
 */
export class NotALockError extends Error {
  /** The path that holds something other than a lock file. */
  readonly path: string
  /** What is there: `symlink`, `directory`, or `other` for a FIFO, socket or device. */
  readonly kind: NotALockKind

  constructor(path: string, kind: NotALockKind) {
    super(`not a lock file: ${path} is ${kind === 'other' ? 'not a regular file' : `a ${kind}`}`)
    this.name = 'NotALockError'
    this.path = path
    this.kind = kind
  }
}

/** A lock file as read: its text, its mtime and its permission bits, all from one descriptor. */
export interface LockFile {
  raw: string
  mtimeMs: number
  /** Permission bits (`mode & 0o7777`). */
  mode: number
}

// Absent on Windows, where the open follows links as before.
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0
const NO_BLOCK = constants.O_NONBLOCK ?? 0
const READ_FLAGS = constants.O_RDONLY | NO_FOLLOW | NO_BLOCK

/** Open `path` for reading, refusing anything but a regular file. Errors other than "not a file" are thrown as they come. */
function openRegular(path: string): number {
  let fd: number
  try {
    fd = openSync(path, READ_FLAGS)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    // O_NOFOLLOW on a symlink fails with ELOOP (EMLINK on FreeBSD). ELOOP also
    // means a loop in a parent directory, so check the last component itself.
    if ((code === 'ELOOP' || code === 'EMLINK') && isSymlink(path)) {
      throw new NotALockError(path, 'symlink')
    }
    // A UNIX socket cannot be opened as a file.
    if (code === 'ENXIO') throw new NotALockError(path, 'other')
    throw err
  }
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new NotALockError(path, stat.isDirectory() ? 'directory' : 'other')
  } catch (err) {
    closeSync(fd)
    throw err
  }
  return fd
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Open the lock at `path`, read it, and hand `use` the result and the open
 * descriptor, so anything `use` does to the file acts on the inode that was
 * read. Throws {@link NotALockError} for anything but a regular file, and the
 * open error (`ENOENT`, `EACCES`) otherwise.
 */
export function inspectLock<T>(path: string, use: (file: LockFile, fd: number) => T): T {
  const fd = openRegular(path)
  try {
    const stat = fstatSync(fd)
    const raw = readFileSync(fd, 'utf-8')
    return use({ raw, mtimeMs: stat.mtimeMs, mode: stat.mode & 0o7777 }, fd)
  } finally {
    closeSync(fd)
  }
}

/** Read the lock at `path`: {@link inspectLock} without the descriptor. */
export function readLock(path: string): LockFile {
  return inspectLock(path, (file) => file)
}

/**
 * Create `path` exclusively and write `data` to it. With `mode`, the file is
 * created owner-only and set to exactly `mode` before the content is written,
 * so the umask does not apply and the content is never more readable than
 * asked. Without it, the file gets `0o666` less the umask, as any new file does.
 */
export function createLockFile(path: string, data: string, mode?: number): void {
  const fd = openSync(path, 'wx', mode === undefined ? 0o666 : 0o600)
  try {
    if (mode !== undefined) fchmodSync(fd, mode)
    writeFileSync(fd, data)
  } catch (err) {
    closeSync(fd)
    rmSync(path, { force: true })
    throw err
  }
  closeSync(fd)
}
