/** Shared test helpers. Not a test file itself. */
import { utimesSync } from 'node:fs'

import { vi } from 'vitest'

import { markerFor } from '../src/held.ts'
import { MARKER_STALE_MS } from '../src/index.ts'

export { markerFor }

/** Above every platform's pid_max, so it can never name a live process. */
export const DEAD_PID = 2147483646

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
