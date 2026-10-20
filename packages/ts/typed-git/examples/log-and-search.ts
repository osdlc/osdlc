// Read history as raw text or as lines, and search the working tree.
import assert from 'node:assert/strict'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    fx.commit('first', { 'a.md': 'TODO: write this\n' })
    fx.commit('second', { 'b.md': 'done\n' })

    assert.equal(git.logSubject('HEAD'), 'second')
    assert.equal(git.logSubject('no-such-ref'), null)

    // `log` returns stdout unsplit; `logLines` splits it.
    assert.equal(git.log({ format: '%s', maxCount: 1 }), 'second\n')
    assert.deepEqual(git.logLines({ format: '%s' }), ['second', 'first'])
    assert.deepEqual(git.logLines({ format: '%s', reverse: true }), ['first', 'second'])

    assert.deepEqual(git.grep('TODO', { lineNumber: true, noColor: true }), [
      'a.md:1:TODO: write this',
    ])
    assert.deepEqual(git.grep('NO-SUCH-TEXT'), []) // git grep exits 1 for no matches
  } finally {
    fx.cleanup()
  }
}
