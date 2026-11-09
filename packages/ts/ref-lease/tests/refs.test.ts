import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  buildLeaseCommit,
  casCreate,
  casDelete,
  casReplace,
  checkNamespaceConflict,
  fetchNamespace,
  fetchRef,
} from '@osdlc/ref-lease'

import { makePair, REF, type Pair } from './_fixture.ts'

let env: Pair
beforeEach(() => {
  env = makePair()
})
afterEach(() => {
  env.cleanup()
})

describe('refs outside a namespace of your own are refused before git runs', () => {
  test.each(['refs/heads', 'refs/heads/', 'refs/tags', 'refs/remotes/origin', 'refs', 'locks'])(
    'fetchNamespace(%j)',
    (prefix) => {
      expect(() => fetchNamespace(env.authority, prefix, { cwd: env.worker })).toThrow(TypeError)
    },
  )

  test('fetchNamespace on refs/heads would have deleted local branches; it does not run', () => {
    const before = env.workerGit.resolveRef('refs/heads/main')
    expect(before).not.toBeNull()
    expect(() => fetchNamespace(env.authority, 'refs/heads', { cwd: env.worker })).toThrow(
      /holds your own refs/,
    )
    expect(env.workerGit.resolveRef('refs/heads/main')).toBe(before)
  })

  test.each(['refs/heads/main', 'refs/tags/v1', 'locks/x'])('every operation refuses %j', (ref) => {
    const sha = buildLeaseCommit({}, { cwd: env.worker })
    const cwd = { cwd: env.worker }
    expect(() => casCreate(env.authority, ref, sha, cwd)).toThrow(TypeError)
    expect(() => casReplace(env.authority, ref, sha, sha, cwd)).toThrow(TypeError)
    expect(() => casDelete(env.authority, ref, sha, cwd)).toThrow(TypeError)
    expect(() => fetchRef(env.authority, ref, cwd)).toThrow(TypeError)
  })

  test('checkNamespaceConflict refuses a reserved namespace', () => {
    expect(() => checkNamespaceConflict(env.authority, 'refs/heads', { cwd: env.worker })).toThrow(
      TypeError,
    )
  })
})

describe('shas must be full lowercase object ids', () => {
  test.each([
    ['abbreviated', (sha: string) => sha.slice(0, 12)],
    ['upper case', (sha: string) => sha.toUpperCase()],
    ['empty', () => ''],
  ])('%s', (_name, mangle) => {
    const sha = buildLeaseCommit({}, { cwd: env.worker })
    const cwd = { cwd: env.worker }
    expect(() => casCreate(env.authority, REF, mangle(sha), cwd)).toThrow(TypeError)
    expect(() => casReplace(env.authority, REF, mangle(sha), sha, cwd)).toThrow(TypeError)
    expect(() => casDelete(env.authority, REF, mangle(sha), cwd)).toThrow(TypeError)
  })
})
