/**
 * Small private helpers the hosts share. Nothing here is exported from the
 * package entry.
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import { shellJoin } from '@osdlc/command-seam'
import { which as whichOn } from '@osdlc/detect-harness'
import { atomicWrite } from '@osdlc/etag-write'
import { nodeGuard } from '@osdlc/path-guard/node'

/** A plain object (not null, not an array). */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** `v` when it is a string, else null. */
export function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/** A non-empty string, else null. */
export function nonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

/** `JSON.parse(text)`, or null when it is not valid JSON. */
export function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** The parsed JSON in `path`, or null when it is missing, unreadable or not JSON. */
export function readJsonOrNull(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

/** Write `data` as JSON to `path` atomically (temp file, fsync, rename). */
export function writeJsonAtomic(path: string, data: unknown): void {
  atomicWrite(path, JSON.stringify(data, null, 2))
}

/** Create `dir` and its parents; an existing directory is fine. */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

/** Block the thread for `ms` milliseconds. For sync code that backs off between polls. */
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * True when `pid` names a running process. Signal 0 delivers nothing; it only
 * asks the OS whether the process exists. `EPERM` means it exists but belongs
 * to another user, so it is alive. Pids are recycled, so a reused pid reads as
 * alive.
 */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** `bin`'s path on `PATH` (PATHEXT-aware on Windows), or null. */
export function which(bin: string): string | null {
  return whichOn(bin, process.env)
}

/**
 * True when this module runs inside a `bun build --compile` standalone binary,
 * read from a module URL (pass `import.meta.url`).
 */
export function isCompiledBinary(metaUrl: string): boolean {
  return metaUrl.startsWith('file:///$bunfs/') || /^file:\/\/\/[A-Za-z]:\/~BUN\//.test(metaUrl)
}

/**
 * `argv` as one command line for the platform's shell: POSIX `sh` quoting, or
 * a PowerShell call (`& 'a' 'b'`) on Windows, where a terminal opens PowerShell.
 *
 * Windows limits (not run on Windows): the quoting is right for PowerShell's own
 * parser, but Windows PowerShell 5.1 passes an argument containing `"` to a
 * native program without escaping it, so the program sees it split or with the
 * quotes gone, and it drops an empty argument. PowerShell 7.3+ passes both
 * intact. Run under `powershell -Command`, the program's exit code reaches the
 * caller only as 0 or 1.
 */
export function commandString(
  argv: string[],
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'win32') return shellJoin(argv)
  return `& ${argv.map(powershellLiteral).join(' ')}`
}

/** `word` as a single-quoted PowerShell literal (see {@link commandString}). */
export function powershellLiteral(word: string): string {
  return `'${word.replace(/['‘’‚‛]/g, (q) => q + q)}'`
}

/** `p` made absolute against the cwd. */
function absolute(p: string): string {
  return isAbsolute(p) && process.platform !== 'win32' ? p : resolve(p)
}

/** The real path of `p`: symlinks in the part that exists resolved, the rest re-attached. */
export function realResolve(p: string): string {
  return nodeGuard.realPath(absolute(p))
}

/** Whether `child` is `parent` or inside it, comparing real paths. */
export function isWithin(child: string, parent: string): boolean {
  return nodeGuard.contains(absolute(parent), absolute(child))
}
