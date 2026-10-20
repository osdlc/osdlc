// Build a bare store and a worker for a test, push once, and clean up.
import assert from 'node:assert/strict'

import {
  IDENTITY,
  makeBareAndWorker,
  type BareAndWorker,
  type MakeBareAndWorkerOptions,
} from '@osdlc/typed-git/testing'

export function run(): void {
  // Leave `parent` unset: `cleanup()` deletes the whole parent, also one you pass in.
  const opts: MakeBareAndWorkerOptions = { remoteName: 'store' }
  const pair: BareAndWorker = makeBareAndWorker(opts)
  try {
    const sha = pair.worker.commit('first', { 'a.md': 'one\n' })
    pair.worker.git.push(pair.remoteName, 'HEAD:refs/heads/main')
    assert.equal(pair.bare.git.resolveRef('main'), sha)

    // The fixture pins identity only, not the rest of the global config.
    assert.equal(pair.worker.git.logSubject('HEAD'), 'first')
    assert.equal(
      pair.worker.git.log({ format: '%an <%ae>', maxCount: 1 }).trim(),
      `${IDENTITY['GIT_AUTHOR_NAME']} <${IDENTITY['GIT_AUTHOR_EMAIL']}>`,
    )
  } finally {
    pair.cleanup()
  }
}
