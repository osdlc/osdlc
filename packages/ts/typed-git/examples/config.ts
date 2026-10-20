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
    assert.equal(git.configGet('example.key', { scope: 'local' }), 'other')

    // A key with several values, and a key read as a boolean by git.
    git.raw(['config', '--add', 'example.many', 'one'])
    git.raw(['config', '--add', 'example.many', 'two'])
    assert.deepEqual(git.configGetAll('example.many'), ['one', 'two'])
    assert.deepEqual(git.configGetAll('example.none'), [])

    git.configSet('example.flag', 'yes')
    assert.equal(git.configGetBool('example.flag'), true)
    assert.equal(git.configGetBool('example.none'), null)
  } finally {
    fx.cleanup()
  }
}
