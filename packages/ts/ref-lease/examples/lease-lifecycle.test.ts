// A lease on a build cache: claim it, renew it, lose a race, release it.
// The README's quick start is taken from this file.

import { makeBareAndWorker } from '@osdlc/typed-git/testing'
import { afterAll, expect, test } from 'vitest'

// #region quick-start
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

interface CacheLease {
  holder: string
  expiresAt: string
}

const decode = (v: unknown): CacheLease => {
  const o = v as Partial<CacheLease>
  if (typeof o.holder !== 'string' || typeof o.expiresAt !== 'string') {
    throw new TypeError('not a cache lease')
  }
  return { holder: o.holder, expiresAt: o.expiresAt }
}

/** Claim `ref` for `holder`, or return the current holder when someone else has it. */
function claim(authority: string, ref: string, holder: string, cwd: string): string {
  const sha = buildLeaseCommit({ holder, expiresAt: '2026-11-07T12:00:00Z' }, { cwd })
  try {
    casCreate(authority, ref, sha, { cwd })
    return holder
  } catch (e) {
    if (!(e instanceof CasFailed)) throw e
    return fetchRef(authority, ref, { cwd, decode }).payload.holder
  }
}
// #endregion quick-start

const { bare, worker, cleanup } = makeBareAndWorker()
worker.commit('init', { '.gitkeep': '' })
afterAll(cleanup)
const authority = bare.dir
const cwd = worker.dir
const ref = 'refs/locks/build-cache'

test('claim: the first caller gets the lease, the second sees who holds it', () => {
  expect(claim(authority, ref, 'worker-a', cwd)).toBe('worker-a')
  expect(claim(authority, ref, 'worker-b', cwd)).toBe('worker-a')
})

test('renew: replace from the sha you read, chaining the commit to it', () => {
  const { sha, payload } = fetchRef(authority, ref, { cwd, decode })
  const renewed = buildLeaseCommit(
    { ...payload, expiresAt: '2026-11-07T13:00:00Z' },
    { cwd, parentSha: sha },
  )
  casReplace(authority, ref, sha, renewed, { cwd })
  expect(fetchRef(authority, ref, { cwd, decode }).payload.expiresAt).toBe('2026-11-07T13:00:00Z')

  // A second writer still holding the old sha loses.
  const stale = buildLeaseCommit({ holder: 'worker-b', expiresAt: 'x' }, { cwd, parentSha: sha })
  expect(() => casReplace(authority, ref, sha, stale, { cwd })).toThrow(CasFailed)
})

test('list and release: every lease under a prefix, then delete from the sha you read', () => {
  const leases = fetchNamespace(authority, 'refs/locks', { cwd })
  expect(Object.keys(leases)).toEqual([ref])
  casDelete(authority, ref, leases[ref]!, { cwd })
  expect(() => fetchRef(authority, ref, { cwd })).toThrow(RefNotFound)
})
