/**
 * Something other than a regular file at the lock path is not a lock this
 * package wrote. A claim throws NotALockError at once: it does not follow a
 * symlink, block on a FIFO, or retry a directory until `holder: null`. The
 * token calls answer false and leave the thing alone.
 */
import { execFileSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  claimLock,
  NotALockError,
  releaseLock,
  touchLock,
  updateLock,
  withLock,
  type NotALockKind,
} from '../src/index.ts'

import { age } from './helpers.ts'

const POSIX = process.platform !== 'win32'

let dir: string
let lock: string
let target: string
let server: Server | undefined
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-lock-notalock-'))
  lock = join(dir, 'x.lock')
  // A file outside the lock's control that a symlink at the lock path points to.
  target = join(dir, 'secret')
  writeFileSync(target, JSON.stringify({ secret: 'do not read', token: 'planted' }))
  age(target)
})
afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
  rmSync(dir, { recursive: true, force: true })
})

/** Put a `kind` of non-file at the lock path. */
async function plant(kind: 'symlink' | 'directory' | 'fifo' | 'socket'): Promise<void> {
  if (kind === 'symlink') symlinkSync(target, lock)
  if (kind === 'directory') mkdirSync(lock)
  if (kind === 'fifo') execFileSync('mkfifo', [lock])
  if (kind === 'socket') {
    const s = createServer()
    server = s
    await new Promise<void>((resolve) => s.listen(lock, resolve))
  }
}

const cases: Array<{ planted: 'symlink' | 'directory' | 'fifo' | 'socket'; kind: NotALockKind }> = [
  { planted: 'symlink', kind: 'symlink' },
  { planted: 'directory', kind: 'directory' },
  { planted: 'fifo', kind: 'other' },
  { planted: 'socket', kind: 'other' },
]

describe.skipIf(!POSIX).each(cases)('a $planted at the lock path', ({ planted, kind }) => {
  beforeEach(async () => {
    await plant(planted)
  })

  test(`claimLock throws NotALockError (${kind}) and the rule never sees it`, () => {
    let judged = false
    const claim = (): unknown =>
      claimLock(
        lock,
        { pid: process.pid },
        {
          isStale: () => {
            judged = true
            return true
          },
        },
      )
    expect(claim).toThrow(NotALockError)
    try {
      claim()
    } catch (err) {
      expect(err).toMatchObject({ name: 'NotALockError', path: lock, kind })
    }
    expect(judged).toBe(false)
  })

  test('withLock throws NotALockError at once instead of waiting out the timeout', () => {
    const started = Date.now()
    expect(() => withLock(lock, () => 'ran', { timeoutMs: 30_000 })).toThrow(NotALockError)
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  test('the token calls answer false and leave it in place', () => {
    expect(touchLock(lock, 'planted')).toBe(false)
    expect(updateLock(lock, 'planted', () => ({ secret: 'overwritten' }))).toBe(false)
    expect(releaseLock(lock, 'planted')).toBe(false)
    expect(() => lstatSync(lock)).not.toThrow()
  })

  test('the claim leaves nothing beside it', () => {
    expect(() => claimLock(lock, {}, { isStale: () => false })).toThrow(NotALockError)
    expect(readdirSync(dir).filter((name) => name.startsWith('x.lock.'))).toEqual([])
  })
})

describe.skipIf(!POSIX)('a symlink at the lock path', () => {
  beforeEach(() => symlinkSync(target, lock))

  test("its target is never read, touched or rewritten, even when it holds the caller's token", () => {
    const before = statSync(target).mtimeMs
    expect(touchLock(lock, 'planted')).toBe(false)
    expect(updateLock(lock, 'planted', () => ({ secret: 'overwritten' }))).toBe(false)
    expect(releaseLock(lock, 'planted')).toBe(false)
    expect(statSync(target).mtimeMs).toBe(before)
    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual({
      secret: 'do not read',
      token: 'planted',
    })
    expect(lstatSync(lock).isSymbolicLink()).toBe(true)
  })

  test('the error names the path and what is there', () => {
    expect(() => claimLock(lock, {}, { isStale: () => false })).toThrow(
      `not a lock file: ${lock} is a symlink`,
    )
  })
})
