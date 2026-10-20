// Add a remote, read its URL and its owner and repo, and list what it holds.
import assert from 'node:assert/strict'

import { makeOriginAndCheckout } from '@osdlc/typed-git/testing'

export function run(): void {
  const { origin, checkout, cleanup } = makeOriginAndCheckout()
  try {
    const git = checkout.git
    const url = 'https://github.com/acme/widgets.git'
    git.remoteAdd('upstream', url)

    assert.equal(git.remoteGetUrl('upstream'), url)
    assert.equal(git.remoteGetUrl('no-such-remote'), null) // git exits 2 for an unknown remote

    const coordinate = git.remoteOwnerRepo('upstream')
    assert.equal(coordinate?.host, 'github.com')
    assert.equal(coordinate?.owner, 'acme')
    assert.equal(coordinate?.repo, 'widgets')
    assert.equal(git.remoteOwnerRepo('no-such-remote'), null)

    const heads = git.lsRemote('origin', undefined, { heads: true })
    assert.deepEqual(heads, [{ sha: origin.git.resolveRef('main'), ref: 'refs/heads/main' }])
  } finally {
    cleanup()
  }
}
