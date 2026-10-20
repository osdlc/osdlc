// Read the working tree state as porcelain lines, as parsed entries, and as a dirty check.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    fx.commit('first', { 'tracked.md': 'one\n' })
    assert.equal(git.isDirty(), false)
    assert.deepEqual(git.statusPorcelain(), [])

    writeFileSync(join(fx.dir, 'tracked.md'), 'two\n')
    writeFileSync(join(fx.dir, 'new.md'), 'new\n')

    assert.equal(git.isDirty(), true)
    assert.deepEqual(git.statusPorcelain(), [' M tracked.md', '?? new.md'])
    assert.deepEqual(git.statusPorcelain({ paths: ['new.md'] }), ['?? new.md'])
    assert.deepEqual(git.statusEntries(), [
      { x: ' ', y: 'M', path: 'tracked.md' },
      { x: '?', y: '?', path: 'new.md' },
    ])
  } finally {
    fx.cleanup()
  }
}
