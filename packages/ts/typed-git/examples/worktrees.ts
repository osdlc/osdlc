// Add, list, move, remove and prune linked worktrees.
import assert from 'node:assert/strict'
import { realpathSync, rmSync } from 'node:fs'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  const linked = `${fx.dir}-linked`
  const moved = `${fx.dir}-moved`
  const gone = `${fx.dir}-gone`
  try {
    const git = fx.git
    fx.commit('first', { 'a.md': 'one\n' })
    assert.equal(git.worktrees().length, 1)

    git.worktreeAdd(linked, { branch: 'topic' })
    const added = git.worktrees().find((w) => w.branch === 'topic')
    assert.equal(added?.path, realpathSync(linked))

    git.worktreeMove(linked, moved)
    assert.deepEqual(
      git.worktrees().map((w) => w.path),
      [realpathSync(fx.dir), realpathSync(moved)],
    )

    git.worktreeRemove(moved)
    assert.equal(git.worktrees().length, 1)

    // A worktree directory deleted by hand stays listed until it is pruned.
    git.worktreeAdd(gone, { detach: true, startPoint: 'HEAD' })
    rmSync(gone, { recursive: true, force: true })
    assert.equal(git.worktrees().length, 2)
    git.worktreePrune()
    assert.equal(git.worktrees().length, 1)
  } finally {
    rmSync(linked, { recursive: true, force: true })
    rmSync(moved, { recursive: true, force: true })
    rmSync(gone, { recursive: true, force: true })
    fx.cleanup()
  }
}
