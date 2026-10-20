// Read changes as paths, statuses, a stat, a whitespace check, and per-commit counts.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    fx.commit('first', { 'a.md': 'one\n', 'b.md': 'keep\n' })

    writeFileSync(join(fx.dir, 'a.md'), 'one\ntwo\n')
    assert.deepEqual(git.diffNameOnly(), ['a.md'])
    assert.deepEqual(git.diffNameStatus(), [{ status: 'M', path: 'a.md' }])
    assert.match(git.diffStat(), /a\.md \| 1 \+/)
    assert.deepEqual(git.diffCheck(), { ok: true, output: '' })

    // A finding is an answer, not a throw.
    writeFileSync(join(fx.dir, 'b.md'), 'keep   \n')
    const check = git.diffCheck()
    assert.equal(check.ok, false)
    assert.match(check.output, /trailing whitespace/)
    writeFileSync(join(fx.dir, 'b.md'), 'keep\n')

    const second = fx.commit('second', { 'c.md': 'new\n' })
    assert.deepEqual(git.diffTree(second), [
      { status: 'M', path: 'a.md' },
      { status: 'A', path: 'c.md' },
    ])
    assert.deepEqual(git.diffTreeNumstat(second), [
      { path: 'a.md', linesAdded: 1, linesDeleted: 0 },
      { path: 'c.md', linesAdded: 1, linesDeleted: 0 },
    ])

    // A rename reports its destination in `path` and its source in `from`.
    git.rawChecked(['mv', 'c.md', 'renamed.md'])
    const third = fx.commit('third')
    assert.deepEqual(git.diffTree(third, { findRenames: true }), [
      { status: 'R100', path: 'renamed.md', from: 'c.md' },
    ])
  } finally {
    fx.cleanup()
  }
}
