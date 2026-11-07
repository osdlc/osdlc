import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  buildLeaseCommit,
  casCreate,
  checkNamespaceConflict,
  GitFailed,
  NamespaceConflict,
} from '@osdlc/ref-lease'

import { makePair, type Pair } from './_fixture.ts'

/**
 * Put a literal ref at `ref` on the authority. receive-pack refuses a push to a
 * ref with one segment after `refs/` ("funny refname"), so such a ref is made at
 * the authority itself, as an admin or another tool would.
 */
function literalRefAtAuthority(ref: string, sha: string): void {
  env.workerGit.rawChecked(['push', env.authority, `${sha}:refs/scratch/seed`])
  env.authorityGit.rawChecked(['update-ref', ref, sha])
}

let env: Pair
beforeEach(() => {
  env = makePair()
})
afterEach(() => {
  env.cleanup()
})

test('an empty authority passes', () => {
  expect(() =>
    checkNamespaceConflict(env.authority, 'refs/locks', { cwd: env.worker }),
  ).not.toThrow()
})

test('refs under the namespace pass', () => {
  casCreate(env.authority, 'refs/locks/a', buildLeaseCommit({}, { cwd: env.worker }), {
    cwd: env.worker,
  })
  expect(() =>
    checkNamespaceConflict(env.authority, 'refs/locks', { cwd: env.worker }),
  ).not.toThrow()
})

test('a literal ref at the namespace path raises NamespaceConflict', () => {
  const sha = buildLeaseCommit({}, { cwd: env.worker })
  literalRefAtAuthority('refs/locks', sha)
  let e: unknown
  try {
    checkNamespaceConflict(env.authority, 'refs/locks', { cwd: env.worker })
  } catch (err) {
    e = err
  }
  expect(e).toBeInstanceOf(NamespaceConflict)
  const c = e as NamespaceConflict
  expect([c.ref, c.namespace, c.sha]).toEqual(['refs/locks', 'locks', sha])
  expect(c.message).toContain('git push <authority> :refs/locks')
})

test('a literal ref at another namespace does not conflict', () => {
  const sha = buildLeaseCommit({}, { cwd: env.worker })
  literalRefAtAuthority('refs/other', sha)
  expect(() =>
    checkNamespaceConflict(env.authority, 'refs/locks', { cwd: env.worker }),
  ).not.toThrow()
})

test('a caller remediation replaces the default hint', () => {
  const sha = buildLeaseCommit({}, { cwd: env.worker })
  literalRefAtAuthority('refs/locks', sha)
  expect(() =>
    checkNamespaceConflict(env.authority, 'refs/locks', {
      cwd: env.worker,
      remediation: 'see the runbook',
    }),
  ).toThrow(/; see the runbook$/)
})

test('every call asks the authority again', () => {
  checkNamespaceConflict(env.authority, 'refs/locks', { cwd: env.worker })
  const sha = buildLeaseCommit({}, { cwd: env.worker })
  literalRefAtAuthority('refs/locks', sha)
  expect(() => checkNamespaceConflict(env.authority, 'refs/locks', { cwd: env.worker })).toThrow(
    NamespaceConflict,
  )
})

test('an unreachable authority raises GitFailed', () => {
  expect(() =>
    checkNamespaceConflict(join(env.root, 'nowhere'), 'refs/locks', { cwd: env.worker }),
  ).toThrow(GitFailed)
})
