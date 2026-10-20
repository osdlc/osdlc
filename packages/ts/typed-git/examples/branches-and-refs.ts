// List and delete branches, and read refs with a format of your choice.
import assert from 'node:assert/strict'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    const first = fx.commit('first', { 'a.md': 'one\n' })
    git.checkout('HEAD', { branch: 'topic' })
    git.checkout('main')

    assert.equal(git.currentBranch(), 'main')
    assert.deepEqual(git.branches(), ['main', 'topic'])
    assert.deepEqual(git.branches('top*'), ['topic'])
    assert.equal(git.branchExists('topic'), true)

    assert.deepEqual(git.refs('refs/heads'), [
      { sha: first, ref: 'refs/heads/main' },
      { sha: first, ref: 'refs/heads/topic' },
    ])
    assert.deepEqual(
      git.forEachRef('refs/heads', { format: '%(refname:short)', sort: '-refname' }),
      ['topic', 'main'],
    )

    git.deleteBranch('topic')
    assert.equal(git.branchExists('topic'), false)

    // Delete a ref only while it still points where you expect.
    git.rawChecked(['update-ref', 'refs/example/marker', first])
    git.deleteRef('refs/example/marker', { expected: first })
    assert.equal(git.resolveRef('refs/example/marker'), null)
  } finally {
    fx.cleanup()
  }
}
