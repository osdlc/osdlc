/**
 * Errors other than "gone" and "not a lock file" are thrown, not reported as a
 * lost lock or swallowed into a retry. The read is made to fail with a real
 * error code, as a permission problem or a failing disk would, which a test
 * running as root could not otherwise produce.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { claimLock, releaseLock, touchLock, updateLock, withLock } from '../src/index.ts'

const failure = vi.hoisted(() => ({ code: undefined as string | undefined }))

vi.mock('../src/lock-file.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lock-file.ts')>()
  const fail = (): void => {
    if (failure.code)
      throw Object.assign(new Error(`${failure.code}: injected`), { code: failure.code })
  }
  return {
    ...real,
    readLock: (path: string) => {
      fail()
      return real.readLock(path)
    },
    inspectLock: <T>(
      path: string,
      use: (file: import('../src/lock-file.ts').LockFile, fd: number) => T,
    ) => {
      fail()
      return real.inspectLock(path, use)
    },
  }
})

let dir: string
let lock: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-lock-errors-'))
  lock = join(dir, 'x.lock')
  writeFileSync(lock, JSON.stringify({ pid: 1, token: 'theirs' }))
})
afterEach(() => {
  failure.code = undefined
  rmSync(dir, { recursive: true, force: true })
})

describe.each(['EACCES', 'EIO'])('a read failing with %s', (code) => {
  beforeEach(() => {
    failure.code = code
  })

  test('claimLock throws it instead of retrying until holder: null', () => {
    expect(() => claimLock(lock, {}, { isStale: () => false })).toThrow(code)
  })

  test('withLock throws it at once instead of timing out', () => {
    expect(() => withLock(lock, () => 'ran', { timeoutMs: 60_000 })).toThrow(code)
  })

  test('touchLock throws it', () => {
    expect(() => touchLock(lock, 'theirs')).toThrow(code)
  })

  test('updateLock throws it', () => {
    expect(() => updateLock(lock, 'theirs', () => ({}))).toThrow(code)
  })

  test('releaseLock throws it', () => {
    expect(() => releaseLock(lock, 'theirs')).toThrow(code)
  })
})
