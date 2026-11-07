// Runs the built package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appendJsonl, newRunId, readJsonl } from '@osdlc/observe'
import { normalizeHookText } from '@osdlc/observe/hook'
import { appendRedactedJsonl, createRedactor } from '@osdlc/observe/redact'
import { isLegalTransition, looseSessionModel, sessionEnv } from '@osdlc/observe/session'

assert.match(newRunId(), /^r-/)

const dir = mkdtempSync(join(tmpdir(), 'observe-smoke-'))
try {
  const file = join(dir, 'log.jsonl')
  appendJsonl(file, { n: 1 })
  assert.deepEqual(readJsonl(file), [{ n: 1 }])
  // Loads secretlint from the installed dependencies: a secret only it finds.
  const redactor = createRedactor({ env: {} })
  const secret = 'postgres://app:s3cr3t-pa55@db.internal/prod'
  await appendRedactedJsonl(file, { kind: 'x', note: secret }, redactor)
  const [, line] = readJsonl(file)
  assert.equal(line.note, '[REDACTED:database-connection-string]')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

assert.equal(typeof isLegalTransition, 'function')
assert.equal(typeof looseSessionModel.recordSessionEventIn, 'function')
assert.equal(typeof sessionEnv, 'function')
assert.equal(normalizeHookText('claude', '{"hook_event_name":"Stop"}').event, 'Stop')
console.log('observe smoke ok')
