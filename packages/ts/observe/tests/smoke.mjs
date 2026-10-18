// Runs the BUILT package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appendJsonl, newRunId, readJsonl } from '@osdlc/observe'
import { isLegalTransition, looseSessionModel, sessionEnv } from '@osdlc/observe/session'

assert.match(newRunId(), /^r-/)

const dir = mkdtempSync(join(tmpdir(), 'observe-smoke-'))
try {
  const file = join(dir, 'log.jsonl')
  appendJsonl(file, { n: 1 })
  assert.deepEqual(readJsonl(file), [{ n: 1 }])
} finally {
  rmSync(dir, { recursive: true, force: true })
}

assert.equal(typeof isLegalTransition, 'function')
assert.equal(typeof looseSessionModel.recordSessionEventIn, 'function')
assert.equal(typeof sessionEnv, 'function')
console.log('observe smoke ok')
