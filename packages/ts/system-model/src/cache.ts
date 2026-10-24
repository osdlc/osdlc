/**
 * The stored runner results: one file per (root, runner) under a directory
 * the caller names. A layer above `collect`, never inside it.
 *
 * Layout: `<dir>/reports/v<CACHE_FORMAT_VERSION>/<basename>-<hash>/<runner>.json`.
 * One file per runner, so every write is one atomic rename that cannot lose a
 * concurrent write for another runner. The format version is in the path and
 * in each file: a bump abandons the old tree, and an entry that arrives some
 * other way is still rejected.
 *
 * A broken entry (missing, truncated, unparseable, old version) is a miss,
 * never an error: the fallback is always to probe.
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { atomicWriteAsync } from '@osdlc/etag-write'

import type { ProviderKind } from './contract.ts'
import type { Fingerprint } from './fingerprint.ts'
import type { RunnerReport } from './model.ts'

/** Bumped whenever a stored entry's shape — including `Task`'s — changes. */
export const CACHE_FORMAT_VERSION = 4

/** How many probe durations are kept per entry. */
export const DURATION_WINDOW = 5

/**
 * A repo-measured probe at or above this is "slow" for that repo.
 *
 * Measured, never declared. The same runner is fast against a small
 * repository and slow against a large one, so a per-runner constant would be
 * wrong for half its users; what matters is how long it took HERE.
 */
export const SLOW_PROBE_MS = 1500

/**
 * Backstop for exec entries whose fingerprint cannot see the merge inputs.
 *
 * An exec runner reads its markers, not the files its tool merges (see
 * `fingerprint.ts`), so a matching fingerprint is a good signal rather than a
 * proof. Four hours bounds how long a change the fingerprint cannot see can go
 * unnoticed, without re-paying a JVM start every few minutes.
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
}

/** Where one (root, runner) entry lives under `dir`. */
export function entryPath(dir: string, root: string, runnerId: string): string {
  return join(dir, 'reports', `v${CACHE_FORMAT_VERSION}`, rootKey(root), `${runnerId}.json`)
}

/** `basename-hash`: the hash keeps same-named roots apart, the name keeps `ls` legible. */
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
  return entry
}

/**
 * Store one entry, or refuse to.
 *
 * Two reports are never stored, and the refusal lives HERE rather than in each
 * caller so it cannot be forgotten by the next surface that adds caching:
 *
 *   - `status: "error"`. Serving an error out of a cache turns a transient
 *     failure — a tool mid-upgrade, a lock held for a second — into a sticky
 *     one that outlives its cause and that nobody can explain.
 *   - `skippedForExec: true`. A report withheld for want of execution is not a
 *     probe result at all; nothing was measured, and storing it would let an
 *     untrusted run poison the answer a later trusted run should have given.
 *
 * Returns whether anything was written. A write failure — read-only home, full
 * disk — is also `false` rather than a throw: failing to cache must never fail
 * the collection the cache was meant to speed up.
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
 * The expected probe cost, as the MEDIAN of the window.
 *
 * A median, not a mean: one cold JVM start is several times a warm probe, and a
 * mean lets that single outlier dominate the estimate for as long as it stays
 * in the window. `null` when nothing has been measured — an unknown cost is not
 * a cost of zero, and a caller must be able to tell the difference.
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
