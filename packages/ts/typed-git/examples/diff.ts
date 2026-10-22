// Read changes as paths, statuses, a stat, a whitespace check, diff text, and per-commit counts.
import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CommandFailed } from '@osdlc/typed-git'
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
    assert.match(git.diffText(), /\+two/)

    // A bad rev throws; `try` reports it.
    assert.throws(
      () => git.diffText('no-such-rev'),
      (e: { failure?: { cause?: unknown } }) => e.failure?.cause instanceof CommandFailed,
    )
    assert.equal(git.try.diffText('no-such-rev').ok, false)

    // An untracked file as an all-added diff.
    writeFileSync(join(fx.dir, 'new.md'), 'fresh\n')
    assert.match(git.diffAddedFile('new.md'), /\+fresh/)
    rmSync(join(fx.dir, 'new.md'))

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
