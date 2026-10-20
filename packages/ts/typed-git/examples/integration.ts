// Predict a merge, merge and rebase with conflicts, and read the unmerged files.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    const base = fx.commit('base', { 'a.md': 'base\n' })
    git.checkout(base, { branch: 'topic' })
    fx.commit('topic edit', { 'a.md': 'topic\n' })
    git.checkout(base, { branch: 'other' })
    fx.commit('other file', { 'b.md': 'other\n' })
    git.checkout('main')
    fx.commit('main edit', { 'a.md': 'main\n' })

    // `mergeTree` predicts a merge from the object database. It touches no files.
    const clean = git.mergeTree('main', 'other')
    assert.equal(clean.status, 'clean')
    const predicted = git.mergeTree('main', 'topic')
    assert.ok(predicted.status === 'conflict')
    assert.deepEqual(predicted.conflicts, ['a.md'])

    // A conflict is an answer, not a throw. `lsFilesUnmerged` lists the stages.
    assert.equal(git.merge('topic').status, 'conflict')
    assert.deepEqual(
      git.lsFilesUnmerged().map((e) => [e.path, e.stage]),
      [
        ['a.md', 1],
        ['a.md', 2],
        ['a.md', 3],
      ],
    )
    git.mergeAbort()
    assert.deepEqual(git.statusPorcelain(), [])

    assert.deepEqual(git.merge('other'), {
      status: 'clean',
      fastForward: false,
      alreadyUpToDate: false,
    })

    // Rebase follows the same pattern: conflict, resolve, continue.
    git.checkout('topic')
    assert.equal(git.rebase('main').status, 'conflict')
    git.rebaseAbort()
    assert.equal(git.rebase('main').status, 'conflict')
    writeFileSync(join(fx.dir, 'a.md'), 'resolved\n')
    git.add(['a.md'])
    assert.equal(git.rebaseContinue().status, 'clean')
    assert.equal(readFileSync(join(fx.dir, 'a.md'), 'utf8'), 'resolved\n')
    assert.equal(git.isAncestor('main', 'HEAD'), true)
  } finally {
    fx.cleanup()
  }
}
