/**
 * Atomic file writes, sha256 etags and compare-and-swap. The TypeScript twin
 * of the `etag-write` Rust crate: the same write sequence, etag format and
 * compare-and-swap rules.
 */

import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  fchmodSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/** Bytes to write. A string is written, and hashed, as UTF-8. */
export type WriteData = string | Uint8Array

/** Options for {@link atomicWrite}, {@link atomicWriteAsync}, {@link writeCas} and {@link writeIfChanged}. */
export interface AtomicWriteOptions {
  /**
   * Exact permission bits of the written file, applied whatever the umask.
   * Without it, an overwrite keeps the old file's permission bits and a new
   * file gets `0o666` less the umask.
   */
  mode?: number | undefined
}

/** Why {@link writeCas} refused a write. */
export type WriteConflictReason = 'changed' | 'exists-without-etag'

/**
 * {@link writeCas} refused the write. `changed`: the file's etag is not the
 * one sent. `exists-without-etag`: the file exists and no etag was sent.
 */
export class WriteConflictError extends Error {
  /** The path that was not written. */
  readonly path: string
  /** Why the write was refused. */
  readonly reason: WriteConflictReason

  constructor(path: string, reason: WriteConflictReason) {
    super(
      reason === 'changed'
        ? `${path} changed on disk since it was read`
        : `${path} exists — send its etag to overwrite`,
    )
    this.name = 'WriteConflictError'
    this.path = path
    this.reason = reason
  }
}

const toBytes = (data: WriteData): Buffer =>
  typeof data === 'string'
    ? Buffer.from(data, 'utf8')
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength)

/** Lowercase hex sha256 of `data`. A string hashes as UTF-8. */
export function etag(data: WriteData): string {
  return createHash('sha256').update(toBytes(data)).digest('hex')
}

/**
 * The etag of the file at `path`, or `null` when it does not exist.
 *
 * @throws any read error other than `ENOENT`.
 */
export function etagOfFile(path: string): string | null {
  const bytes = readOrNull(path)
  return bytes === null ? null : etag(bytes)
}

/** An unreadable file still exists; treating it as absent would allow a blind overwrite. */
function readOrNull(path: string): Buffer | null {
  try {
    return readFileSync(path)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/**
 * A fresh name beside `path`, so the rename never crosses a filesystem. Unique
 * per write: two writers sharing a temp name would rename it out from under
 * each other.
 */
function tempPath(path: string): string {
  return join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`)
}

/**
 * The mode a write gives the file: the caller's, else the old file's
 * permission bits. setuid, setgid and sticky are dropped, as in the crate,
 * because the new file has a new owner. Returns `undefined` (a new file's
 * mode) when the target is missing, is not a regular file, or cannot be
 * stat'ed. Any real problem with the path then surfaces from the write.
 */
function keptMode(path: string, mode: number | undefined): number | undefined {
  if (mode !== undefined) return mode
  try {
    const st = statSync(path)
    return st.isFile() ? st.mode & 0o777 : undefined
  } catch {
    return undefined
  }
}

async function keptModeAsync(path: string, mode: number | undefined): Promise<number | undefined> {
  if (mode !== undefined) return mode
  try {
    const st = await stat(path)
    return st.isFile() ? st.mode & 0o777 : undefined
  } catch {
    return undefined
  }
}

/** Fsyncs the directory so the rename survives a crash. Skipped where the platform refuses it. */
function syncDir(dir: string): void {
  let fd: number | undefined
  try {
    fd = openSync(dir, 'r')
    fsyncSync(fd)
  } catch {
    /* best-effort */
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

async function syncDirAsync(dir: string): Promise<void> {
  const fh = await open(dir, 'r').catch(() => null)
  if (fh === null) return
  try {
    await fh.sync()
  } catch {
    /* best-effort */
  } finally {
    await fh.close()
  }
}

/**
 * Replace `path` with `data` so a reader or a crash sees the old file or the
 * new one, never part of either. Creates parent directories. The temp file is
 * fsynced before the rename and removed on any failure. An overwrite keeps the
 * old file's permission bits unless `opts.mode` is set.
 */
export function atomicWrite(path: string, data: WriteData, opts: AtomicWriteOptions = {}): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const bytes = toBytes(data)
  const mode = keptMode(path, opts.mode)
  const tmp = tempPath(path)
  try {
    const fd = openSync(tmp, 'wx', mode ?? 0o666)
    try {
      if (mode !== undefined) fchmodSync(fd, mode)
      for (let off = 0; off < bytes.length;) off += writeSync(fd, bytes, off)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, path)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
  syncDir(dir)
}

/** {@link atomicWrite} without blocking the event loop. */
export async function atomicWriteAsync(
  path: string,
  data: WriteData,
  opts: AtomicWriteOptions = {},
): Promise<void> {
  const dir = dirname(path)
  await mkdir(dir, { recursive: true })
  const mode = await keptModeAsync(path, opts.mode)
  const tmp = tempPath(path)
  try {
    const fh = await open(tmp, 'wx', mode ?? 0o666)
    try {
      if (mode !== undefined) await fh.chmod(mode)
      await fh.writeFile(toBytes(data))
      await fh.sync()
    } finally {
      await fh.close()
    }
    await rename(tmp, path)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
  await syncDirAsync(dir)
}

/**
 * {@link atomicWrite} behind a compare-and-swap, with the crate's contract.
 * `expectedEtag` is the etag of the content the caller read, or `null` when it
 * read nothing. Returns the new etag. The check and the write are separate
 * steps, so a writer landing between them is overwritten.
 *
 * | on disk | etag supplied | result |
 * |---|---|---|
 * | exists | matches | write |
 * | exists | differs | `WriteConflictError`, reason `changed` |
 * | exists | none | `WriteConflictError`, reason `exists-without-etag` |
 * | absent | none | create |
 * | absent | some | create (the file was deleted since it was read) |
 *
 * An existing file with no etag is refused: that would be a blind write.
 *
 * A file that exists but cannot be read is not absent: its read error is thrown.
 *
 * @throws WriteConflictError per the table.
 */
export function writeCas(
  path: string,
  data: WriteData,
  expectedEtag: string | null,
  opts: AtomicWriteOptions = {},
): string {
  const current = readOrNull(path)
  if (current !== null) {
    if (expectedEtag === null) throw new WriteConflictError(path, 'exists-without-etag')
    if (etag(current) !== expectedEtag) throw new WriteConflictError(path, 'changed')
  }
  atomicWrite(path, data, opts)
  return etag(data)
}

/**
 * Write only when the content differs, so an identical write leaves mtime
 * alone and triggers no file watchers. Returns whether it wrote. `mode` applies
 * only to a write. An unchanged file keeps its permissions.
 */
export function writeIfChanged(
  path: string,
  data: WriteData,
  opts: AtomicWriteOptions = {},
): boolean {
  const existing = readOrNull(path)
  if (existing !== null && existing.equals(toBytes(data))) return false
  atomicWrite(path, data, opts)
  return true
}
