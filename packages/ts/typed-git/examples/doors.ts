// Read one failure through each door: plain, try, soft, raw and rawChecked.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CommandFailed } from '@osdlc/typed-git'
import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  const plain = mkdtempSync(join(tmpdir(), 'typed-git-plain-'))
  try {
    fx.commit('first', { 'a.md': 'one\n' })
    // `at` roots the same client at another directory. This one is not a repository.
    const outside = fx.git.at(plain)

    // Plain door: a declared absence is a value. Any other failure throws.
    assert.equal(fx.git.resolveRef('no-such-ref'), null)
    assert.throws(() => outside.lsFilesUnmerged(), CommandFailed)

    // `try` returns the failure as a value. A declared absence is still `ok`.
    assert.deepEqual(fx.git.try.resolveRef('no-such-ref'), { ok: true, value: null })
    const failed = outside.try.lsFilesUnmerged()
    assert.ok(!failed.ok)
    assert.equal(failed.error.result.exitCode, 128)

    // `soft` turns any failure into the verb's absence value.
    assert.deepEqual(outside.soft.lsFilesUnmerged(), [])

    // `raw` returns the result at any exit code. `rawChecked` throws on non-zero.
    assert.equal(outside.raw(['status']).exitCode, 128)
    assert.throws(() => outside.rawChecked(['status']), CommandFailed)
  } finally {
    rmSync(plain, { recursive: true, force: true })
    fx.cleanup()
  }
}
