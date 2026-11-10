/** Shared test helpers. Not a test file itself. */
import { utimesSync } from 'node:fs'

import { vi } from 'vitest'

import { markerFor } from '../src/held.ts'
import { type claimLock, MARKER_STALE_MS } from '../src/index.ts'

export { markerFor }

/** Symlinks, FIFOs, sockets and file modes behave as these tests expect only off Windows. */
export const POSIX = process.platform !== 'win32'

/** Claim options whose rule judges every held lock live, or every one stale. */
export const never = { isStale: (): boolean => false }
export const always = { isStale: (): boolean => true }

/** The token of a claim that must have succeeded. */
export function claimed(r: ReturnType<typeof claimLock>): string {
  if (!r.ok) throw new Error('expected the claim to succeed')
  return r.token
}

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
