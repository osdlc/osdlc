/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  claimLock,
  holderGone,
  LockTimeoutError,
  MARKER_STALE_MS,
  NotALockError,
  pidAlive,
  processStartedAt,
  releaseLock,
  sameProcess,
  touchLock,
  untouchedFor,
  updateLock,
  withLock,
  type ClaimOptions,
  type HeldLock,
  type Holder,
  type HolderGoneOptions,
  type LockClaim,
  type LockContent,
  type LockOptions,
  type NotALockKind,
  type ProcessStartOptions,
  type PsRunner,
  type SameProcessOptions,
  type SectionHolder,
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

test('a long section judged by its holder process, not by age', () => {
  const lock = join(dir, 'merge.lock')
  const isStale: StaleRule<SectionHolder> = holderGone<SectionHolder>((h) => [h.pid])
  expect(withLock(lock, () => 'merged', { isStale, timeoutMs: 1_000 })).toBe('merged')
})

test('a section that cannot get the lock in time', () => {
  const lock = join(dir, 'busy.lock')
  const claim = claimLock(lock, { pid: process.pid }, { isStale: () => false })
  expect(claim.ok).toBe(true)
  expect(() => withLock(lock, () => 'never', { timeoutMs: 0 })).toThrow(LockTimeoutError)
})

test('a lock held for as long as a process lives, with extra holder pids', () => {
  type Lease = { pid: number; holders: number[] }
  const lock = join(dir, '4000.lease')
  const goneOptions: HolderGoneOptions = { alive: pidAlive }
  const isStale: StaleRule<Partial<Lease>> = holderGone<Partial<Lease>>(
    (c) => [c.pid, ...(c.holders ?? [])],
    goneOptions,
  )
  const options: ClaimOptions<Partial<Lease>> = { isStale }

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

test('a claim that finds a takeover in progress retries after MARKER_STALE_MS at most', () => {
  const lock = join(dir, 'job.lock')
  const claim = claimLock(lock, { pid: process.pid }, { isStale: () => false })
  // A claim with { ok: false, holder: null } met a lock being taken over; trying
  // again once MARKER_STALE_MS has passed outlasts even a reaper that died.
  const retryAt = claim.ok ? null : Date.now() + MARKER_STALE_MS
  expect(retryAt).toBeNull()
})

test('a lock kept alive by its holder touching it', () => {
  const lock = join(dir, 'digest.lock')
  const claim = claimLock(lock, {}, { isStale: untouchedFor(10 * 60_000) })
  if (!claim.ok) throw new Error('expected a free lock')
  expect(touchLock(lock, claim.token)).toBe(true)
  expect(releaseLock(lock, claim.token)).toBe(true)
})

test('a lock only its owner can read', () => {
  const lock = join(dir, 'publisher.lock')
  const claim = claimLock(lock, { pid: process.pid }, { isStale: () => false, mode: 0o600 })
  if (!claim.ok) throw new Error('expected a free lock')
  expect(statSync(lock).mode & 0o777).toBe(0o600)
  expect(releaseLock(lock, claim.token)).toBe(true)
})

test('something other than a lock file at the path is reported, not retried', () => {
  // A directory left by an older mkdir-based lock.
  const lock = join(dir, 'old.lock')
  mkdirSync(lock)
  let kind: NotALockKind | undefined
  try {
    claimLock(lock, { pid: process.pid }, { isStale: () => true })
  } catch (err) {
    if (!(err instanceof NotALockError)) throw err
    kind = err.kind
  }
  expect(kind).toBe('directory')
})

test('a holder recorded with its start time, so a reused pid does not keep the lock', () => {
  type Owner = { pid: number; startedAt: number | null }
  const lock = join(dir, 'owner.lock')
  const me: Owner = { pid: process.pid, startedAt: processStartedAt(process.pid) }
  const holders = (o: Partial<Owner>): Holder[] => [
    { pid: o.pid ?? 0, startedAt: o.startedAt ?? undefined },
  ]
  const claim = claimLock<Partial<Owner>>(lock, me, { isStale: holderGone(holders) })
  if (!claim.ok) throw new Error('expected a free lock')

  // The same pid with another start time is another process: the lock is stale.
  const reused: HeldLock<Partial<Owner>> = {
    content: { pid: process.pid, startedAt: 1 },
    mtimeMs: 0,
    raw: '',
  }
  expect(holderGone(holders)(reused)).toBe(process.platform === 'win32' ? false : true)
  expect(releaseLock(lock, claim.token)).toBe(true)
})

test('start times read through your own ps, as other tools record them', () => {
  // A ps run elsewhere: here it prints a fixed start time, in UTC and the C locale.
  const ps: PsRunner = () => 'Sun Nov  1 08:30:00 2026\n'
  const options: ProcessStartOptions = { platform: 'darwin', ps }
  expect(processStartedAt(4242, options)).toBe(Date.UTC(2026, 10, 1, 8, 30, 0))

  const same: SameProcessOptions = { ...options, alive: () => true }
  expect(sameProcess(4242, '2026-11-01T08:30:00Z', same)).toBe(true)
  // `ps -o lstart` text a Los Angeles process wrote: the same moment, in its zone.
  expect(sameProcess(4242, 'Sun Nov  1 00:30:00 2026', same)).toBe(true)
  expect(sameProcess(4242, '2026-11-01T09:30:00Z', same)).toBe(false)
})
