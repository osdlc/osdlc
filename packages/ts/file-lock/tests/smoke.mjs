// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so nothing else runs
// dist/. Without this check, a broken build output would pass every other
// check and fail on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  claimLock,
  holderGone,
  LockTimeoutError,
  releaseLock,
  untouchedFor,
  withLock,
} from '@osdlc/file-lock'

const dir = mkdtempSync(join(tmpdir(), 'file-lock-smoke-'))
try {
  const lock = join(dir, 'a.lock')
  assert.equal(
    withLock(lock, () => 'ran'),
    'ran',
  )
  assert.equal(existsSync(lock), false)

  const claim = claimLock(lock, { pid: process.pid }, { isStale: holderGone((c) => [c.pid]) })
  assert.ok(claim.ok)
  assert.throws(
    () => withLock(lock, () => 0, { timeoutMs: 0 }),
    (e) => e instanceof LockTimeoutError,
  )
  const second = claimLock(lock, {}, { isStale: untouchedFor(0, () => Date.now() + 1000) })
  assert.ok(second.ok)
  assert.equal(releaseLock(lock, claim.token), false)
  assert.equal(releaseLock(lock, second.token), true)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('file-lock smoke: OK')
