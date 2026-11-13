/**
 * The three patterns every lease user writes: read-modify-write with retry, claim (or take over),
 * and pinned release. They are built from the five operations and take every payload rule as a
 * callback, so the library still never reads a payload (D-04): what "live", "mine" and "the next
 * value" mean is the caller's.
 *
 * Each retries a lost compare-and-swap by reading the ref again, a bounded number of times. A
 * caller that wants a different policy uses the five operations directly.
 */

import { buildLeaseCommit, type LeaseIdentity } from './commit.ts'
import { CasFailed, PayloadUnreadable, RefNotFound } from './errors.ts'
import { sleepSync, type GitOptions } from './git.ts'
import { casCreate, casDelete, casReplace, fetchRef } from './primitives.ts'

export const DEFAULT_ATTEMPTS = 5

/** Options shared by {@link updateWithRetry} and {@link claim}. */
export interface RetryOptions<T> extends GitOptions {
  /** Turns the parsed payload into `T`; see `fetchRef`. */
  decode: (value: unknown) => T
  /** Most passes, each reading the ref again. Default 5. */
  attempts?: number
  /** Milliseconds to wait after a lost swap, given the pass number (1 for the first). Default none. */
  backoffMs?: (attempt: number) => number
  /** The blob name for the payload. Default `lease.json`. */
  payloadFile?: string
  identity?: LeaseIdentity
}

/** What {@link updateWithRetry} did. */
export type UpdateOutcome<T> =
  | { kind: 'written'; sha: string; payload: T }
  | { kind: 'deleted' }
  /** The ref was absent and `change` returned `null`: nothing to do. */
  | { kind: 'unchanged' }

function commitOptions<T>(opts: RetryOptions<T>, parentSha: string | null) {
  return {
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
    ...(opts.payloadFile === undefined ? {} : { payloadFile: opts.payloadFile }),
    ...(opts.identity === undefined ? {} : { identity: opts.identity }),
    parentSha,
  }
}

function pause<T>(opts: RetryOptions<T>, attempt: number): void {
  const ms = opts.backoffMs?.(attempt) ?? 0
  if (ms > 0) sleepSync(ms)
}

/** The ref's sha and payload, `null` when absent, `unreadable` when it holds no usable payload. */
function read<T>(
  authority: string,
  ref: string,
  opts: RetryOptions<T>,
): { sha: string; payload: T } | { sha: string; payload: null } | null {
  try {
    return fetchRef<T>(authority, ref, {
      ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
      ...(opts.env === undefined ? {} : { env: opts.env }),
      ...(opts.payloadFile === undefined ? {} : { payloadFile: opts.payloadFile }),
      decode: opts.decode,
    })
  } catch (e) {
    if (e instanceof RefNotFound) return null
    if (e instanceof PayloadUnreadable) return { sha: e.sha, payload: null }
    throw e
  }
}

/**
 * Change a ref's payload by read-modify-write, retrying when another writer gets in between. Each
 * pass reads the ref again, so `change` always sees what is really there.
 *
 * `change` gets `null` when the ref is absent (so the write is a create), and the current payload
 * otherwise. An unreadable payload reaches it as `null` too, and the write then replaces it.
 * Returning `null` deletes the ref (nothing to do when it is already absent).
 *
 * @throws CasFailed when every pass lost its swap.
 */
export function updateWithRetry<T>(
  authority: string,
  ref: string,
  change: (current: { sha: string; payload: T } | null) => T | null,
  opts: RetryOptions<T>,
): UpdateOutcome<T> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS
  for (let attempt = 1; ; attempt++) {
    const got = read(authority, ref, opts)
    const current =
      got === null || got.payload === null ? null : { sha: got.sha, payload: got.payload }
    const next = change(current)
    try {
      if (next === null) {
        if (got === null) return { kind: 'unchanged' }
        casDelete(authority, ref, got.sha, opts)
        return { kind: 'deleted' }
      }
      const sha = buildLeaseCommit(next, commitOptions(opts, got?.sha ?? null))
      if (got === null) casCreate(authority, ref, sha, opts)
      else casReplace(authority, ref, got.sha, sha, opts)
      return { kind: 'written', sha, payload: next }
    } catch (e) {
      if (!(e instanceof CasFailed) || attempt >= attempts) throw e
      pause(opts, attempt)
    }
  }
}

/** Options for {@link claim}. */
export interface ClaimOptions<T> extends RetryOptions<T> {
  /** The payload to write, given the lease being replaced (`null` for a create). */
  build: (previous: T | null) => T
  /** True while `current` still holds the lease. A lease that is not live may be taken over. */
  isLive: (current: T) => boolean
  /** True when `current` is this caller's own, such as a leftover of a crashed run. Taken over even if live. */
  isMine?: (current: T) => boolean
}

/** What {@link claim} found. `payload` of a loss is the lease that is held. */
export type ClaimResult<T> = { won: true; sha: string; payload: T } | { won: false; payload: T }

/**
 * Take `ref`, or take it over. Creates the ref when nobody has it. Otherwise reads the lease and
 * replaces it, only if it is still the lease that was read, when it is not live or is this
 * caller's own. Otherwise reports the lease that is held. A payload that cannot be read counts as
 * not live. A lost swap reads again, up to `attempts` passes.
 *
 * @throws CasFailed when every pass lost its swap.
 */
export function claim<T>(authority: string, ref: string, opts: ClaimOptions<T>): ClaimResult<T> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS
  for (let attempt = 1; ; attempt++) {
    const got = read(authority, ref, opts)
    const held = got?.payload ?? null
    if (held !== null && opts.isLive(held) && !(opts.isMine?.(held) ?? false)) {
      return { won: false, payload: held }
    }
    const payload = opts.build(held)
    try {
      const sha = buildLeaseCommit(payload, commitOptions(opts, got?.sha ?? null))
      if (got === null) casCreate(authority, ref, sha, opts)
      else casReplace(authority, ref, got.sha, sha, opts)
      return { won: true, sha, payload }
    } catch (e) {
      if (!(e instanceof CasFailed) || attempt >= attempts) throw e
      pause(opts, attempt)
    }
  }
}

/**
 * Give up a lease: delete `ref`, only if it still points at `sha`, the commit this caller wrote.
 * Returns whether it deleted. A lost swap or an already-absent ref is `false`: the lease is no
 * longer this caller's. Any other failure throws.
 */
export function release(
  authority: string,
  ref: string,
  sha: string,
  opts: GitOptions = {},
): boolean {
  try {
    casDelete(authority, ref, sha, opts)
    return true
  } catch (e) {
    if (e instanceof CasFailed) return false
    throw e
  }
}
