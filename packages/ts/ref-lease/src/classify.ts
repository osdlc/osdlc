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
 * Classify the result git printed for the pushed ref.
 *
 * `=` (up to date) needs care: git reports it when the authority already holds
 * the sha being pushed, before it checks the lease. That is a success only for
 * a write whose expected sha is the sha it pushes (`keepsSha`). For any other
 * write the ref was not where the caller expected (another writer pushed the
 * same commit, or a create found the ref existing), so it lost.
 */
export function pushOutcome(
  ref: Pick<PushRefResult, 'flag' | 'rejection'>,
  keepsSha: boolean,
): PushOutcome {
  if (ref.flag === '!') return LOST_RACE.has(ref.rejection ?? '') ? 'cas-failed' : 'git-failed'
  if (ref.flag === '=') return keepsSha ? 'ok' : 'cas-failed'
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

/**
 * git's message when another process holds a local ref's lock file:
 * `cannot lock ref '<ref>': Unable to create '<path>.lock': File exists.`
 * Other `cannot lock ref` failures (a directory/file ref clash, a ref that
 * moved) are permanent and not retried.
 */
const LOCAL_LOCK_MARKERS: readonly string[] = [".lock': file exists"]

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
