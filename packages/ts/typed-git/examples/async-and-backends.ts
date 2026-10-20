// Use AsyncGit with the default CLI backend, and with a backend that handles only some requests.
import assert from 'node:assert/strict'

import { AsyncGit, partialBackend, UnsupportedRequest } from '@osdlc/typed-git'
import { makeGitFixture } from '@osdlc/typed-git/testing'

export async function run(): Promise<void> {
  const fx = makeGitFixture()
  try {
    const head = fx.commit('first', { 'a.md': 'one\n' })

    // The default backend runs the git CLI. The methods match `Git`, but return promises.
    const git = new AsyncGit(fx.dir)
    assert.equal(await git.resolveRef('HEAD'), head)
    assert.equal(await git.logSubject('HEAD'), 'first')
    assert.equal(await git.resolveRef('no-such-ref'), null)
    assert.deepEqual(await git.try.resolveRef('no-such-ref'), { ok: true, value: null })

    // A partial backend answers the requests it handles and rejects the rest.
    const canned = partialBackend('canned', { resolveRef: () => Promise.resolve('abc123') })
    const stubbed = new AsyncGit(fx.dir, { backend: canned })
    assert.equal(await stubbed.resolveRef('anything'), 'abc123')
    await assert.rejects(stubbed.logSubject('HEAD'), UnsupportedRequest)
  } finally {
    fx.cleanup()
  }
}
