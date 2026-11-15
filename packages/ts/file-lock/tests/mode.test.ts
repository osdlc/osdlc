/**
 * The lock file's permission bits: set exactly by `mode`, whatever the umask,
 * and kept for the lock's whole life. Without `mode`, a new file's default.
 */
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { claimLock, releaseLock, touchLock, updateLock, withLock } from '../src/index.ts'

import { age, claimed, DEAD_PID, never, POSIX } from './helpers.ts'

let dir: string
let lock: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-lock-mode-'))
  lock = join(dir, 'x.lock')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const modeOf = (path: string): number => statSync(path).mode & 0o7777

describe.skipIf(!POSIX)('mode', () => {
  test("without mode, the lock gets a new file's default: 0o666 less the umask", () => {
    // Read the umask without changing it: worker threads may not set it.
    const umask = process.umask()
    claimed(claimLock(lock, {}, never))
    expect(modeOf(lock)).toBe(0o666 & ~umask)
  })

  test('mode 0o600 makes a lock only its owner can read', () => {
    claimed(claimLock(lock, { pid: process.pid }, { ...never, mode: 0o600 }))
    expect(modeOf(lock)).toBe(0o600)
  })

  test('the umask does not narrow it: 0o666 is 0o666', () => {
    claimed(claimLock(lock, {}, { ...never, mode: 0o666 }))
    expect(modeOf(lock)).toBe(0o666)
  })

  test('updateLock keeps the mode', () => {
    const token = claimed(claimLock(lock, { n: 1 }, { ...never, mode: 0o640 }))
    expect(updateLock<{ n: number }>(lock, token, (c) => ({ n: c.n + 1 }))).toBe(true)
    expect(modeOf(lock)).toBe(0o640)
  })

  test('touchLock and a release leave it as it was', () => {
    const token = claimed(claimLock(lock, {}, { ...never, mode: 0o600 }))
    expect(touchLock(lock, token)).toBe(true)
    expect(modeOf(lock)).toBe(0o600)
    expect(releaseLock(lock, token)).toBe(true)
  })

  test("a takeover's new lock has the taker's mode, not the stale one's", () => {
    writeFileSync(lock, JSON.stringify({ pid: DEAD_PID, token: 'dead' }), { mode: 0o644 })
    age(lock)
    claimed(claimLock(lock, {}, { isStale: () => true, mode: 0o600 }))
    expect(modeOf(lock)).toBe(0o600)
  })

  test('withLock takes mode too', () => {
    const seen = withLock(lock, () => modeOf(lock), { mode: 0o600 })
    expect(seen).toBe(0o600)
  })

  test.each([-1, 1.5, 0o10000, 0o000, 0o200, 0o044])(
    'mode %o is refused before anything is written: the owner must be able to read the lock',
    (mode) => {
      expect(() => claimLock(lock, {}, { ...never, mode })).toThrow(RangeError)
      expect(() => withLock(lock, () => 0, { mode })).toThrow(RangeError)
      expect(readdirSync(dir)).toEqual([])
    },
  )
})
