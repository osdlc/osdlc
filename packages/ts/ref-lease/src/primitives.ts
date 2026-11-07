/**
 * The five ref operations of the protocol. Every write to the authority goes
 * through one of the three compare-and-swaps; every read through one of the
 * two fetches.
 *
 * | Operation | git | Fails with |
 * |---|---|---|
 * | `casCreate` | `push --force-with-lease=<ref>: <new>:<ref>` | `CasFailed` when the ref exists |
 * | `casReplace` | `push --force-with-lease=<ref>:<expected> <new>:<ref>` | `CasFailed` when the ref moved |
 * | `casDelete` | `push --delete --force-with-lease=<ref>:<expected> <ref>` | `CasFailed` when the ref moved |
 * | `fetchRef` | `fetch +<ref>:<ref>`, then read the payload blob | `RefNotFound`, `PayloadUnreadable` |
 * | `fetchNamespace` | `fetch --prune +<prefix>/*:<prefix>/*` | |
 *
 * Every ref and namespace must be a path under `refs/` outside `refs/heads`,
 * `refs/tags` and `refs/remotes`, and every sha a full lowercase object id;
 * anything else throws a `TypeError` before git runs. A fetch force-updates
 * the local copy of the refs it reads (and `fetchNamespace` prunes the ones the
 * authority lacks), so this keeps it away from the caller's own branches.
 *
 * Any other git failure is a `GitFailed`. Pushes go through typed-git's
 * `push`, which reports each ref's rejection as a value and runs git in the C
 * locale; the fetches run in the C locale too.
 *
 * Each call is one attempt. The one retry is local: a fetch that collides with
 * another process on a local ref lock backs off and tries again. Retrying a
 * lost compare-and-swap is the caller's decision, after it has read the ref
 * again.
 */

import { type GitFailure } from '@osdlc/typed-git'

import { fetchFailure, pushOutcome } from './classify.ts'
import { checkLeaseRef, checkSha } from './refs.ts'
import { CasFailed, PayloadUnreadable, RefNotFound } from './errors.ts'
import {
  C_LOCALE,
  client,
  failureResult,
  gitFailed,
  gitFailedFrom,
  sleepSync,
  type GitOptions,
} from './git.ts'

/** The blob a lease commit holds its payload in, unless a caller names another. */
export const DEFAULT_PAYLOAD_FILE = 'lease.json'

const FETCH_LOCK_ATTEMPTS = 6
const FETCH_LOCK_BACKOFF_MS = 25

/** A local mirror ref that a write left alone, because another process had moved it. */
export interface MirrorSkip {
  ref: string
  /** The sha the mirror was expected to hold before the update; all zeros for a create. */
  expectedSha: string
  /** The sha the update would have written; `null` for a delete. */
  newSha: string | null
}

/** Options for a compare-and-swap. */
export interface CasOptions extends GitOptions {
  /**
   * Called when the local mirror of the ref could not be brought to the written
   * state, because another process had moved it. The write itself succeeded.
   * The mirror stays as it is until a fetch of the ref; see {@link casReplace}.
   */
  onMirrorSkip?: (skip: MirrorSkip) => void
}

/**
 * One compare-and-swap: push `newSha` to `ref` (or delete it, when `newSha` is
 * null) only if the authority holds `expectedSha` there (or, when that is null,
 * nothing). On success, move the local mirror to match.
 */
function cas(
  op: 'create' | 'replace' | 'delete',
  authority: string,
  ref: string,
  expectedSha: string | null,
  newSha: string | null,
  opts: CasOptions,
): void {
  const label = `CAS-${op.toUpperCase()}`
  checkLeaseRef(ref, `${label}: ref`)
  if (expectedSha !== null) checkSha(expectedSha, `${label}: expected sha`)
  if (newSha !== null) checkSha(newSha, `${label}: new sha`)
  const git = client(opts)
  const pushed = git.try.push(authority, newSha === null ? ref : `${newSha}:${ref}`, {
    forceWithLease: { ref, expect: expectedSha },
    delete: newSha === null,
  })
  // A transport failure (unreachable, auth, bad URL) or a local pre-push hook
  // decline: git printed no result for the ref.
  if (!pushed.ok) {
    throw gitFailedFrom(
      label,
      `git push failed for ${label} on ${JSON.stringify(ref)}`,
      pushed.error,
    )
  }
  const { refs, stderr } = pushed.value
  const result = refs.find((r) => r.dst === ref)
  if (result === undefined) {
    throw gitFailed(label, `git push reported no result for ${JSON.stringify(ref)}`, {
      exitCode: 1,
      stderr,
    })
  }
  const reason = [result.rawReason, result.detail].filter(Boolean).join('; ')
  switch (pushOutcome(result, expectedSha !== null && expectedSha === newSha)) {
    case 'cas-failed': {
      const upToDate = result.flag === '='
      const detail = upToDate
        ? expectedSha === null
          ? `ref already exists at authority with the same sha ${JSON.stringify(newSha)}`
          : `ref is already at ${JSON.stringify(newSha)}, not at expected_sha=${JSON.stringify(expectedSha)}`
        : expectedSha === null
          ? `ref already exists at authority (${reason})`
          : `expected_sha=${JSON.stringify(expectedSha)} (${reason})`
      throw new CasFailed({
        ref,
        expectedSha,
        actualSha: upToDate ? newSha : null,
        message: `${label} failed on ref ${JSON.stringify(ref)}: ${detail}`,
      })
    }
    case 'git-failed':
      throw gitFailed(
        label,
        `git push failed for ${label} on ${JSON.stringify(ref)}: ${result.rejection} (${reason})`,
        { exitCode: 1, stderr },
      )
    case 'ok':
      syncLocalMirror(git, ref, expectedSha, newSha, opts)
  }
}

/**
 * Bring this repository's local mirror of `ref` from `oldSha` (`null` for a
 * create) to what the authority now holds, so a reader of local refs sees the
 * write without a fetch. `newSha: null` removes the mirror.
 *
 * The update is guarded: it applies only while the mirror still holds `oldSha`
 * (for a create, while it does not exist). Worktrees share one ref store, so
 * another process may have moved the mirror between this write landing at the
 * authority and this call. The guard leaves that newer value alone instead of
 * rewinding it. A skipped mirror stays as it is until a fetch of the ref
 * (`fetchRef`, `fetchNamespace`) brings it to the authority's value: later
 * writes are guarded the same way and skip it too. A failed update never fails
 * the write, which has already succeeded: it is reported to `onMirrorSkip`.
 */
function syncLocalMirror(
  git: ReturnType<typeof client>,
  ref: string,
  oldSha: string | null,
  newSha: string | null,
  opts: CasOptions,
): void {
  if (newSha === null) {
    // A delete always has the sha it expected.
    const expected = oldSha as string
    if (!git.try.deleteRef(ref, { expected }).ok) {
      opts.onMirrorSkip?.({ ref, expectedSha: expected, newSha })
    }
    return
  }
  // The zero oid as the old value means "must not exist". typed-git has no
  // update-ref verb, so this one call is raw.
  const expected = oldSha ?? '0'.repeat(newSha.length)
  if (git.raw(['update-ref', ref, newSha, expected]).exitCode !== 0) {
    opts.onMirrorSkip?.({ ref, expectedSha: expected, newSha })
  }
}

/**
 * Create `ref` at the authority, pointing at `newSha`, only if the ref does not
 * exist there. The commit must exist in the local repository; the push sends it.
 *
 * @param authority A git remote name or URL: the one store every participant
 *   agrees is the truth.
 * @throws CasFailed when the ref already exists, at any sha.
 * @throws GitFailed for any other git failure.
 * @throws TypeError for a ref outside your own namespace, or a sha that is not a full object id.
 */
export function casCreate(
  authority: string,
  ref: string,
  newSha: string,
  opts: CasOptions = {},
): void {
  cas('create', authority, ref, null, newSha, opts)
}

/**
 * Move `ref` at the authority from `expectedSha` to `newSha`, only if it still
 * points at `expectedSha`. `newSha` is usually a commit whose parent is
 * `expectedSha` (see `buildLeaseCommit`), so the ref's log is the lease's
 * history, but the protocol does not require it.
 *
 * On success the local mirror of the ref moves too, unless another process
 * moved it first; then `opts.onMirrorSkip` is told, and the mirror keeps that
 * other value until a fetch of the ref.
 *
 * @throws CasFailed when the ref is not at `expectedSha`, or is gone.
 * @throws GitFailed for any other git failure.
 * @throws TypeError for a ref outside your own namespace, or a sha that is not a full object id.
 */
export function casReplace(
  authority: string,
  ref: string,
  expectedSha: string,
  newSha: string,
  opts: CasOptions = {},
): void {
  cas('replace', authority, ref, expectedSha, newSha, opts)
}

/**
 * Delete `ref` at the authority, only if it still points at `expectedSha`.
 *
 * @throws CasFailed when the ref is not at `expectedSha`, or is already gone.
 * @throws GitFailed for any other git failure.
 * @throws TypeError for a ref outside your own namespace, or a sha that is not a full object id.
 */
export function casDelete(
  authority: string,
  ref: string,
  expectedSha: string,
  opts: CasOptions = {},
): void {
  cas('delete', authority, ref, expectedSha, null, opts)
}

/**
 * Run a fetch that force-updates local refs, retrying while another process
 * holds a local ref lock. Two concurrent fetches of one ref collide on its
 * `.lock` file and the loser dies with "cannot lock ref". The lock is held for
 * milliseconds, so a short bounded backoff clears it; the compare-and-swap, not
 * git's lock, then decides who wins. Any other failure, or contention that
 * outlasts the attempts, is returned to the caller.
 */
function fetchWithLockRetry<R extends { ok: true } | { ok: false; error: GitFailure }>(
  run: () => R,
): R {
  let out = run()
  for (let attempt = 1; attempt < FETCH_LOCK_ATTEMPTS; attempt++) {
    if (out.ok) return out
    if (fetchFailure(failureResult(out.error).stderr) !== 'lock-contention') return out
    sleepSync(FETCH_LOCK_BACKOFF_MS * attempt)
    out = run()
  }
  return out
}

/** A ref read from the authority: the commit it points at and the payload in it. */
export interface FetchedRef<T = unknown> {
  sha: string
  payload: T
}

/** Options for {@link fetchRef}. */
export interface FetchRefOptions<T> extends GitOptions {
  /** The blob in the lease commit that holds the payload. Default `lease.json`. */
  payloadFile?: string
  /**
   * Turns the parsed JSON into the caller's payload type, for example a schema's
   * `parse`. Whatever it throws propagates unchanged. Without it the payload is
   * the parsed JSON, typed `unknown`.
   */
  decode?: (value: unknown) => T
}

/**
 * Fetch `ref` from the authority into the local repository (`+<ref>:<ref>`) and
 * read the payload from the commit it points at.
 *
 * @throws RefNotFound when the authority has no such ref.
 * @throws PayloadUnreadable when the commit has no payload file or it is not JSON.
 * @throws GitFailed for any other git failure.
 * @throws TypeError for a ref outside your own namespace, or a sha that is not a full object id.
 */
export function fetchRef<T = unknown>(
  authority: string,
  ref: string,
  opts: FetchRefOptions<T> = {},
): FetchedRef<T> {
  checkLeaseRef(ref, 'FETCH-REF: ref')
  const git = client(opts)
  const payloadFile = opts.payloadFile ?? DEFAULT_PAYLOAD_FILE
  const fetched = fetchWithLockRetry(() =>
    git.try.fetch(authority, `+${ref}:${ref}`, { noWriteFetchHead: true, ...C_LOCALE }),
  )
  if (!fetched.ok) {
    if (fetchFailure(failureResult(fetched.error).stderr) === 'ref-not-found') {
      throw new RefNotFound({ ref })
    }
    throw gitFailedFrom(
      'FETCH-REF',
      `git fetch failed for FETCH-REF on ${JSON.stringify(ref)}`,
      fetched.error,
    )
  }
  // The fetch succeeded but left no local ref: treat it as not found.
  const rev = git.try.resolveRef(ref)
  if (!rev.ok || rev.value === null) throw new RefNotFound({ ref })
  const sha = rev.value
  // `showAtRev` declares a missing path absent, so it is null rather than a throw.
  const show = git.try.showAtRev(sha, payloadFile)
  if (!show.ok || show.value === null) {
    const res = show.ok ? null : failureResult(show.error)
    const detail =
      res === null
        ? `no ${payloadFile} in that commit`
        : `exit=${res.exitCode} stderr=${JSON.stringify(res.stderr)}`
    throw new PayloadUnreadable({
      ref,
      sha,
      message: `git show failed reading ${payloadFile} at ${JSON.stringify(sha)}: ${detail}`,
    })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(show.value)
  } catch (exc) {
    throw new PayloadUnreadable({
      ref,
      sha,
      message:
        `${payloadFile} at ${JSON.stringify(ref)}/${JSON.stringify(sha)} is not valid JSON: ` +
        (exc as Error).message,
      cause: exc,
    })
  }
  return { sha, payload: opts.decode ? opts.decode(parsed) : (parsed as T) }
}

/**
 * Fetch every ref under `prefix` from the authority (`+<prefix>/*:<prefix>/*`,
 * pruning local refs under it that the authority no longer has) and list them.
 * A prefix with no refs gives `{}`. Only refs strictly under the prefix are
 * listed, never a ref at the prefix itself.
 *
 * @param prefix A ref path such as `refs/locks`; a trailing `/` is ignored.
 * @returns Each ref under the prefix, mapped to the sha it points at.
 * @throws GitFailed when git fails.
 * @throws TypeError for a prefix outside your own namespace.
 */
export function fetchNamespace(
  authority: string,
  prefix: string,
  opts: GitOptions = {},
): Record<string, string> {
  const base = prefix.replace(/\/+$/, '')
  checkLeaseRef(base, 'FETCH-NAMESPACE: prefix')
  const git = client(opts)
  const fetched = fetchWithLockRetry(() =>
    git.try.fetch(authority, `+${base}/*:${base}/*`, {
      prune: true,
      noWriteFetchHead: true,
      ...C_LOCALE,
    }),
  )
  if (!fetched.ok) {
    throw gitFailedFrom(
      'FETCH-NAMESPACE',
      `git fetch failed for FETCH-NAMESPACE on prefix ${JSON.stringify(base)}`,
      fetched.error,
    )
  }
  const listing = git.try.refs(base)
  if (!listing.ok) {
    throw gitFailedFrom(
      'FETCH-NAMESPACE',
      `git for-each-ref failed on prefix ${JSON.stringify(base)}`,
      listing.error,
    )
  }
  const result: Record<string, string> = {}
  for (const { ref, sha } of listing.value) {
    if (ref.startsWith(`${base}/`) && sha !== '') result[ref] = sha
  }
  return result
}
