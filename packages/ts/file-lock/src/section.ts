/**
 * The short critical section: hold a lock for the length of a synchronous
 * function, such as a re-read, validate and rewrite of one file.
 */

import { type HeldLock, type LockClaim, prepareClaim, releaseLock, type StaleRule } from './held.ts'
import { untouchedFor } from './rules.ts'

/** What a {@link withLock} lock records: the holder's pid. */
export interface SectionHolder {
  pid?: number
}

/** Options for {@link withLock}. */
export interface LockOptions {
  /** A lock untouched for longer than this, in milliseconds, is a dead holder's and is taken over. Default 10 s. */
  staleMs?: number | undefined
  /**
   * Replaces the age rule: when a held lock may be taken over. For a section
   * that can legitimately run long, `holderGone((h) => [h.pid])` waits for the
   * holder process to exit instead of guessing by age. `staleMs` is then unused.
   */
  isStale?: StaleRule<SectionHolder> | undefined
  /** Give up and throw {@link LockTimeoutError} after waiting this long. 0 tries once. Default 30 s. */
  timeoutMs?: number | undefined
  /** Pause between attempts, in milliseconds. Default 5. */
  retryMs?: number | undefined
}

/** {@link withLock} waited `timeoutMs` and the lock stayed held. */
export class LockTimeoutError extends Error {
  /** The lock that stayed held. */
  readonly path: string
  /** The holder seen last, or null when the lock kept changing. */
  readonly holder: HeldLock<SectionHolder> | null

  constructor(path: string, holder: HeldLock<SectionHolder> | null) {
    super(`timed out waiting for lock ${path}`)
    this.name = 'LockTimeoutError'
    this.path = path
    this.holder = holder
  }
}

/** Nothing ever notifies it, so `Atomics.wait` on it just sleeps. */
const SLEEPER = new Int32Array(new SharedArrayBuffer(4))

/** Block the thread for `ms` without spinning. */
function sleepSync(ms: number): void {
  Atomics.wait(SLEEPER, 0, 0, ms)
}

/**
 * Run `fn` holding the lock at `path`, and release it when `fn` returns or
 * throws. The lock records this process's pid. Waiting blocks the thread, so
 * keep the section short. `fn` must be synchronous: one that returns a promise
 * is refused with a `TypeError`, because the lock would be released before the
 * awaited work ran. Use `claimLock` and `releaseLock` around async work.
 *
 * By default a lock untouched for `staleMs` is taken to be a killed holder's.
 * That is a guess: a live holder whose section outlasts `staleMs` loses its
 * lock to the next waiter, and both then run. The first one's release leaves
 * the taker's lock alone, and that loss is not reported. Keep `staleMs` far
 * above the longest section, or pass an `isStale` rule that does not guess by
 * age, such as `holderGone`.
 */
export function withLock<T>(path: string, fn: () => T, options: LockOptions = {}): T {
  const { staleMs = 10_000, timeoutMs = 30_000, retryMs = 5 } = options
  const isStale = options.isStale ?? untouchedFor<SectionHolder>(staleMs)
  const deadline = Date.now() + timeoutMs
  // The temp file is written once; each retry only tries the link again.
  const prepared = prepareClaim<SectionHolder>(path, { pid: process.pid }, { isStale })
  let claim: LockClaim<SectionHolder>
  try {
    claim = prepared.attempt()
    while (!claim.ok) {
      if (Date.now() >= deadline) throw new LockTimeoutError(path, claim.holder)
      sleepSync(Math.min(retryMs, deadline - Date.now()))
      claim = prepared.attempt()
    }
  } finally {
    prepared.dispose()
  }
  const { token } = claim
  let result: T
  try {
    result = fn()
  } catch (err) {
    try {
      releaseLock(path, token)
    } catch {
      // The section's own error is the one to report.
    }
    throw err
  }
  releaseLock(path, token)
  if (typeof (result as { then?: unknown } | null | undefined)?.then === 'function') {
    throw new TypeError(
      `withLock(${path}): fn returned a promise, so its awaited work ran after the lock was released; use claimLock and releaseLock around async work`,
    )
  }
  return result
}
