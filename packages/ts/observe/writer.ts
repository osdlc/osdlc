/**
 * File mechanics for a log: the append-only JSONL writer every stream uses
 * and its tolerant reader. No redaction happens here; a caller that
 * stores content redacts it before calling {@link appendJsonl}.
 */

import {
  closeSync,
  mkdirSync,
  fstatSync,
  fsyncSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'

/** How {@link appendJsonl} treats a line. */
export interface AppendOptions {
  /**
   * `fsync` before closing (default `true`). A record that must survive an OS
   * crash (a session's lifecycle events) keeps it; a high-rate line that is
   * only a trace (a hook's activity, a journal op line) passes `false`: the
   * process dying still leaves the whole line in the page cache, and only a
   * power loss can lose the last few, which the log tolerates.
   */
  sync?: boolean
}

/**
 * Append `obj` to `path` as one JSON line. The line is written with a single
 * `write` on an `O_APPEND` descriptor (optionally synced, see
 * {@link AppendOptions.sync}), so a crash leaves either the whole line or a
 * torn tail that {@link parseJsonl} drops. Creates the directory chain.
 * Appenders stay safe against each other only while a line is written in one
 * `write`, which the writers keep by convention: content over a field's inline
 * limit is clipped or stored in a blob the line names, so a line stays small.
 * Nothing here enforces a length. A new file is created with mode 0600.
 *
 * @throws The file system's error when the directory or file cannot be created
 * or written.
 */
export function appendJsonl(path: string, obj: unknown, options: AppendOptions = {}): void {
  mkdirSync(dirname(path), { recursive: true })
  const line = `${JSON.stringify(obj)}\n`
  // Owner-only on creation, whatever the umask: lines can carry (redacted) prompts and paths.
  // `a+` so the last byte can be read through the same descriptor the append uses.
  const fd = openSync(path, 'a+', 0o600)
  try {
    // A crash can leave a torn last line; start on a fresh line so this one is
    // not glued onto the fragment (the reader drops the fragment, not this line).
    const bytes = Buffer.from(endsWithNewline(fd) ? line : `\n${line}`, 'utf-8')
    // One write in practice; the loop covers a short write so a line is never split.
    for (let off = 0; off < bytes.length;) off += writeSync(fd, bytes, off)
    if (options.sync !== false) fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function endsWithNewline(fd: number): boolean {
  const size = fstatSync(fd).size
  if (size === 0) return true
  const last = Buffer.alloc(1)
  readSync(fd, last, 0, 1, size - 1)
  return last[0] === 0x0a
}

/**
 * The JSON values in `text`, one per line, in order. A final line with no
 * newline is a torn write and is dropped; a complete line that is not JSON is
 * skipped.
 */
export function parseJsonl(text: string): unknown[] {
  return parseJsonlLines(text).values.map((p) => p.value)
}

/**
 * Internal: not exported from the package entry.
 *
 * {@link parseJsonl} with each value's 0-based physical line number (blank and
 * unparsable lines count, so a line keeps its number however the file around it
 * is filtered), and the number of complete lines `text` holds.
 */
export function parseJsonlLines(text: string): {
  values: { value: unknown; line: number }[]
  lineCount: number
} {
  const lines = text.split('\n')
  lines.pop() // the text after the last newline: empty, or a torn line
  const values: { value: unknown; line: number }[] = []
  lines.forEach((raw, line) => {
    if (raw === '') return
    try {
      values.push({ value: JSON.parse(raw), line })
    } catch {
      // a complete line that is not JSON is skipped
    }
  })
  return { values, lineCount: lines.length }
}

/**
 * {@link parseJsonl} over a file; `[]` when it does not exist (or is removed
 * mid-read).
 *
 * @throws The file system's error for any failure other than a missing file.
 */
export function readJsonl(path: string): unknown[] {
  try {
    return parseJsonl(readFileSync(path, 'utf-8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

/** What {@link readJsonlFrom} found after an offset. */
export interface JsonlTail {
  /** The JSON values on the complete lines after the offset, in order. */
  values: unknown[]
  /** The 0-based line of each value within the bytes read (not the file), parallel to `values`. */
  lines: number[]
  /** How many complete lines (blank and unparsable ones too) the bytes read held. */
  lineCount: number
  /** Byte offset just past the last complete line read; pass it to the next call. */
  offset: number
}

/**
 * The JSON values appended to `path` after byte `offset`, reading only those
 * bytes (a poller does not reread the whole file). A final line with no
 * newline is a torn or in-flight write: it is left unread and the returned
 * offset stops before it, so the next call sees it whole. A complete line
 * that is not JSON is skipped. A missing file reads nothing and keeps `offset`;
 * an `offset` past the end (the file was truncated or replaced) restarts from 0.
 */
export function readJsonlFrom(path: string, offset: number): JsonlTail {
  let fd: number
  try {
    fd = openSync(path, 'r')
  } catch {
    return { values: [], lines: [], lineCount: 0, offset }
  }
  try {
    const size = fstatSync(fd).size
    if (offset > size) offset = 0
    if (offset === size) return { values: [], lines: [], lineCount: 0, offset }
    const buf = Buffer.alloc(size - offset)
    let read = 0
    while (read < buf.length) {
      const n = readSync(fd, buf, read, buf.length - read, offset + read)
      if (n === 0) break
      read += n
    }
    const end = buf.subarray(0, read).lastIndexOf(0x0a)
    if (end === -1) return { values: [], lines: [], lineCount: 0, offset }
    const parsed = parseJsonlLines(buf.subarray(0, end + 1).toString('utf-8'))
    return {
      values: parsed.values.map((p) => p.value),
      lines: parsed.values.map((p) => p.line),
      lineCount: parsed.lineCount,
      offset: offset + end + 1,
    }
  } finally {
    closeSync(fd)
  }
}

/** The byte size of `path`, or 0 when it does not exist: the baseline offset to tail from. */
export function jsonlSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}
