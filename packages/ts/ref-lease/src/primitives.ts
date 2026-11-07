/**
 * The five ref operations of the protocol. Every write to the authority goes
 * through one of the three compare-and-swaps; every read through one of the
 * two fetches.
 *
 * | Operation | git | Fails with |
 * |---|---|---|
 * | `casCreate` | `push --force-with-lease=<ref>:` | `CasFailed` when the ref exists |
 * | `casReplace` | `push --force-with-lease=<ref>:<expected>` | `CasFailed` when the ref moved |
 * | `casDelete` | `push --force-with-lease=<ref>:<expected> :<ref>` | `CasFailed` when the ref moved |
 * | `fetchRef` | `fetch +<ref>:<ref>`, then read the payload blob | `RefNotFound`, `PayloadUnreadable` |
 * | `fetchNamespace` | `fetch --prune +<prefix>/*:<prefix>/*` | |
 *
 * Any other git failure is a `GitFailed`.
 *
 * Each call is one attempt. The one retry is local: a fetch that collides with
 * another process on a local ref lock backs off and tries again. Retrying a
 * lost compare-and-swap is the caller's decision, after it has read the ref
 * again.
 */

import { type GitFailure } from '@osdlc/typed-git'

import { classifyFetchFailure, classifyPush, hasMarker, LOCAL_LOCK_MARKERS } from './classify.ts'
import { CasFailed, GitFailed, PayloadUnreadable, RefNotFound } from './errors.ts'
import {
  client,
  failureResult,
  failureStderr,
  sleepSync,
  stderrOrError,
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
   * state. The write itself succeeded. See {@link casReplace}.
   */
  onMirrorSkip?: (skip: MirrorSkip) => void
}

function casPush(
  op: 'create' | 'replace' | 'delete',
  label: string,
  argv: string[],
  ref: string,
  expectedSha: string | null,
  newSha: string | null,
  opts: CasOptions,
): void {
  const proc = client(opts).raw(argv)
  switch (classifyPush(op, proc)) {
    case 'ok':
      return
    case 'cas-failed': {
      const detail =
        proc.exitCode === 0
          ? `ref already exists at authority with the same sha ${JSON.stringify(newSha)}`
          : expectedSha === null
            ? `ref already exists at authority (stderr: ${proc.stderr.trim()})`
            : `expected_sha=${JSON.stringify(expectedSha)} (stderr: ${proc.stderr.trim()})`
      throw new CasFailed({
        ref,
        expectedSha,
        actualSha: proc.exitCode === 0 ? newSha : null,
        message: `${label} failed on ref ${JSON.stringify(ref)}: ${detail}`,
      })
    }
    case 'git-failed': {
      const stderr = stderrOrError(proc)
      throw new GitFailed({
        op: label,
        exitCode: proc.exitCode,
        stderr,
        message:
          `git push failed for ${label} on ${JSON.stringify(ref)}: ` +
          `exit=${proc.exitCode} stderr=${JSON.stringify(stderr)}`,
      })
    }
  }
}

/**
 * Bring this repository's local mirror of `ref` from `oldSha` (`null` for a
 * create) to what the authority now holds, so a reader of local refs sees the
 * write without a fetch. `newSha: null` removes the mirror.
 *
 * The update is guarded: `update-ref <ref> <new> <old>`, or `-d <ref> <old>`.
 * Worktrees share one ref store, so another process may have moved the mirror
 * between this write landing at the authority and this call. The guard leaves
 * that newer value alone instead of rewinding it; the next write or fetch
 * corrects the mirror. A failed update never fails the write, which has
 * already succeeded: it is reported to `onMirrorSkip`.
 */
function syncLocalMirror(
  ref: string,
  oldSha: string | null,
  newSha: string | null,
  opts: CasOptions,
): void {
  const zero = '0'.repeat((newSha ?? oldSha ?? '').length || 40)
  const old = oldSha ?? zero
  const argv = newSha === null ? ['update-ref', '-d', ref, old] : ['update-ref', ref, newSha, old]
  if (client(opts).raw(argv).exitCode !== 0) {
    opts.onMirrorSkip?.({ ref, expectedSha: old, newSha })
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
 */
export function casCreate(
  authority: string,
  ref: string,
  newSha: string,
  opts: CasOptions = {},
): void {
  casPush(
    'create',
    'CAS-CREATE',
    ['push', `--force-with-lease=${ref}:`, authority, `${newSha}:${ref}`],
    ref,
    null,
    newSha,
    opts,
  )
  syncLocalMirror(ref, null, newSha, opts)
}

/**
 * Move `ref` at the authority from `expectedSha` to `newSha`, only if it still
 * points at `expectedSha`. `newSha` is usually a commit whose parent is
 * `expectedSha` (see `buildLeaseCommit`), so the ref's log is the lease's
 * history, but the protocol does not require it.
 *
 * On success the local mirror of the ref moves too, unless another process
 * moved it first; then `opts.onMirrorSkip` is told.
 *
 * @throws CasFailed when the ref is not at `expectedSha`, or is gone.
 * @throws GitFailed for any other git failure.
 */
export function casReplace(
  authority: string,
  ref: string,
  expectedSha: string,
  newSha: string,
  opts: CasOptions = {},
): void {
  casPush(
    'replace',
    'CAS-REPLACE',
    ['push', `--force-with-lease=${ref}:${expectedSha}`, authority, `${newSha}:${ref}`],
    ref,
    expectedSha,
    newSha,
    opts,
  )
  syncLocalMirror(ref, expectedSha, newSha, opts)
}

/**
 * Delete `ref` at the authority, only if it still points at `expectedSha`.
 *
 * @throws CasFailed when the ref is not at `expectedSha`, or is already gone.
 * @throws GitFailed for any other git failure.
 */
export function casDelete(
  authority: string,
  ref: string,
  expectedSha: string,
  opts: CasOptions = {},
): void {
  casPush(
    'delete',
    'CAS-DELETE',
    ['push', `--force-with-lease=${ref}:${expectedSha}`, authority, `:${ref}`],
    ref,
    expectedSha,
    null,
    opts,
  )
  syncLocalMirror(ref, expectedSha, null, opts)
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
    if (!hasMarker(failureResult(out.error).stderr, LOCAL_LOCK_MARKERS)) return out
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
 */
export function fetchRef<T = unknown>(
  authority: string,
  ref: string,
  opts: FetchRefOptions<T> = {},
): FetchedRef<T> {
  const git = client(opts)
  const payloadFile = opts.payloadFile ?? DEFAULT_PAYLOAD_FILE
  const fetched = fetchWithLockRetry(() =>
    git.try.fetch(authority, `+${ref}:${ref}`, { noWriteFetchHead: true }),
  )
  if (!fetched.ok) {
    const res = failureResult(fetched.error)
    if (classifyFetchFailure(res.stderr) === 'ref-not-found') throw new RefNotFound({ ref })
    const stderr = failureStderr(fetched.error)
    throw new GitFailed({
      op: 'FETCH-REF',
      exitCode: res.exitCode,
      stderr,
      message:
        `git fetch failed for FETCH-REF on ${JSON.stringify(ref)}: ` +
        `exit=${res.exitCode} stderr=${JSON.stringify(stderr)}`,
    })
  }
  // The fetch succeeded but left no local ref: treat it as not found.
  const rev = git.try.resolveRef(ref)
  if (!rev.ok || rev.value === null) throw new RefNotFound({ ref })
  const sha = rev.value
  // `showAtRev` declares a missing path absent, so it is null rather than a throw.
  const show = git.try.showAtRev(sha, payloadFile)
  const raw = show.ok ? show.value : null
  if (raw === null) {
    const detail = show.ok
      ? `no ${payloadFile} in that commit`
      : `exit=${failureResult(show.error).exitCode} ` +
        `stderr=${JSON.stringify(failureStderr(show.error))}`
    throw new PayloadUnreadable({
      ref,
      sha,
      message: `git show failed reading ${payloadFile} at ${JSON.stringify(sha)}: ${detail}`,
    })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
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
 * pruning local refs the authority no longer has) and list them. A prefix with
 * no refs gives `{}`.
 *
 * @param prefix A ref path such as `refs/locks`; a trailing `/` is ignored.
 * @returns Each ref under the prefix, mapped to the sha it points at.
 * @throws GitFailed when git fails.
 */
export function fetchNamespace(
  authority: string,
  prefix: string,
  opts: GitOptions = {},
): Record<string, string> {
  const base = prefix.replace(/\/+$/, '')
  const git = client(opts)
  const fetched = fetchWithLockRetry(() =>
    git.try.fetch(authority, `+${base}/*:${base}/*`, { prune: true, noWriteFetchHead: true }),
  )
  if (!fetched.ok) {
    const res = failureResult(fetched.error)
    const stderr = failureStderr(fetched.error)
    throw new GitFailed({
      op: 'FETCH-NAMESPACE',
      exitCode: res.exitCode,
      stderr,
      message:
        `git fetch failed for FETCH-NAMESPACE on prefix ${JSON.stringify(base)}: ` +
        `exit=${res.exitCode} stderr=${JSON.stringify(stderr)}`,
    })
  }
  const listing = git.try.refs(base)
  if (!listing.ok) {
    const res = failureResult(listing.error)
    const stderr = failureStderr(listing.error)
    throw new GitFailed({
      op: 'FETCH-NAMESPACE',
      exitCode: res.exitCode,
      stderr,
      message:
        `git for-each-ref failed on prefix ${JSON.stringify(base)}: ` +
        `exit=${res.exitCode} stderr=${JSON.stringify(stderr)}`,
    })
  }
  const result: Record<string, string> = {}
  for (const { ref, sha } of listing.value) {
    if (ref !== '' && sha !== '') result[ref] = sha
  }
  return result
}
