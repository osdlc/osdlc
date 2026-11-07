/**
 * Internal: how the protocol reads git's answers. Pure functions, so another
 * implementation of the protocol can be checked against the same cases
 * (`tests/conformance/` in this package).
 */

import { type PushRefResult } from '@osdlc/typed-git'

/** What a compare-and-swap push did. */
export type PushOutcome = 'ok' | 'cas-failed' | 'git-failed'

/** What a failed fetch means. */
export type FetchFailure = 'ref-not-found' | 'lock-contention' | 'git-failed'

/**
 * The rejections that mean another writer got there first. typed-git reads
 * them from git's reason text (`stale info`, `reference already exists`,
 * `cannot lock ref … but expected …`). Every other rejection (a hook, a ref
 * path clash, anything unrecognised) is a git failure: retrying cannot help.
 */
const LOST_RACE: ReadonlySet<string> = new Set([
  'stale',
  'already-exists',
  'lock-failed',
  'non-fast-forward',
])

/**
 * Classify the result git printed for the pushed ref. A create that finds the
 * ref already at the sha it wanted to write (`=`, up to date) lost too: the
 * ref existed.
 */
export function pushOutcome(
  op: 'create' | 'replace' | 'delete',
  ref: Pick<PushRefResult, 'flag' | 'rejection'>,
): PushOutcome {
  if (ref.flag === '!') return LOST_RACE.has(ref.rejection ?? '') ? 'cas-failed' : 'git-failed'
  if (ref.flag === '=' && op === 'create') return 'cas-failed'
  return 'ok'
}

/** Markers of a fetch that asked for a ref the authority does not have. */
const NOT_FOUND_MARKERS: readonly string[] = [
  "couldn't find remote ref",
  "couldn't find remote",
  'did not match any refs',
  "fatal: couldn't find",
  'no such ref',
]

/** git's message when another process holds the lock on a local ref. */
const LOCAL_LOCK_MARKERS: readonly string[] = ['cannot lock ref']

const has = (text: string, markers: readonly string[]) => {
  const low = text.toLowerCase()
  return markers.some((m) => low.includes(m))
}

/**
 * Classify the stderr of a failed fetch, run in the C locale. `lock-contention`
 * is a local ref lock held by another process, which clears in milliseconds;
 * the fetch is retried.
 */
export function fetchFailure(stderr: string): FetchFailure {
  if (has(stderr, NOT_FOUND_MARKERS)) return 'ref-not-found'
  if (has(stderr, LOCAL_LOCK_MARKERS)) return 'lock-contention'
  return 'git-failed'
}
