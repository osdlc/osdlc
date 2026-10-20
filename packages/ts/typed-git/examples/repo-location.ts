// Find a repository's top level, its own and its shared git directory, also from a linked worktree.
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  const linked = `${fx.dir}-linked`
  const plain = mkdtempSync(join(tmpdir(), 'typed-git-plain-'))
  try {
    fx.commit('first', { 'a.md': 'one\n' })
    const root = realpathSync(fx.dir)

    assert.equal(fx.git.topLevel(), root)
    assert.equal(fx.git.gitCommonDir(), join(root, '.git'))
    assert.equal(fx.git.mainCheckout(), root)

    fx.git.worktreeAdd(linked, { detach: true, startPoint: 'HEAD' })
    const inLinked = fx.git.at(linked)
    assert.equal(inLinked.topLevel(), realpathSync(linked))
    assert.equal(inLinked.mainCheckout(), root) // the primary checkout, not the linked one
    // gitDir is the worktree's own directory, where a rebase in progress leaves its state.
    assert.equal(inLinked.gitDir(), join(root, '.git', 'worktrees', basename(linked)))

    // Outside a repository these answer null.
    assert.equal(new Git(plain).topLevel(), null)
    assert.equal(new Git(plain).mainCheckout(), null)
    assert.equal(new Git(plain).gitDir(), null)
  } finally {
    rmSync(plain, { recursive: true, force: true })
    rmSync(linked, { recursive: true, force: true })
    fx.cleanup()
  }
}
