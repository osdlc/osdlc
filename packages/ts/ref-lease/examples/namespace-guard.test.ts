// Check once, before the first write, that nothing blocks the namespace.

import { makeBareAndWorker } from '@osdlc/typed-git/testing'
import { afterAll, expect, test } from 'vitest'

import { checkNamespaceConflict, NamespaceConflict } from '@osdlc/ref-lease'

const { bare, worker, cleanup } = makeBareAndWorker()
const sha = worker.commit('init', { '.gitkeep': '' })
afterAll(cleanup)

test('a literal refs/locks blocks refs/locks/...', () => {
  // #region guard
  checkNamespaceConflict(bare.dir, 'refs/locks', { cwd: worker.dir })
  // #endregion guard

  // A literal refs/locks, made at the authority (git refuses to push one).
  worker.git.rawChecked(['push', bare.dir, `${sha}:refs/scratch/seed`])
  bare.git.rawChecked(['update-ref', 'refs/locks', sha])
  try {
    checkNamespaceConflict(bare.dir, 'refs/locks', { cwd: worker.dir })
    expect.unreachable()
  } catch (e) {
    expect(e).toBeInstanceOf(NamespaceConflict)
    expect((e as NamespaceConflict).sha).toBe(sha)
  }
})
