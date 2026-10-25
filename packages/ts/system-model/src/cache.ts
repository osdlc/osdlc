/**
 * Stored runner results: one file per (root, runner) under a directory the
 * caller names. This sits above `collect`, never inside it.
 *
 * Layout: `<dir>/reports/v<CACHE_FORMAT_VERSION>/<basename>-<hash>/<runner>.json`.
 * One file per runner, so each write is one atomic rename and cannot lose a
 * concurrent write for another runner. The format version is in the path and
 * in each file. A version bump leaves the old tree unused, and an old-version
 * entry that reaches the new path some other way is still rejected.
 *
 * A broken entry (missing, truncated, unparseable, old version) is a miss,
 * never an error. The fallback is always to probe.
 */

import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { atomicWriteAsync } from '@osdlc/etag-write'

import type { ProviderKind } from './contract.ts'
import type { Fingerprint } from './fingerprint.ts'
import type { RunnerReport } from './model.ts'

/** Bumped whenever a stored entry's shape changes, including `Task`'s shape. */
export const CACHE_FORMAT_VERSION = 5

/** How many probe durations are kept per entry. */
export const DURATION_WINDOW = 5

/**
 * A probe measured in a repo at or above this time is "slow" for that repo.
 *
 * Measured, never declared. The same runner is fast in a small repository and
 * slow in a large one, so a per-runner constant would be wrong for half its
 * users. What matters is how long it took in this repo.
 */
export const SLOW_PROBE_MS = 1500

/**
 * Maximum age for exec entries, whose fingerprint cannot see the merged inputs.
 *
 * An exec runner's fingerprint covers its markers, not the files its tool
 * merges (see `fingerprint.ts`). So a matching fingerprint is a good sign, not
 * a proof. Four hours limits how long such a change can go unnoticed, without
 * paying for a JVM start every few minutes.
 */
export const EXEC_MAX_AGE_MS = 4 * 60 * 60 * 1000

export interface CacheEntry {
  version: number
  /** The resolved absolute repository root this was probed against. */
  root: string
  runner: string
  kind: ProviderKind
  /** ISO timestamp of the probe. */
  takenAt: string
  /** Wall time of this probe alone. */
  probeMs: number
  /** Rolling window of recent probe durations, oldest first. */
  durations: number[]
  fingerprint: Fingerprint
  report: RunnerReport
  /** Whether the probe ran with execution allowed. A parse runner's answer can depend on it. */
  allowExec: boolean
  /** The `@osdlc/system-model` version that probed, since a runner's output changes between versions. */
  modelVersion: string
  /**
   * The tool's binary with symlinks resolved. Some installers put the version
   * in it (`.../just/1.40.0/bin/just`). `null` when it was not on the PATH.
   * Absent when the runner has no binary.
   */
  toolPath?: string | null | undefined
  /**
   * The resolved binary's size and mtime, so a binary replaced in place
   * (`~/.cargo/bin/just`) also reads as another tool. A version manager's
   * shim (proto, asdf, mise) does not change when the version it selects
   * does, so that upgrade is not seen. `null` when it cannot be read. Absent
   * when the runner has no binary.
   */
  toolStamp?: string | null | undefined
  /** Each binary the runner looked up through `ctx.which`, and what it found. */
  lookups?: Record<string, string | null> | undefined
}

/** This package's version, or `unknown` when its package.json cannot be read. */
export const MODEL_VERSION: string = readModelVersion()

function readModelVersion(): string {
  try {
    // `src/` and `dist/` are both one level below the package root.
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as {
      version?: unknown
    }
    return typeof pkg.version === 'string' ? pkg.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** A PATH lookup's result with symlinks resolved, or as given when it cannot be resolved. */
export function resolveToolPath(path: string | null): string | null {
  if (path === null) return null
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** A resolved binary's `size:mtimeMs`, or `null` when it cannot be read. */
export function toolStampOf(path: string | null): string | null {
  if (path === null) return null
  try {
    const info = statSync(path)
    return `${info.size}:${info.mtimeMs}`
  } catch {
    return null
  }
}

/** Where one (root, runner) entry lives under `dir`. */
export function entryPath(dir: string, root: string, runnerId: string): string {
  return join(dir, 'reports', `v${CACHE_FORMAT_VERSION}`, rootKey(root), `${runnerId}.json`)
}

/** `basename-hash`: the hash keeps same-named roots apart, and the name keeps `ls` readable. */
function rootKey(root: string): string {
  const digest = createHash('sha256').update(root).digest('hex').slice(0, 16)
  const raw = basename(root)
  const name = (raw === '' ? 'root' : raw).replace(/[^A-Za-z0-9._-]/g, '-')
  return `${name}-${digest}`
}

export async function readEntry(
  dir: string,
  root: string,
  runnerId: string,
): Promise<CacheEntry | null> {
  let text: string
  try {
    text = await readFile(entryPath(dir, root, runnerId), 'utf-8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const entry = parsed as CacheEntry
  if (entry.version !== CACHE_FORMAT_VERSION) return null
  // A foreign or hand-edited file with the right version but no usable report
  // is a miss too, so `undefined` never reaches a catalog's reports.
  const report = entry.report as Partial<CacheEntry['report']> | null | undefined
  if (
    typeof report !== 'object' ||
    report === null ||
    typeof report.runner !== 'string' ||
    !Array.isArray(report.tasks) ||
    !Array.isArray(report.diagnostics)
  ) {
    return null
  }
  return entry
}

/**
 * Store one entry, or refuse to.
 *
 * Two kinds of report are never stored. The check is here, not in each
 * caller, so a new caller that adds caching cannot forget it:
 *
 *   - `status: "error"`. Serving an error from a cache turns a short-lived
 *     failure (a tool mid-upgrade, a lock held for a second) into a lasting
 *     one that outlives its cause and that nobody can explain.
 *   - `skippedForExec: true`. A report withheld because exec was not allowed
 *     is not a probe result. Nothing was measured. Storing it would let a run
 *     without exec replace the answer a later run with exec should give.
 *
 * Returns whether anything was written. A write failure (read-only home, full
 * disk) also returns `false` rather than throwing. Failing to cache must never
 * fail the collection the cache was meant to speed up.
 */
export async function writeEntry(dir: string, entry: CacheEntry): Promise<boolean> {
  if (entry.report.status === 'error') return false
  if (entry.report.skippedForExec === true) return false

  const path = entryPath(dir, entry.root, entry.runner)
  try {
    await atomicWriteAsync(path, `${JSON.stringify(entry)}\n`)
    return true
  } catch {
    return false
  }
}

/**
 * The expected probe cost, as the median of the window.
 *
 * A median, not a mean. One cold JVM start takes several times as long as a
 * warm probe, and a mean lets that one outlier dominate the estimate while it
 * stays in the window. `null` when nothing has been measured. An unknown cost
 * is not a cost of zero, and a caller must be able to tell them apart.
 */
export function estimateMs(durations: readonly number[]): number | null {
  if (durations.length === 0) return null
  const sorted = [...durations].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const lo = sorted[mid - 1]
  const hi = sorted[mid]
  if (hi === undefined) return null
  if (sorted.length % 2 === 1) return hi
  return lo === undefined ? hi : (lo + hi) / 2
}

/** Whether this repo's own measurements say the runner is slow to probe. */
export function isSlow(durations: readonly number[]): boolean {
  const estimate = estimateMs(durations)
  return estimate !== null && estimate >= SLOW_PROBE_MS
}

/** The previous entry's window with `ms` appended, capped at {@link DURATION_WINDOW}. */
export function pushDuration(previous: CacheEntry | null, ms: number): number[] {
  const window = [...(previous?.durations ?? []), ms]
  return window.slice(-DURATION_WINDOW)
}
