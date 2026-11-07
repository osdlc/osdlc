import { execFile } from 'node:child_process'
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { holderGone, LockTimeoutError, withLock } from '../src/index.ts'

import { afterMarkersExpire, age, DEAD_PID, markerFor } from './helpers.ts'

const run = promisify(execFile)
const CHILD = join(import.meta.dirname, 'section.child.ts')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-lock-section-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function staleLock(path: string): void {
  writeFileSync(path, '')
  age(path)
}

/** Run the child `count` times at once; each bumps the counter `rounds` times. */
async function children(count: number, args: string[]): Promise<void> {
  await Promise.all(
    Array.from({ length: count }, () =>
      run(process.execPath, [CHILD, ...args], { timeout: 55_000 }),
    ),
  )
}

describe('withLock', () => {
  test('returns the section result and releases the lock', () => {
    const lock = join(dir, 'x.lock')
    expect(withLock(lock, () => 7)).toBe(7)
    expect(readdirSync(dir)).toEqual([])
  })

  test('the lock records the holder pid while the section runs', () => {
    const lock = join(dir, 'x.lock')
    const seen = withLock(lock, () => JSON.parse(readFileSync(lock, 'utf-8')) as { pid: number })
    expect(seen.pid).toBe(process.pid)
  })

  test('releases the lock when the section throws', () => {
    const lock = join(dir, 'x.lock')
    expect(() =>
      withLock(lock, () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(existsSync(lock)).toBe(false)
  })

  test('a lock left by a killed process does not block', () => {
    const lock = join(dir, 'x.lock')
    staleLock(lock)
    expect(withLock(lock, () => 'ran', { staleMs: 1000 })).toBe('ran')
    expect(readdirSync(dir)).toEqual([])
  })

  test('a live lock makes a waiter time out with the holder named', () => {
    const lock = join(dir, 'x.lock')
    writeFileSync(lock, JSON.stringify({ pid: 4242, token: 't' }))
    let caught: unknown
    try {
      withLock(lock, () => 0, { timeoutMs: 50 })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(LockTimeoutError)
    const err = caught as LockTimeoutError
    expect(err.message).toBe(`timed out waiting for lock ${lock}`)
    expect(err.path).toBe(lock)
    expect(err.holder?.content).toEqual({ pid: 4242, token: 't' })
    expect(existsSync(lock)).toBe(true)
  })

  test('timeoutMs 0 tries once', () => {
    const lock = join(dir, 'x.lock')
    writeFileSync(lock, '')
    const started = Date.now()
    expect(() => withLock(lock, () => 0, { timeoutMs: 0, retryMs: 1000 })).toThrow('timed out')
    expect(Date.now() - started).toBeLessThan(500)
  })

  test('a waiter facing a live reaper times out at timeoutMs instead of spinning past it', () => {
    const lock = join(dir, 'x.lock')
    staleLock(lock)
    // a live reaper's marker: young, so it is respected
    linkSync(lock, markerFor(lock, ''))
    const started = Date.now()
    expect(() => withLock(lock, () => 0, { staleMs: 1000, timeoutMs: 100 })).toThrow('timed out')
    expect(Date.now() - started).toBeLessThan(2000)
    expect(existsSync(lock)).toBe(true)
  })

  test('a marker from a killed reaper is cleared and the stale lock then taken', () => {
    const lock = join(dir, 'x.lock')
    staleLock(lock)
    linkSync(lock, markerFor(lock, ''))
    expect(afterMarkersExpire(() => withLock(lock, () => 'ran', { staleMs: 1000 }))).toBe('ran')
    expect(readdirSync(dir)).toEqual([])
  })

  test('parallel processes do not lose updates to a read-modify-write counter', async () => {
    const counter = join(dir, 'counter')
    writeFileSync(counter, '0')
    await children(4, [counter, '5'])
    expect(readFileSync(counter, 'utf-8')).toBe('20')
    expect(readdirSync(dir)).toEqual(['counter'])
  }, 60_000)

  test('several waiters racing over one stale lock still exclude each other', async () => {
    const counter = join(dir, 'counter')
    writeFileSync(counter, '0')
    staleLock(`${counter}.lock`)
    await children(6, [counter, '5', '1000'])
    expect(readFileSync(counter, 'utf-8')).toBe('30')
    expect(readdirSync(dir)).toEqual(['counter'])
  }, 60_000)
})

describe('withLock with isStale', () => {
  test('a holder-gone rule waits out a live holder however old its lock', () => {
    const lock = join(dir, 'x.lock')
    writeFileSync(lock, JSON.stringify({ pid: process.ppid, token: 'live' }))
    age(lock)
    expect(() =>
      withLock(lock, () => 0, { isStale: holderGone((h) => [h.pid]), timeoutMs: 50 }),
    ).toThrow('timed out')
    expect(JSON.parse(readFileSync(lock, 'utf-8')).token).toBe('live')
  })

  test('a holder-gone rule takes over a dead holder however fresh its lock', () => {
    const lock = join(dir, 'x.lock')
    writeFileSync(lock, JSON.stringify({ pid: DEAD_PID, token: 'dead' }))
    expect(withLock(lock, () => 'ran', { isStale: holderGone((h) => [h.pid]) })).toBe('ran')
  })
})
