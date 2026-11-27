import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'

import type { FileContent } from '../types.ts'

export const DEFAULT_MAX_BYTES = 2_000_000

/** Git's own test: a NUL in the first 8000 bytes. */
function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0)
}

export function contentOf(buf: Buffer): FileContent {
  return isBinary(buf)
    ? { kind: 'binary', bytes: buf.length }
    : { kind: 'text', text: buf.toString('utf8') }
}

/**
 * Reads the file at `path` under `root`. A symlink reads as its target path,
 * which is what git stores for it; anything that is not a file, or cannot be
 * read, is `missing`.
 */
export function readFile(root: string, path: string, maxBytes = DEFAULT_MAX_BYTES): FileContent {
  const file = join(root, path)
  try {
    const stat = lstatSync(file)
    if (stat.isSymbolicLink()) return { kind: 'text', text: readlinkSync(file) }
    if (!stat.isFile()) return { kind: 'missing' }
    if (stat.size > maxBytes) return { kind: 'too-large', bytes: stat.size }
    return contentOf(readFileSync(file))
  } catch {
    return { kind: 'missing' }
  }
}

/** Reads files under `root` by their paths relative to it; see {@link readFile}. */
export function readFiles(
  root: string,
  paths: readonly string[],
  maxBytes = DEFAULT_MAX_BYTES,
): Map<string, FileContent> {
  return new Map(paths.map((path) => [path, readFile(root, path, maxBytes)]))
}
