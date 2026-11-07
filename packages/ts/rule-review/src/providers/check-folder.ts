/**
 * The check-folder provider: a directory of numbered check files.
 *
 * `10-lint` is a script check, `20-review.md` is a prompt check. The numeric
 * prefix is the run order. Anything that is not a check is reported with the
 * reason it was skipped, never dropped silently.
 */
import { lstat, open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** `<order>-<name>`; the name may carry an extension. */
const CHECK_NAME_RE = /^(\d+)-([a-z0-9][a-z0-9._-]*)$/

/**
 * Seconds a script may run when it declares no `# timeout:` header.
 *
 * @experimental
 */
export const DEFAULT_TIMEOUT_SEC = 600

export const PROMPT_UNSUPPORTED = 'prompt checks not yet supported'

export interface ParsedCheckName {
  order: number
  name: string
}

/**
 * An executable `<number>-<name>` file in a check folder.
 *
 * @experimental
 */
export interface ScriptCheck {
  kind: 'script'
  /** File name inside the folder. */
  entry: string
  /** Absolute path of the file. */
  path: string
  order: number
  name: string
  timeoutSec: number
  /** Globs from `# applies_to:` headers; `['**']` when the script declares none. */
  scope: string[]
}

/**
 * A `<number>-<name>.md` file in a check folder. Listed, and reported as skipped: prompt checks do not run yet.
 *
 * @experimental
 */
export interface PromptCheck {
  kind: 'prompt'
  entry: string
  path: string
  order: number
  name: string
}

/**
 * One check in a folder.
 *
 * @experimental
 */
export type Check = ScriptCheck | PromptCheck

/**
 * A folder entry that is not a check, and why.
 *
 * @experimental
 */
export interface SkippedEntry {
  entry: string
  reason: string
}

/**
 * A check folder, read: its checks in run order, and the entries skipped.
 *
 * @experimental
 */
export interface CheckFolder {
  /** Absolute path of the folder. */
  dir: string
  /** In run order. */
  checks: Check[]
  skipped: SkippedEntry[]
}

/** Split `<order>-<name>`; `null` when the file name is not a check name. */
export function parseCheckName(entry: string): ParsedCheckName | null {
  const m = CHECK_NAME_RE.exec(entry)
  if (m === null) return null
  return { order: Number.parseInt(m[1]!, 10), name: m[2]! }
}

/** Numeric prefix first, then name, so `9-a` runs before `10-a`. */
export function compareChecks(
  a: { order: number; name: string; entry: string },
  b: { order: number; name: string; entry: string },
): number {
  if (a.order !== b.order) return a.order - b.order
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  return a.entry < b.entry ? -1 : a.entry > b.entry ? 1 : 0
}

/**
 * The `# timeout: <seconds>` value from a script's leading comment block, or
 * `undefined` when absent. Reading stops at the first line of code.
 */
export function parseTimeoutHeader(source: string): number | undefined {
  for (const line of source.split('\n')) {
    const text = line.trim()
    if (text === '') continue
    if (!text.startsWith('#')) return undefined
    const m = /^#\s*timeout:\s*(\d+(?:\.\d+)?)\s*$/.exec(text)
    if (m !== null) {
      const sec = Number.parseFloat(m[1]!)
      if (sec > 0) return sec
    }
  }
  return undefined
}

/** The scope of a script that declares no `# applies_to:` header. */
const DEFAULT_SCOPE = ['**']

/**
 * The `# applies_to: <glob>` values from a script's leading comment block, in
 * order. Reading stops at the first line of code; no header gives `['**']`.
 */
export function parseAppliesToHeaders(source: string): string[] {
  const globs: string[] = []
  for (const line of source.split('\n')) {
    const text = line.trim()
    if (text === '') continue
    if (!text.startsWith('#')) break
    const m = /^#\s*applies_to:\s*(\S.*?)\s*$/.exec(text)
    if (m !== null) globs.push(m[1]!)
  }
  return globs.length === 0 ? [...DEFAULT_SCOPE] : globs
}

/**
 * Why a plain file name is not a check, or `null` when it is one. Directories
 * and the executable bit need the filesystem and are handled by
 * {@link readCheckFolder}.
 */
export function nameSkipReason(entry: string): string | null {
  if (entry.startsWith('.')) return "leading '.'"
  if (entry.startsWith('_')) return "leading '_'"
  if (entry.endsWith('.disabled')) return 'disabled'
  if (parseCheckName(entry) !== null) return null
  const prefix = /^\d+/.exec(entry)
  if (prefix === null) return 'no numeric prefix'
  const rest = entry.slice(prefix[0].length)
  if (!rest.startsWith('-')) return `no '-' after the number prefix`
  if (rest === '-') return 'no name after the number prefix'
  return "name after the number prefix must start with a-z or 0-9 and use only a-z, 0-9, '.', '_', '-'"
}

/**
 * Read `dir` and split its entries into checks and reasoned skips.
 *
 * @throws The `readdir` error when `dir` cannot be read.
 * @experimental
 */
export async function readCheckFolder(dir: string): Promise<CheckFolder> {
  const entries = await readdir(dir)
  const checks: Check[] = []
  const skipped: SkippedEntry[] = []

  for (const entry of entries.sort()) {
    const path = join(dir, entry)
    let info
    try {
      info = await stat(path)
    } catch (err) {
      skipped.push({ entry, reason: await statFailure(path, err) })
      continue
    }
    if (info.isDirectory()) {
      skipped.push({ entry, reason: 'directory' })
      continue
    }
    const byName = nameSkipReason(entry)
    if (byName !== null) {
      skipped.push({ entry, reason: byName })
      continue
    }
    const { order, name } = parseCheckName(entry)!
    if (entry.endsWith('.md')) {
      checks.push({ kind: 'prompt', entry, path, order, name })
      continue
    }
    if ((info.mode & 0o111) === 0) {
      skipped.push({ entry, reason: 'not executable' })
      continue
    }
    let header
    try {
      header = await readHeader(path)
    } catch (err) {
      skipped.push({ entry, reason: `unreadable (${errCode(err)})` })
      continue
    }
    const timeoutSec = parseTimeoutHeader(header) ?? DEFAULT_TIMEOUT_SEC
    const scope = parseAppliesToHeaders(header)
    checks.push({ kind: 'script', entry, path, order, name, timeoutSec, scope })
  }

  checks.sort(compareChecks)
  return { dir, checks, skipped }
}

/** Bytes of a script read for its headers; enough to cover its comment block. */
const HEADER_BYTES = 4096

/** A script's leading text, at most {@link HEADER_BYTES}, so a large file is never read whole. */
async function readHeader(path: string): Promise<string> {
  const file = await open(path, 'r')
  try {
    const buf = Buffer.alloc(HEADER_BYTES)
    const { bytesRead } = await file.read(buf, 0, HEADER_BYTES, 0)
    return buf.subarray(0, bytesRead).toString('utf8')
  } finally {
    await file.close()
  }
}

function errCode(err: unknown): string {
  return (err as NodeJS.ErrnoException).code ?? String(err)
}

/** Why `stat` failed; a symlink whose target is missing gets its own reason. */
async function statFailure(path: string, err: unknown): Promise<string> {
  const isLink = await lstat(path).then(
    (l) => l.isSymbolicLink(),
    () => false,
  )
  return isLink ? `broken symlink (${errCode(err)})` : `unreadable (${errCode(err)})`
}
