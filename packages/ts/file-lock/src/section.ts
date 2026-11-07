/**
 * The short critical section: hold a lock for the length of a synchronous
 * function, such as a re-read, validate and rewrite of one file.
 */

import { claimLock, type HeldLock, releaseLock } from './held.ts'
import { untouchedFor } from './rules.ts'

/** Options for {@link withLock}. */
export interface LockOptions {
  /** A lock untouched for longer than this, in milliseconds, is a dead holder's and is taken over. Default 10 s. */
  staleMs?: number | undefined
  /** Give up and throw {@link LockTimeoutError} after waiting this long. 0 tries once. Default 30 s. */
  timeoutMs?: number | undefined
  /** Pause between attempts, in milliseconds. Default 5. */
  retryMs?: number | undefined
  /** A takeover marker older than this is a dead reaper's. Default `MARKER_STALE_MS`. */
  markerStaleMs?: number | undefined
}

/** {@link withLock} waited `timeoutMs` and the lock stayed held. */
export class LockTimeoutError extends Error {
  /** The lock that stayed held. */
  readonly path: string
  /** The holder seen last, or null when the lock kept changing. */
  readonly holder: HeldLock | null

  constructor(path: string, holder: HeldLock | null) {
    super(`timed out waiting for lock ${path}`)
    this.name = 'LockTimeoutError'
    this.path = path
    this.holder = holder
  }
}

/** Block the thread for `ms` without spinning. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Run `fn` holding the lock at `path`, and release it when `fn` returns or
 * throws. The lock records this process's pid. Waiting blocks the thread, so
 * keep the section short.
 *
 * A lock untouched for `staleMs` is taken to be a killed holder's. That is a
 * guess: a live holder whose section outlasts `staleMs` loses its lock to the
 * next waiter, and both then run (the first one's release leaves the taker's
 * lock alone). Keep `staleMs` far above the longest section.
 */
export function withLock<T>(path: string, fn: () => T, options: LockOptions = {}): T {
  const { staleMs = 10_000, timeoutMs = 30_000, retryMs = 5, markerStaleMs } = options
  const deadline = Date.now() + timeoutMs
  const isStale = untouchedFor(staleMs)
  for (;;) {
    const claim = claimLock(path, { pid: process.pid }, { isStale, markerStaleMs })
    if (claim.ok) {
      try {
        return fn()
      } finally {
        releaseLock(path, claim.token)
      }
    }
    if (Date.now() >= deadline) throw new LockTimeoutError(path, claim.holder)
    sleepSync(retryMs)
  }
}
