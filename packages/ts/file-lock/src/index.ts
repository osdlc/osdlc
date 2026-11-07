/**
 * Cross-process exclusive file locks for Node.js: a held lock with an owner
 * token, a caller-supplied staleness rule and race-safe takeover, and a short
 * critical section built on it.
 */

export {
  claimLock,
  MARKER_STALE_MS,
  releaseLock,
  touchLock,
  updateLock,
  type ClaimOptions,
  type HeldLock,
  type LockClaim,
  type LockContent,
  type StaleRule,
} from './held.ts'
export { holderGone, pidAlive, untouchedFor, type HolderGoneOptions } from './rules.ts'
export { LockTimeoutError, withLock, type LockOptions } from './section.ts'
