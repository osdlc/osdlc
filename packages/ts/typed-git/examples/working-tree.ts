// Stage and commit, check out a branch, remove untracked files, and reset.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    const first = fx.commit('first', { 'a.md': 'one\n' })

    writeFileSync(join(fx.dir, 'a.md'), 'two\n')
    git.add(['a.md'])
    git.commit({ message: 'second', body: 'The details.' })
    assert.equal(git.logSubject('HEAD'), 'second')

    // The message can also come from a string on stdin, with no temp file.
    git.commit({ messageStdin: 'third\n', allowEmpty: true })
    assert.equal(git.logSubject('HEAD'), 'third')

    git.checkout('HEAD', { branch: 'topic' })
    assert.equal(git.currentBranch(), 'topic')

    mkdirSync(join(fx.dir, 'scratch'))
    writeFileSync(join(fx.dir, 'scratch', 'tmp.txt'), 'tmp\n')
    writeFileSync(join(fx.dir, 'junk.txt'), 'junk\n')
    git.clean({ directories: true })
    assert.deepEqual(git.statusPorcelain(), [])

    git.resetHard(first)
    assert.equal(readFileSync(join(fx.dir, 'a.md'), 'utf8'), 'one\n')
    assert.equal(git.resolveRef('HEAD'), first)
  } finally {
    fx.cleanup()
  }
}
