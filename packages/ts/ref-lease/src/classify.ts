/**
 * How the protocol reads git's output. These are pure functions over what git
 * printed, so another implementation of the protocol can be checked against
 * the same cases (`tests/conformance/` in this package).
 *
 * git's messages are matched in English. Under another locale git translates
 * them, and a lost race reads as `git-failed` instead of `cas-failed`.
 */

/**
 * Markers of a ref-level push rejection, from real git output.
 *
 * - A lost `--force-with-lease` race caught client-side prints
 *   ` ! [rejected]  <src> -> <ref> (stale info)`. A plain non-fast-forward or
 *   "fetch first" rejection also carries `[rejected]`.
 * - A race lost at the authority, after the client-side check passed, prints
 *   `cannot lock ref '<ref>': is at <B> but expected <A>` when another writer
 *   moved the ref, `unable to resolve reference '<ref>'` when one deleted it,
 *   and `reference already exists` when one created it first.
 *
 * Deliberately not markers, because they also end failures that are not a
 * lost race: the bare word `rejected` (`URL rejected: Bad hostname`),
 * `[remote rejected]` alone (`(pre-receive hook declined)`),
 * `(failed to update ref)` alone (a directory/file ref clash, an unwritable
 * refs directory, a stale `.lock` file), `(refname conflict)` (the ref clash
 * in git 2.54 and later) and `failed to push some refs`.
 *
 * @experimental The list may grow as other git versions are covered.
 */
export const CAS_REJECTION_MARKERS: readonly string[] = [
  '[rejected]',
  'stale info',
  'but expected',
  'unable to resolve reference',
  'reference already exists',
]

/**
 * Markers of a fetch that asked for a ref the authority does not have.
 *
 * @experimental The list may grow as other git versions are covered.
 */
export const NOT_FOUND_MARKERS: readonly string[] = [
  "couldn't find remote ref",
  "couldn't find remote",
  'did not match any refs',
  "fatal: couldn't find",
  'no such ref',
]

/**
 * git's message when another process holds the lock on a local ref.
 *
 * @experimental The list may grow as other git versions are covered.
 */
export const LOCAL_LOCK_MARKERS: readonly string[] = ['cannot lock ref']

/**
 * What a compare-and-swap push did.
 *
 * @experimental With {@link classifyPush}.
 */
export type PushOutcome = 'ok' | 'cas-failed' | 'git-failed'

/**
 * What a failed fetch means.
 *
 * @experimental With {@link classifyFetchFailure}.
 */
export type FetchFailure = 'ref-not-found' | 'lock-contention' | 'git-failed'

/**
 * What git printed for one call.
 *
 * @experimental With {@link classifyPush}.
 */
export interface GitOutput {
  exitCode: number
  stdout: string
  stderr: string
}

/** True when `text` holds any of `markers`, ignoring case. */
export function hasMarker(text: string, markers: readonly string[]): boolean {
  const low = text.toLowerCase()
  return markers.some((m) => low.includes(m))
}

/**
 * Classify the result of a compare-and-swap push.
 *
 * A create that exits 0 but reports `Everything up-to-date` found the ref
 * already at the sha it wanted to write. The ref existed, so the create lost:
 * `cas-failed`.
 *
 * @experimental The cases may grow as other git versions are covered.
 */
export function classifyPush(op: 'create' | 'replace' | 'delete', out: GitOutput): PushOutcome {
  if (out.exitCode === 0) {
    if (op === 'create' && hasMarker(out.stderr + '\n' + out.stdout, ['up-to-date'])) {
      return 'cas-failed'
    }
    return 'ok'
  }
  return hasMarker(out.stderr, CAS_REJECTION_MARKERS) ? 'cas-failed' : 'git-failed'
}

/**
 * Classify the stderr of a failed fetch. `lock-contention` is a local ref lock
 * held by another process, which clears in milliseconds; the fetch is retried.
 *
 * @experimental The cases may grow as other git versions are covered.
 */
export function classifyFetchFailure(stderr: string): FetchFailure {
  if (hasMarker(stderr, NOT_FOUND_MARKERS)) return 'ref-not-found'
  if (hasMarker(stderr, LOCAL_LOCK_MARKERS)) return 'lock-contention'
  return 'git-failed'
}
