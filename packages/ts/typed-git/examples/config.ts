// Read and write repository config. An unset key is null, not an error.
import assert from 'node:assert/strict'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    assert.equal(git.configGet('example.key'), null)

    git.configSet('example.key', 'value')
    assert.equal(git.configGet('example.key'), 'value')

    git.configSet('example.key', 'other', { scope: 'local' })
    assert.equal(git.configGet('example.key'), 'other')
  } finally {
    fx.cleanup()
  }
}
