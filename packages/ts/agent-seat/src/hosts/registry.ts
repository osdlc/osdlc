/**
 * The shared reader for a host's registry: `<runtime>/hosts/<name>/*.json`,
 * one file per running IDE or window, written by the extension or plugin that
 * owns it. `<runtime>` is the caller's runtime directory (`runtimeDir`); the
 * package picks none of its own, because the IDE companions must write to the
 * same place.
 */

import {
  closeSync,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  type Stats,
} from 'node:fs'
import { join } from 'node:path'

import { isWithin, parseJsonOrNull, realResolve } from '../util.ts'

/** Where host `name` keeps its state under `runtimeDir`: `<runtimeDir>/hosts/<name>`. */
export function hostRegistryDir(runtimeDir: string, name: string): string {
  return join(runtimeDir, 'hosts', name)
}

/**
 * Where a stateful host keeps its files. Give one of the two: `registryDir` is
 * used as is; otherwise the host uses `<runtimeDir>/hosts/<name>`.
 */
export type HostStateOptions =
  | {
      /** The caller's runtime directory; the host uses `<runtimeDir>/hosts/<name>`. */
      runtimeDir: string
      /** The host's own directory, used as is. Wins over `runtimeDir`. */
      registryDir?: string | undefined
    }
  | {
      runtimeDir?: string | undefined
      /** The host's own directory, used as is. */
      registryDir: string
    }

/** Host `name`'s state directory under `opts`. */
export function registryDirOf(name: string, opts: HostStateOptions): string {
  return opts.registryDir ?? hostRegistryDir(opts.runtimeDir!, name)
}

/** How {@link readHostRegistry} decides whom to trust; injectable for tests. */
export interface RegistryTrustOptions {
  /** The uid entries must belong to; null skips the check (Windows). Default `process.getuid()`. */
  uid?: number | null | undefined
  /** Told why an entry or the whole directory was skipped as untrusted. */
  onSkip?: ((reason: string) => void) | undefined
}

/** Why `stats` cannot be trusted under `uid`: owned by another user, or writable by group or others. */
function untrusted(stats: Stats, uid: number): string | null {
  if (stats.uid !== uid) return `is owned by uid ${stats.uid}, not ${uid}`
  if ((stats.mode & 0o022) !== 0) return 'is writable by group or others'
  return null
}

/**
 * Entries in `dir` that `parse` accepts and whose process is alive. A missing
 * directory, an unreadable or malformed file, and a dead pid are all skipped.
 *
 * An entry carries an endpoint and a token, so a planted one would receive
 * every session's argv and sent text. On POSIX the whole directory is skipped
 * unless it belongs to the current user and is not group- or world-writable,
 * and so is each file; `opts.onSkip` hears why. Windows has no uid to check.
 */
export function readHostRegistry<T extends { pid: number }>(
  dir: string,
  parse: (raw: unknown) => T | null,
  alive: (pid: number) => boolean,
  opts: RegistryTrustOptions = {},
): T[] {
  const uid = opts.uid === undefined ? (process.getuid?.() ?? null) : opts.uid
  let names: string[]
  try {
    if (uid !== null) {
      const why = untrusted(statSync(dir), uid)
      if (why !== null) {
        opts.onSkip?.(`registry directory ${dir} ${why}`)
        return []
      }
    }
    names = readdirSync(dir).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const entries: T[] = []
  for (const name of names) {
    const path = join(dir, name)
    let text: string
    let fd: number | null = null
    try {
      // Checked on the open descriptor, so the file cannot be swapped between check and read.
      fd = openSync(path, 'r')
      const why = uid === null ? null : untrusted(fstatSync(fd), uid)
      if (why !== null) {
        opts.onSkip?.(`registry file ${path} ${why}`)
        continue
      }
      text = readFileSync(fd, 'utf8')
    } catch {
      continue
    } finally {
      if (fd !== null) closeSync(fd)
    }
    const entry = parse(parseJsonOrNull(text))
    if (entry !== null && alive(entry.pid)) entries.push(entry)
  }
  return entries
}

/**
 * The candidate with the deepest folder containing `cwd` (depth = length of the
 * real path), the newest `startedAt` winning a tie, then the earliest in list
 * order. Null when no folder contains `cwd`. How both IDE hosts pick a window.
 */
export function deepestContaining<T>(
  cwd: string,
  candidates: readonly T[],
  folders: (c: T) => readonly string[],
  startedAt: (c: T) => string,
): T | null {
  let best: { c: T; depth: number } | null = null
  for (const c of candidates) {
    for (const folder of folders(c)) {
      if (!isWithin(cwd, folder)) continue
      const depth = realResolve(folder).length
      if (
        best === null ||
        depth > best.depth ||
        (depth === best.depth && startedAt(c) > startedAt(best.c))
      ) {
        best = { c, depth }
      }
    }
  }
  return best?.c ?? null
}
