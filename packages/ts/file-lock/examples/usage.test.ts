/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  claimLock,
  holderGone,
  LockTimeoutError,
  MARKER_STALE_MS,
  pidAlive,
  releaseLock,
  touchLock,
  untouchedFor,
  updateLock,
  withLock,
  type ClaimOptions,
  type HeldLock,
  type HolderGoneOptions,
  type LockClaim,
  type LockContent,
  type LockOptions,
  type StaleRule,
} from '@osdlc/file-lock'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-lock-example-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

test('a short section: read, change and write back one file', () => {
  const counter = join(dir, 'counter')
  writeFileSync(counter, '0')
  const options: LockOptions = { staleMs: 10_000, timeoutMs: 1_000 }
  const bump = (): void =>
    withLock(
      `${counter}.lock`,
      () => writeFileSync(counter, String(Number(readFileSync(counter, 'utf8')) + 1)),
      options,
    )
  bump()
  bump()
  expect(readFileSync(counter, 'utf8')).toBe('2')
})

test('a section that cannot get the lock in time', () => {
  const lock = join(dir, 'busy.lock')
  const claim = claimLock(lock, { pid: process.pid }, { isStale: () => false })
  expect(claim.ok).toBe(true)
  try {
    withLock(lock, () => 'never', { timeoutMs: 0 })
  } catch (err) {
    expect(err).toBeInstanceOf(LockTimeoutError)
    expect((err as LockTimeoutError).holder?.content).toMatchObject({ pid: process.pid })
  }
})

test('a lock held for as long as a process lives, with extra holder pids', () => {
  type Lease = { pid: number; holders: number[] }
  const lock = join(dir, '4000.lease')
  const goneOptions: HolderGoneOptions = { alive: pidAlive }
  const isStale: StaleRule<Partial<Lease>> = holderGone<Partial<Lease>>(
    (c) => [c.pid, ...(c.holders ?? [])],
    goneOptions,
  )
  const options: ClaimOptions<Partial<Lease>> = { isStale, markerStaleMs: MARKER_STALE_MS }

  const mine: LockClaim<Partial<Lease>> = claimLock<Partial<Lease>>(
    lock,
    { pid: process.pid, holders: [] },
    options,
  )
  if (!mine.ok) throw new Error('expected a free lock')

  // A second claimant sees the live holder.
  const other = claimLock<Partial<Lease>>(lock, { pid: process.pid, holders: [] }, options)
  expect(other.ok).toBe(false)
  if (!other.ok) {
    const holder: HeldLock<Partial<Lease>> | null = other.holder
    const content: LockContent<Partial<Lease>> | null = holder?.content ?? null
    expect(content?.pid).toBe(process.pid)
  }

  // Record a child's pid: the lock holds while either is alive.
  expect(
    updateLock<Partial<Lease>>(lock, mine.token, (c) => ({ ...c, holders: [process.pid] })),
  ).toBe(true)
  expect(releaseLock(lock, mine.token)).toBe(true)
})

test('a lock kept alive by its holder touching it', () => {
  const lock = join(dir, 'digest.lock')
  const claim = claimLock(lock, {}, { isStale: untouchedFor(10 * 60_000) })
  if (!claim.ok) throw new Error('expected a free lock')
  expect(touchLock(lock, claim.token)).toBe(true)
  expect(releaseLock(lock, claim.token)).toBe(true)
})
