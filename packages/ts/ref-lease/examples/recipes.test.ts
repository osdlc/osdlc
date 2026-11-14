// The recipes in docs/guide/recipes.md, as running code. Each region below is
// copied into the guide; the tests underneath prove it does what the guide says.

import { makeBareAndWorker } from '@osdlc/typed-git/testing'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'

import {
  buildLeaseCommit,
  casCreate,
  casDelete,
  casReplace,
  CasFailed,
  claim,
  fetchNamespace,
  fetchRef,
  RefNotFound,
  release,
  updateWithRetry,
} from '@osdlc/ref-lease'

// #region lease-type
/** What this application stores in each lease. The library never reads it. */
interface Lease {
  holder: string
  /** ISO 8601. After this time anyone may take the lease over. */
  expiresAt: string
}

function decode(value: unknown): Lease {
  const v = value as Partial<Lease>
  if (typeof v.holder !== 'string' || typeof v.expiresAt !== 'string') {
    throw new TypeError('not a lease')
  }
  return { holder: v.holder, expiresAt: v.expiresAt }
}

const inMinutes = (now: Date, minutes: number) =>
  new Date(now.getTime() + minutes * 60_000).toISOString()
// #endregion lease-type

// #region claim
/**
 * Take `ref` for `holder`, or take it over when the current lease has expired.
 * The library does the create, the read and the guarded replace, and looks again
 * when another caller moves first. The meaning of "expired" is the callback's.
 */
function takeLease(
  authority: string,
  ref: string,
  holder: string,
  opts: { cwd: string; now: Date; ttlMinutes: number },
) {
  return claim<Lease>(authority, ref, {
    cwd: opts.cwd,
    decode,
    build: () => ({ holder, expiresAt: inMinutes(opts.now, opts.ttlMinutes) }),
    isLive: (lease) => new Date(lease.expiresAt) > opts.now,
    isMine: (lease) => lease.holder === holder, // a leftover of our own run
  })
}
// #endregion claim

// #region renew
/**
 * Push the expiry out. `sha` is the lease commit you last wrote. If the replace
 * fails, someone else holds the lease now: stop the work it protects.
 */
function renew(
  authority: string,
  ref: string,
  sha: string,
  lease: Lease,
  opts: { cwd: string; now: Date; ttlMinutes: number },
): string {
  const next = buildLeaseCommit(
    { ...lease, expiresAt: inMinutes(opts.now, opts.ttlMinutes) },
    { cwd: opts.cwd, parentSha: sha },
  )
  casReplace(authority, ref, sha, next, { cwd: opts.cwd }) // throws CasFailed if we lost it
  return next
}
// #endregion renew

// #region release
/**
 * Give the lease up, only if it is still the one we hold, keeping its history
 * under an archive ref. The archive goes first, so a crash between the two
 * pushes leaves the history kept; if the delete then finds the lease is no
 * longer ours, the archive is taken back.
 */
function releaseKeepingHistory(authority: string, ref: string, sha: string, cwd: string): void {
  const archive = `refs/lease-archive/${ref.replace(/^refs\//, '')}/${sha.slice(0, 12)}`
  casCreate(authority, archive, sha, { cwd })
  try {
    casDelete(authority, ref, sha, { cwd }) // only if it is still ours
  } catch (e) {
    casDelete(authority, archive, sha, { cwd }) // we released nothing: drop the archive
    throw e
  }
}
// #endregion release

// #region list
/** Every live lease under `prefix`, with its holder. */
function listLeases(authority: string, prefix: string, cwd: string): Map<string, Lease> {
  const leases = new Map<string, Lease>()
  for (const ref of Object.keys(fetchNamespace(authority, prefix, { cwd }))) {
    try {
      leases.set(ref, fetchRef(authority, ref, { cwd, decode }).payload)
    } catch (e) {
      if (!(e instanceof RefNotFound)) throw e // released between the two calls
    }
  }
  return leases
}
// #endregion list

// #region update-with-retry
/**
 * Change a lease's payload with read-modify-write. The library re-reads and tries
 * again when another writer gets in between, so `change` always sees the latest lease.
 */
function updateLease(
  authority: string,
  ref: string,
  change: (lease: Lease) => Lease,
  opts: { cwd: string; attempts?: number },
): Lease {
  const out = updateWithRetry<Lease>(
    authority,
    ref,
    (current) => {
      if (current === null) throw new Error(`no lease at ${ref}`)
      return change(current.payload)
    },
    { cwd: opts.cwd, decode, attempts: opts.attempts ?? 5 },
  )
  if (out.kind !== 'written') throw new Error('unreachable: change never returns null')
  return out.payload
}
// #endregion update-with-retry

// #region release-pinned
/** Give the lease up if `sha` is still the one we hold. False means it is no longer ours. */
const giveUp = (authority: string, ref: string, sha: string, cwd: string): boolean =>
  release(authority, ref, sha, { cwd })
// #endregion release-pinned

// #region test-fixture
const { bare, worker, cleanup } = makeBareAndWorker()
worker.commit('init', { '.gitkeep': '' })
afterAll(cleanup)
const authority = bare.dir
const cwd = worker.dir
// #endregion test-fixture
const t0 = new Date('2026-11-07T12:00:00Z')
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000)

describe('recipes', () => {
  let n = 0
  let ref: string
  beforeEach(() => {
    ref = `refs/locks/job-${++n}`
  })

  test('claim: first caller wins, a second sees the holder', () => {
    expect(takeLease(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 }).won).toBe(true)
    expect(takeLease(authority, ref, 'b', { cwd, now: at(5), ttlMinutes: 10 })).toMatchObject({
      won: false,
      payload: { holder: 'a' },
    })
  })

  test('claim: an expired lease is taken over', () => {
    takeLease(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    expect(takeLease(authority, ref, 'b', { cwd, now: at(11), ttlMinutes: 10 }).won).toBe(true)
    expect(fetchRef(authority, ref, { cwd, decode }).payload.holder).toBe('b')
  })

  test('renew: the holder pushes the expiry out; a stale holder is told it lost', () => {
    const won = takeLease(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    if (!won.won) throw new Error('expected to win')
    const lease = fetchRef(authority, ref, { cwd, decode }).payload
    const renewed = renew(authority, ref, won.sha, lease, { cwd, now: at(8), ttlMinutes: 10 })
    expect(fetchRef(authority, ref, { cwd, decode }).payload.expiresAt).toBe(at(18).toISOString())
    // Renewing again from the old sha fails: that is no longer the lease.
    expect(() =>
      renew(authority, ref, won.sha, lease, { cwd, now: at(9), ttlMinutes: 10 }),
    ).toThrow(CasFailed)
    expect(renewed).not.toBe(won.sha)
  })

  test('release: the lease goes, its history stays under the archive ref', () => {
    const won = takeLease(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    if (!won.won) throw new Error('expected to win')
    releaseKeepingHistory(authority, ref, won.sha, cwd)
    expect(() => fetchRef(authority, ref, { cwd })).toThrow(RefNotFound)
    const archived = fetchNamespace(authority, 'refs/lease-archive', { cwd })
    expect(Object.values(archived)).toContain(won.sha)
  })

  test('release: a lease someone else took over is not deleted or archived', () => {
    const won = takeLease(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    if (!won.won) throw new Error('expected to win')
    takeLease(authority, ref, 'b', { cwd, now: at(11), ttlMinutes: 10 })
    expect(() => releaseKeepingHistory(authority, ref, won.sha, cwd)).toThrow(CasFailed)
    expect(fetchRef(authority, ref, { cwd, decode }).payload.holder).toBe('b')
    const archive = `refs/lease-archive/${ref.replace(/^refs\//, '')}/${won.sha.slice(0, 12)}`
    expect(Object.keys(fetchNamespace(authority, 'refs/lease-archive', { cwd }))).not.toContain(
      archive,
    )
  })

  test('claim: a released lease can be claimed again', () => {
    const won = takeLease(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    if (!won.won) throw new Error('expected to win')
    releaseKeepingHistory(authority, ref, won.sha, cwd)
    expect(takeLease(authority, ref, 'b', { cwd, now: at(1), ttlMinutes: 10 }).won).toBe(true)
  })

  test('list: every live lease with its holder', () => {
    takeLease(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    const leases = listLeases(authority, 'refs/locks', cwd)
    expect(leases.get(ref)?.holder).toBe('a')
  })

  test('update with retry: a writer that loses a race re-reads and tries again', () => {
    takeLease(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    let raced = false
    const result = updateLease(
      authority,
      ref,
      (lease) => {
        if (!raced) {
          // Another writer moves the lease while we are deciding.
          raced = true
          updateLease(authority, ref, (l) => ({ ...l, holder: 'b' }), { cwd })
        }
        return { ...lease, expiresAt: at(30).toISOString() }
      },
      { cwd },
    )
    expect(result.holder).toBe('b') // the second attempt saw the other writer's change
    expect(fetchRef(authority, ref, { cwd, decode }).payload).toEqual(result)
  })

  test('release: pinned to our sha; false once the lease is ours no longer', () => {
    const won = takeLease(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    if (!won.won) throw new Error('expected to win')
    takeLease(authority, ref, 'b', { cwd, now: at(11), ttlMinutes: 10 })
    expect(giveUp(authority, ref, won.sha, cwd)).toBe(false)
    expect(fetchRef(authority, ref, { cwd, decode }).payload.holder).toBe('b')
  })
})
