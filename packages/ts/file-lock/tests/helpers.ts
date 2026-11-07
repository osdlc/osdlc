/** Shared test helpers. Not a test file itself. */
import { createHash } from 'node:crypto'
import { utimesSync } from 'node:fs'

import { vi } from 'vitest'

import { MARKER_STALE_MS } from '../src/index.ts'

/** Above every platform's pid_max, so it can never name a live process. */
export const DEAD_PID = 2147483646

/** The takeover marker a reaper creates for a lock whose text is `raw`, named as held.ts names it. */
export function markerFor(lock: string, raw: string): string {
  return `${lock}.stale-${createHash('sha256').update(raw).digest('hex').slice(0, 24)}`
}

/** Set `path`'s mtime `ms` into the past: a lock nobody has touched for that long. */
export function age(path: string, ms = 60_000): void {
  const old = new Date(Date.now() - ms)
  utimesSync(path, old, old)
}

/** Run `fn` with the clock moved past MARKER_STALE_MS, so every existing marker is a dead reaper's. */
export function afterMarkersExpire<T>(fn: () => T): T {
  const now = Date.now()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now + MARKER_STALE_MS + 1_000)
  try {
    return fn()
  } finally {
    vi.useRealTimers()
  }
}
