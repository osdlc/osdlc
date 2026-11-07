/** Ready-made staleness rules for `claimLock`. */

import type { HeldLock, LockContent, StaleRule } from './held.ts'

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
}

/**
 * Stale once no pid that `pids` reads from the content is alive. Values that
 * are not numbers name no live holder. A file that is not a JSON object was
 * not written by `claimLock`, so this rule never judges it stale: it belongs
 * to some other program and is left alone. A pid can be recycled by a later process, which
 * then keeps the lock held; a rule that also compares a start time closes
 * that.
 */
export function holderGone<F extends object = Record<string, unknown>>(
  pids: (content: LockContent<F>) => readonly unknown[],
  options: HolderGoneOptions = {},
): StaleRule<F> {
  const alive = options.alive ?? pidAlive
  return (held: HeldLock<F>) => {
    if (held.content === null) return false
    return !pids(held.content).some((pid) => typeof pid === 'number' && alive(pid))
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
