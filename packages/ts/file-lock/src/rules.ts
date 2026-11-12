/** Ready-made staleness rules for `claimLock`. */

import type { HeldLock, LockContent, StaleRule } from './held.ts'
import { sameProcess } from './process-start.ts'

/**
 * True when a process with `pid` exists. Signal 0 checks without delivering
 * anything; `EPERM` means the process exists and belongs to another user,
 * which counts as alive. A pid that is not a positive integer is not alive.
 */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Options for {@link holderGone}. */
export interface HolderGoneOptions {
  /** The liveness probe. Default {@link pidAlive}. */
  alive?: ((pid: number) => boolean) | undefined
  /**
   * The start-time probe for holders recorded with `startedAt`. Default
   * `processStartedAt`. Experimental, as `sameProcess` is.
   */
  startedAt?: ((pid: number) => number | null) | undefined
}

/**
 * A holder as `holderGone` reads it: a pid, or a pid with the start time it
 * was recorded with, as `sameProcess` takes it. Record
 * `processStartedAt(process.pid)`; a start time in a form `sameProcess` cannot
 * read is ignored, and the holder is then judged on its pid alone.
 *
 * @experimental
 */
export type Holder = number | { pid: number; startedAt?: string | number | undefined }

/**
 * Stale once no holder that `pids` reads from the content is alive. Values
 * that are neither a number nor `{ pid }` name no live holder. A file that is
 * not a JSON object was not written by `claimLock`, so this rule never judges
 * it stale: it belongs to some other program and is left alone.
 *
 * A pid can be recycled by a later process, which would keep the lock held.
 * Record the holder's start time and return `{ pid, startedAt }` to close
 * that: the holder then counts as alive only while `sameProcess` says so.
 */
export function holderGone<F extends object = Record<string, unknown>>(
  pids: (content: LockContent<F>) => readonly unknown[],
  options: HolderGoneOptions = {},
): StaleRule<F> {
  const alive = options.alive ?? pidAlive
  const live = (holder: unknown): boolean => {
    if (typeof holder === 'number') return alive(holder)
    if (typeof holder !== 'object' || holder === null) return false
    const { pid, startedAt } = holder as { pid?: unknown; startedAt?: unknown }
    if (typeof pid !== 'number') return false
    if (typeof startedAt !== 'string' && typeof startedAt !== 'number') return alive(pid)
    return sameProcess(pid, startedAt, { alive, startedAt: options.startedAt })
  }
  return (held: HeldLock<F>) => {
    if (held.content === null) return false
    return !pids(held.content).some(live)
  }
}

/**
 * Stale once the lock has not been written or touched for more than `ms`
 * milliseconds. A live holder whose work outlasts `ms` loses the lock, so
 * keep `ms` far above the longest hold, or refresh the lock with `touchLock`.
 */
export function untouchedFor<F extends object = Record<string, unknown>>(
  ms: number,
  now: () => number = Date.now,
): StaleRule<F> {
  return (held: HeldLock<F>) => now() - held.mtimeMs > ms
}
