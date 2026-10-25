// Push with a pinned lease and read why a ref was rejected, without parsing stderr.
import assert from 'node:assert/strict'

import { type PushRejection } from '@osdlc/typed-git'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

export function run(): void {
  const pair = makeBareAndWorker()
  try {
    const git = pair.worker.git
    const first = pair.worker.commit('first', { 'a.md': 'one\n' })
    const second = pair.worker.commit('second', { 'a.md': 'two\n' })

    const created = git.pushPorcelain('origin', `${first}:refs/heads/lease`, {
      forceWithLease: { ref: 'refs/heads/lease', expect: null },
    })
    assert.equal(created.refs[0]!.flag, '*')

    // The lease expects `second`, but the remote holds `first`: rejected, not thrown.
    const lost = git.pushPorcelain('origin', `${second}:refs/heads/lease`, {
      forceWithLease: { ref: 'refs/heads/lease', expect: second },
    })
    const ref = lost.refs[0]!
    assert.equal(ref.flag, '!')
    // Checking `flag` narrows the type: `rejection` is there on a rejected ref.
    if (ref.flag === '!') {
      assert.equal(ref.rejection, 'stale')
      // A lease caller treats the race outcomes as "someone else won".
      const lostRace: ReadonlySet<PushRejection> = new Set([
        'stale',
        'already-exists',
        'lock-failed',
      ])
      assert.equal(lostRace.has(ref.rejection), true)
    }
  } finally {
    pair.cleanup()
  }
}
