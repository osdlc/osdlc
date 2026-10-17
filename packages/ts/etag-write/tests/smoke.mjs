// Runs the BUILT package under Node. `bun test` resolves the `bun` export
// condition to the TypeScript source, so dist/ is compiled but never run
// anywhere else. A broken emit passes every other check and fails on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync, rmSync, statSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  atomicWrite,
  atomicWriteAsync,
  etag,
  etagOfFile,
  WriteConflictError,
  writeCas,
  writeIfChanged,
} from '@osdlc/etag-write'

const dir = mkdtempSync(join(tmpdir(), 'etag-write-smoke-'))
try {
  const path = join(dir, 'sub', 'a.txt')
  atomicWrite(path, 'hello')
  assert.equal(readFileSync(path, 'utf8'), 'hello')
  await atomicWriteAsync(path, 'again')
  assert.equal(etagOfFile(path), etag('again'))

  assert.equal(writeCas(path, 'next', etag('again')), etag('next'))
  assert.throws(
    () => writeCas(path, 'blind', null),
    (e) => e instanceof WriteConflictError && e.reason === 'exists-without-etag',
  )
  assert.equal(writeIfChanged(path, 'next'), false)

  if (process.platform !== 'win32') {
    chmodSync(path, 0o600)
    atomicWrite(path, 'kept')
    assert.equal(statSync(path).mode & 0o777, 0o600)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('etag-write smoke: OK')
