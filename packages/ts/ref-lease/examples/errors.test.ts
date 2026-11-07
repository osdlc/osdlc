// Branch on the error class, or on `kind`, which is the same in every implementation.

import { makeBareAndWorker } from '@osdlc/typed-git/testing'
import { afterAll, expect, test } from 'vitest'

import {
  buildLeaseCommit,
  casCreate,
  fetchRef,
  GitFailed,
  PayloadUnreadable,
  RefLeaseError,
  type RefLeaseErrorKind,
} from '@osdlc/ref-lease'

const { bare, worker, cleanup } = makeBareAndWorker()
worker.commit('init', { '.gitkeep': '' })
afterAll(cleanup)

// #region handle-errors
/** What to tell an operator, and whether trying again can help. */
function explain(e: unknown): { message: string; retry: boolean } {
  if (!(e instanceof RefLeaseError)) throw e // not ours: a bug, let it surface
  switch (e.kind) {
    case 'cas-failed':
      return { message: 'someone else changed the lease first; read it again', retry: true }
    case 'ref-not-found':
      return { message: 'there is no such lease', retry: false }
    case 'git-failed':
      return { message: `git failed: ${(e as GitFailed).stderr}`, retry: false }
    case 'payload-unreadable':
      return { message: `the lease commit is damaged: ${e.message}`, retry: false }
    case 'namespace-conflict':
      return { message: e.message, retry: false }
    default:
      return { message: e.message, retry: false }
  }
}
// #endregion handle-errors

function kindOf(fn: () => unknown): RefLeaseErrorKind | undefined {
  try {
    fn()
  } catch (e) {
    if (!(e instanceof RefLeaseError)) throw e
    return e.kind
  }
  return undefined
}

test('an unreachable authority is a GitFailed carrying git’s stderr', () => {
  try {
    fetchRef('/nonexistent/authority.git', 'refs/locks/x', { cwd: worker.dir })
    expect.unreachable()
  } catch (e) {
    expect(e).toBeInstanceOf(GitFailed)
    expect((e as GitFailed).stderr).toMatch(/does not appear to be a git repository/)
  }
})

test('a commit without the payload file is PayloadUnreadable', () => {
  const sha = buildLeaseCommit({}, { cwd: worker.dir, payloadFile: 'other.json' })
  casCreate(bare.dir, 'refs/locks/odd', sha, { cwd: worker.dir })
  expect(kindOf(() => fetchRef(bare.dir, 'refs/locks/odd', { cwd: worker.dir }))).toBe(
    'payload-unreadable',
  )
  expect(() => fetchRef(bare.dir, 'refs/locks/odd', { cwd: worker.dir })).toThrow(PayloadUnreadable)
})

test('a missing ref is ref-not-found', () => {
  expect(kindOf(() => fetchRef(bare.dir, 'refs/locks/none', { cwd: worker.dir }))).toBe(
    'ref-not-found',
  )
})

test('explain: a lost race is worth retrying, a git failure is not', () => {
  const sha = buildLeaseCommit({}, { cwd: worker.dir })
  casCreate(bare.dir, 'refs/locks/raced', sha, { cwd: worker.dir })
  let lost: unknown
  try {
    casCreate(bare.dir, 'refs/locks/raced', sha, { cwd: worker.dir })
  } catch (e) {
    lost = e
  }
  expect(explain(lost).retry).toBe(true)
  let broken: unknown
  try {
    fetchRef('/nonexistent/authority.git', 'refs/locks/x', { cwd: worker.dir })
  } catch (e) {
    broken = e
  }
  expect(explain(broken)).toMatchObject({ retry: false })
  expect(explain(broken).message).toMatch(/^git failed: /)
})
