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
