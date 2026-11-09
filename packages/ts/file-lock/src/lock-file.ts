/**
 * The one place the package opens or creates a lock file. Every read of a lock,
 * marker or release name goes through {@link inspectLock}. It checks with
 * `lstat` that the path is a regular file before opening it, so a symlink is
 * never followed and a FIFO or device is never opened. It then opens without
 * following a symlink or blocking, and checks the descriptor again, in case the
 * path was replaced between the two. A claim's temp file is created
 * exclusively, with its mode set before any content is written.
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
  type Stats,
  writeFileSync,
} from 'node:fs'

/** What sits at a lock path that is not a lock file. */
export type NotALockKind = 'symlink' | 'directory' | 'other'

/**
 * Something other than a regular file is at the lock path: a symlink, a
 * directory (such as one left by an older mkdir-based lock), a FIFO, a socket
 * or a device. It cannot be a lock this package wrote. It is never read, a
 * symlink is never followed, and a FIFO or device is never opened.
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

// O_NOFOLLOW and O_NONBLOCK are absent on Windows, where the lstat check
// alone stands between the open and a symlink swapped in after it.
const READ_FLAGS =
  constants.O_RDONLY |
  (constants.O_NOFOLLOW ?? 0) |
  (constants.O_NONBLOCK ?? 0) |
  (constants.O_NOCTTY ?? 0)

function kindOf(stat: Stats): NotALockKind {
  if (stat.isSymbolicLink()) return 'symlink'
  return stat.isDirectory() ? 'directory' : 'other'
}

/**
 * The stat of the regular file at `path`, read without following a symlink.
 * Throws {@link NotALockError} for anything else there, and the `lstat` error
 * (`ENOENT`) when nothing is.
 */
export function lstatRegular(path: string): Stats {
  const stat = lstatSync(path)
  if (!stat.isFile()) throw new NotALockError(path, kindOf(stat))
  return stat
}

/** Open the regular file at `path` for reading. Returns the descriptor and its stat. */
function openRegular(path: string): { fd: number; stat: Stats } {
  for (let attempt = 0; ; attempt++) {
    lstatRegular(path)
    let fd: number
    try {
      fd = openSync(path, READ_FLAGS)
    } catch (err) {
      // Replaced between the lstat and the open. Systems report a symlink met by
      // O_NOFOLLOW, or a socket, with different codes (ELOOP, EMLINK, EFTYPE,
      // ENXIO, EOPNOTSUPP), so look at the path again rather than trust the code.
      if (attempt === 0 && (err as NodeJS.ErrnoException).code !== 'ENOENT') continue
      throw err
    }
    let stat: Stats
    try {
      stat = fstatSync(fd)
      if (!stat.isFile()) throw new NotALockError(path, kindOf(stat))
    } catch (err) {
      closeSync(fd)
      throw err
    }
    return { fd, stat }
  }
}

/**
 * Open the lock at `path`, read it, and hand `use` the result and the open
 * descriptor, so anything `use` does to the file acts on the inode that was
 * read. Throws {@link NotALockError} for anything but a regular file, and the
 * open error (`ENOENT`, `EACCES`) otherwise.
 */
export function inspectLock<T>(path: string, use: (file: LockFile, fd: number) => T): T {
  const { fd, stat } = openRegular(path)
  try {
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
 * On any failure, closing included, the file is removed.
 */
export function createLockFile(path: string, data: string, mode?: number): void {
  if (mode !== undefined) checkMode(mode)
  const fd = openSync(path, 'wx', mode === undefined ? 0o666 : 0o600)
  try {
    try {
      if (mode !== undefined) fchmodSync(fd, mode)
      writeFileSync(fd, data)
    } finally {
      closeSync(fd)
    }
  } catch (err) {
    rmSync(path, { force: true })
    throw err
  }
}

/** A lock its owner cannot read could never be checked, touched or released, so `mode` must include `0o400`. */
function checkMode(mode: number): void {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777 || (mode & 0o400) === 0) {
    throw new RangeError(
      `mode ${String(mode)} is not a file mode the lock's owner can read: use permission bits from 0 to 0o7777 that include 0o400`,
    )
  }
}
