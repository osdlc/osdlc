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
  fetchNamespace,
  fetchRef,
  RefNotFound,
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
type ClaimResult = { won: true; sha: string } | { won: false; holder: string }

/**
 * Take `ref` for `holder`, or take it over when the current lease has expired.
 * Returns who holds it afterwards.
 */
function claim(
  authority: string,
  ref: string,
  holder: string,
  opts: { cwd: string; now: Date; ttlMinutes: number },
): ClaimResult {
  const { cwd, now } = opts
  const payload: Lease = { holder, expiresAt: inMinutes(now, opts.ttlMinutes) }

  // The lease can change between any two calls: created, taken over, released.
  // Each pass looks again, so a few passes settle every such race.
  for (let attempt = 1; attempt <= 3; attempt++) {
    // 1. Nobody holds it: create the ref. Exactly one concurrent caller wins.
    try {
      const sha = buildLeaseCommit(payload, { cwd })
      casCreate(authority, ref, sha, { cwd })
      return { won: true, sha }
    } catch (e) {
      if (!(e instanceof CasFailed)) throw e
    }

    // 2. Somebody holds it. Read the lease and the sha it sits at.
    let current
    try {
      current = fetchRef(authority, ref, { cwd, decode })
    } catch (e) {
      if (e instanceof RefNotFound) continue // released meanwhile: try the create again
      throw e
    }
    if (new Date(current.payload.expiresAt) > now) {
      return { won: false, holder: current.payload.holder }
    }

    // 3. It has expired: replace it, but only if it is still the lease we read.
    try {
      const sha = buildLeaseCommit(payload, { cwd, parentSha: current.sha })
      casReplace(authority, ref, current.sha, sha, { cwd })
      return { won: true, sha }
    } catch (e) {
      if (!(e instanceof CasFailed)) throw e // someone else moved first: look again
    }
  }
  throw new Error(`the lease at ${ref} keeps changing; try again later`)
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
function release(authority: string, ref: string, sha: string, cwd: string): void {
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
 * Change a lease's payload with read-modify-write, retrying when another writer
 * gets in between. Each attempt re-reads, so `change` always sees the latest lease.
 */
function updateWithRetry(
  authority: string,
  ref: string,
  change: (lease: Lease) => Lease,
  opts: { cwd: string; attempts?: number },
): Lease {
  const { cwd, attempts = 5 } = opts
  for (let attempt = 1; ; attempt++) {
    const current = fetchRef(authority, ref, { cwd, decode })
    const next = change(current.payload)
    try {
      casReplace(
        authority,
        ref,
        current.sha,
        buildLeaseCommit(next, { cwd, parentSha: current.sha }),
        { cwd },
      )
      return next
    } catch (e) {
      if (!(e instanceof CasFailed) || attempt >= attempts) throw e
    }
  }
}
// #endregion update-with-retry

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
    expect(claim(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 }).won).toBe(true)
    expect(claim(authority, ref, 'b', { cwd, now: at(5), ttlMinutes: 10 })).toEqual({
      won: false,
      holder: 'a',
    })
  })

  test('claim: an expired lease is taken over', () => {
    claim(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    expect(claim(authority, ref, 'b', { cwd, now: at(11), ttlMinutes: 10 }).won).toBe(true)
    expect(fetchRef(authority, ref, { cwd, decode }).payload.holder).toBe('b')
  })

  test('renew: the holder pushes the expiry out; a stale holder is told it lost', () => {
    const won = claim(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
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
    const won = claim(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    if (!won.won) throw new Error('expected to win')
    release(authority, ref, won.sha, cwd)
    expect(() => fetchRef(authority, ref, { cwd })).toThrow(RefNotFound)
    const archived = fetchNamespace(authority, 'refs/lease-archive', { cwd })
    expect(Object.values(archived)).toContain(won.sha)
  })

  test('release: a lease someone else took over is not deleted or archived', () => {
    const won = claim(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    if (!won.won) throw new Error('expected to win')
    claim(authority, ref, 'b', { cwd, now: at(11), ttlMinutes: 10 })
    expect(() => release(authority, ref, won.sha, cwd)).toThrow(CasFailed)
    expect(fetchRef(authority, ref, { cwd, decode }).payload.holder).toBe('b')
    const archive = `refs/lease-archive/${ref.replace(/^refs\//, '')}/${won.sha.slice(0, 12)}`
    expect(Object.keys(fetchNamespace(authority, 'refs/lease-archive', { cwd }))).not.toContain(
      archive,
    )
  })

  test('claim: a released lease can be claimed again', () => {
    const won = claim(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    if (!won.won) throw new Error('expected to win')
    release(authority, ref, won.sha, cwd)
    expect(claim(authority, ref, 'b', { cwd, now: at(1), ttlMinutes: 10 }).won).toBe(true)
  })

  test('list: every live lease with its holder', () => {
    claim(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    const leases = listLeases(authority, 'refs/locks', cwd)
    expect(leases.get(ref)?.holder).toBe('a')
  })

  test('update with retry: a writer that loses a race re-reads and tries again', () => {
    claim(authority, ref, 'a', { cwd, now: t0, ttlMinutes: 10 })
    let raced = false
    const result = updateWithRetry(
      authority,
      ref,
      (lease) => {
        if (!raced) {
          // Another writer moves the lease while we are deciding.
          raced = true
          updateWithRetry(authority, ref, (l) => ({ ...l, holder: 'b' }), { cwd })
        }
        return { ...lease, expiresAt: at(30).toISOString() }
      },
      { cwd },
    )
    expect(result.holder).toBe('b') // the second attempt saw the other writer's change
    expect(fetchRef(authority, ref, { cwd, decode }).payload).toEqual(result)
  })
})
