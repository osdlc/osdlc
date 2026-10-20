// Create a store, push to it, clone it, and fetch a later commit.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  const scratch = mkdtempSync(join(tmpdir(), 'typed-git-transport-'))
  try {
    const store = join(scratch, 'store.git')
    new Git(scratch).init('store.git', { bare: true, initialBranch: 'main', quiet: true })

    const first = fx.commit('first', { 'a.md': 'one\n' })
    fx.git.remoteAdd('store', store)
    fx.git.push('store', 'HEAD:refs/heads/main')

    new Git(scratch).clone(store, 'copy', { quiet: true })
    const copy = new Git(join(scratch, 'copy'))
    assert.equal(copy.currentBranch(), 'main')
    assert.equal(copy.logSubject('HEAD'), 'first')

    const second = fx.commit('second', { 'b.md': 'two\n' })
    fx.git.push('store', 'HEAD:refs/heads/main')
    assert.equal(copy.resolveRef('origin/main'), first)

    copy.fetch('origin', undefined, { quiet: true })
    assert.equal(copy.resolveRef('origin/main'), second)

    // Pin the lease to the sha you expect. `forceWithLease: true` is the bare,
    // unsafe form: it trusts the local remote-tracking ref.
    const third = fx.commit('third', { 'c.md': 'three\n' })
    fx.git.push('store', 'HEAD:refs/heads/main', {
      forceWithLease: { ref: 'refs/heads/main', expect: second },
    })
    assert.equal(new Git(store).resolveRef('main'), third)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
    fx.cleanup()
  }
}
