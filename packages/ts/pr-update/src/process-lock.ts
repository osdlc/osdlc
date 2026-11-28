/**
 * A lock file held by one pr-update process, as a clone's lock is: it names the process by pid and
 * start time, and a lock whose process is gone is taken over. Shared by the clone lock
 * (`./mirror.ts`) and the rerere lock (`./update/rerere.ts`).
 */

import { claimLock, holderGone, processIdentity } from '@osdlc/file-lock'

/** What a lock held by a pr-update process records: the process, by pid and start, so a reused pid is not taken for it. */
export interface ProcessLockContent {
  tool: string
  holder: { pid: number; startedAt?: string }
}

let identity: string | null | undefined

function lockHolder(): ProcessLockContent['holder'] {
  identity ??= processIdentity(process.pid)
  return { pid: process.pid, ...(identity === null ? {} : { startedAt: identity }) }
}

export const processLockGone = holderGone<ProcessLockContent>((c) => [c.holder])

/** Nothing ever notifies it, so `Atomics.wait` on it just sleeps. */
const SLEEPER = new Int32Array(new SharedArrayBuffer(4))

/**
 * Take the lock at `path`, waiting up to `waitMs` for another run to let go. A lock whose holder
 * process is gone is taken over. Returns the token that releases it, or null when it stayed held.
 */
export function claimProcessLock(path: string, waitMs: number): string | null {
  const deadline = Date.now() + waitMs
  for (;;) {
    const claim = claimLock<ProcessLockContent>(
      path,
      { tool: 'pr-update', holder: lockHolder() },
      { isStale: processLockGone },
    )
    if (claim.ok) return claim.token
    const left = deadline - Date.now()
    if (left <= 0) return null
    Atomics.wait(SLEEPER, 0, 0, Math.min(250, left))
  }
}
