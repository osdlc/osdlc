// Resolve revisions, read a file at a revision, and compare two commits.
import assert from 'node:assert/strict'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    assert.equal(git.hasHistory(), false) // an unborn HEAD

    const first = fx.commit('first', { 'a.md': 'one\n' })
    const second = fx.commit('second', { 'a.md': 'two\n' })

    assert.equal(git.resolveRef('HEAD'), second)
    assert.equal(git.resolveRef('no-such-ref'), null)
    assert.equal(git.revParse('HEAD~1'), first)
    assert.equal(git.hasHistory(), true)
    assert.equal(git.headRef(), 'main')
    assert.equal(git.symbolicRef('HEAD'), 'refs/heads/main')

    assert.equal(git.showAtRev(first, 'a.md'), 'one\n')
    assert.equal(git.showAtRev(first, 'missing.md'), null)

    assert.equal(git.objectExists(first), true)
    assert.equal(git.objectExists('0'.repeat(40)), false)

    assert.equal(git.mergeBase(first, second), first)
    assert.equal(git.isAncestor(first, second), true)
    assert.equal(git.isAncestor(second, first), false)
    assert.deepEqual(git.aheadBehind(first, second), { ahead: 1, behind: 0 })
  } finally {
    fx.cleanup()
  }
}
