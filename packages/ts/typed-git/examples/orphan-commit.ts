// Keep data on a side branch with no shared history, without touching the
// index or the working tree: blob, tree, commit, then a compare-and-swap ref
// update.
import assert from 'node:assert/strict'

import type { Git } from '@osdlc/typed-git'
import { makeGitFixture } from '@osdlc/typed-git/testing'

const REF = 'refs/heads/data'

/** Write `content` as `state.json` in a new commit on `REF`; returns the commit. */
function save(git: Git, content: string): string {
  const parent = git.resolveRef(REF) // null: the branch does not exist yet
  const blob = git.hashObject(content, { write: true })
  const tree = git.mktree([{ mode: '100644', sha: blob, path: 'state.json' }])
  const commit = git.commitTree(tree, {
    parents: parent === null ? [] : [parent],
    message: 'Save state',
  })
  // Moves the ref only if nobody else moved it since `resolveRef` above.
  git.updateRef(REF, commit, { oldSha: parent, reason: 'state: save' })
  return commit
}

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    const main = fx.commit('work', { 'README.md': 'work\n' })

    const first = save(git, '{"n":1}\n')
    const second = save(git, '{"n":2}\n')

    assert.equal(git.resolveRef(REF), second)
    assert.equal(git.showAtRev(REF, 'state.json'), '{"n":2}\n')
    // An orphan: the first commit has no parent, and main is not in its history.
    assert.deepEqual(git.logLines({ rev: REF, format: '%H' }), [second, first])
    assert.equal(git.mergeBase(main, REF), null)
    // The checkout was never touched.
    assert.equal(git.resolveRef('HEAD'), main)
    assert.equal(git.isDirty(), false)

    // Another writer got there first: the stale old sha fails, and the ref stays.
    const blob = git.hashObject('{"n":0}\n', { write: true })
    const tree = git.mktree([{ mode: '100644', sha: blob, path: 'state.json' }])
    const late = git.commitTree(tree, { parents: [first], message: 'Late save' })
    const lost = git.try.updateRef(REF, late, { oldSha: first })
    assert.equal(lost.ok, false)
    assert.equal(git.resolveRef(REF), second)
  } finally {
    fx.cleanup()
  }
}
