/**
 * Takeover races forced in one process. Two reapers can read the same stale
 * lock; here the first reaper's read runs a second claim to completion before
 * the first continues.
 */
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { claimLock, holderGone, untouchedFor, withLock } from '../src/index.ts'

const hooks = vi.hoisted(() => ({ afterRead: undefined as ((path: string) => void) | undefined }))

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const readFileSync = ((...args: Parameters<typeof real.readFileSync>) => {
    const out = real.readFileSync(...args)
    hooks.afterRead?.(String(args[0]))
    return out
  }) as typeof real.readFileSync
  return { ...real, default: { ...real, readFileSync }, readFileSync }
})

// Above every platform's pid_max, so it can never name a live process.
const DEAD_PID = 2147483646

let dir: string
let lock: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-lock-race-'))
  lock = join(dir, 'x.lock')
})
afterEach(() => {
  hooks.afterRead = undefined
  rmSync(dir, { recursive: true, force: true })
})

/** Run `inner` once, the first time the lock is read. */
function onFirstRead(inner: () => void): void {
  hooks.afterRead = (p) => {
    if (p !== lock) return
    hooks.afterRead = undefined
    inner()
  }
}

test('two reapers of one dead-holder lock cannot both win', () => {
  writeFileSync(lock, JSON.stringify({ pid: DEAD_PID, token: 'dead' }))
  const isStale = holderGone<{ pid?: number }>((c) => [c.pid])

  let inner: boolean | undefined
  onFirstRead(() => {
    inner = claimLock(lock, { pid: process.pid }, { isStale }).ok
  })
  const outer = claimLock(lock, { pid: process.pid }, { isStale }).ok

  expect(inner).toBeDefined()
  expect([outer, inner].filter(Boolean)).toHaveLength(1)
  expect(readdirSync(dir)).toEqual(['x.lock'])
})

test('a reaper overtaken while judging a stale lock leaves the fresh lock alone', () => {
  writeFileSync(lock, JSON.stringify({ token: 'dead' }))
  const isStale = (h: { content: { token?: string } | null }): boolean =>
    h.content?.token === 'dead'

  let fresh: string | undefined
  onFirstRead(() => {
    const r = claimLock(lock, {}, { isStale })
    if (r.ok) fresh = r.token
  })
  const outer = claimLock(lock, {}, { isStale })

  expect(fresh).toBeDefined()
  expect(outer.ok).toBe(false)
  if (!outer.ok) expect(outer.holder?.content?.token).toBe(fresh)
})

test('withLock: a waiter overtaken while taking over a stale lock waits for the new holder', () => {
  writeFileSync(lock, JSON.stringify({ pid: DEAD_PID }))
  const old = new Date(Date.now() - 60_000)
  utimesSync(lock, old, old)

  let overtaker: boolean | undefined
  onFirstRead(() => {
    overtaker = claimLock(lock, {}, { isStale: untouchedFor(1000) }).ok
  })
  expect(() => withLock(lock, () => 'ran', { staleMs: 1000, timeoutMs: 0 })).toThrow('timed out')
  expect(overtaker).toBe(true)
})
