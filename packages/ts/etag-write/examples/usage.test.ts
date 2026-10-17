/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'bun:test'

import {
  atomicWrite,
  atomicWriteAsync,
  etag,
  etagOfFile,
  WriteConflictError,
  writeCas,
  writeIfChanged,
  type AtomicWriteOptions,
  type WriteConflictReason,
  type WriteData,
} from '@osdlc/etag-write'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'etag-write-example-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Read, change and write back, retrying when someone else wrote first. */
function update(path: string, change: (text: string) => string): void {
  for (;;) {
    const seen = etagOfFile(path)
    const text = seen === null ? '' : readFileSync(path, 'utf8')
    try {
      writeCas(path, change(text), seen)
      return
    } catch (err) {
      if (!(err instanceof WriteConflictError)) throw err
    }
  }
}

test('save a state file so a crash never leaves half of it', async () => {
  const path = join(dir, 'state', 'app.json')
  const data: WriteData = JSON.stringify({ count: 1 }) + '\n'
  atomicWrite(path, data)
  await atomicWriteAsync(path, new TextEncoder().encode('{"count":2}\n'))
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ count: 2 })
})

test('write a secret with exact permissions', () => {
  const options: AtomicWriteOptions = { mode: 0o600 }
  atomicWrite(join(dir, 'token'), 'secret\n', options)
  expect(etagOfFile(join(dir, 'token'))).toBe(etag('secret\n'))
})

test('a read-change-write loop that never loses an edit', () => {
  const path = join(dir, 'counter.txt')
  update(path, () => '1')
  update(path, (text) => String(Number(text) + 1))
  expect(readFileSync(path, 'utf8')).toBe('2')
})

test('a stale write is refused and says why', () => {
  const path = join(dir, 'note.md')
  const seen = writeCas(path, 'mine\n', null)
  atomicWrite(path, 'theirs\n')
  let reason: WriteConflictReason | undefined
  try {
    writeCas(path, 'stale\n', seen)
  } catch (err: unknown) {
    if (err instanceof WriteConflictError) reason = err.reason
  }
  expect(reason).toBe('changed')
})

test('a generated file is rewritten only when it changes', () => {
  const path = join(dir, 'generated.md')
  expect(writeIfChanged(path, 'v1')).toBe(true)
  expect(writeIfChanged(path, 'v1')).toBe(false)
})
