import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import {
  type HeldLock,
  holderGone,
  processStartedAt,
  type PsRunner,
  sameProcess,
} from '../src/index.ts'

import { DEAD_PID } from './helpers.ts'

const roots: string[] = []
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

/** A fake `/proc`: `btime` in `/proc/stat`, and one `stat` line per pid. */
function fakeProc(bootSeconds: number, stats: Record<number, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'file-lock-proc-'))
  roots.push(root)
  writeFileSync(join(root, 'stat'), `cpu  1 2 3\nbtime ${bootSeconds}\nprocesses 9\n`)
  for (const [pid, line] of Object.entries(stats)) {
    mkdirSync(join(root, pid))
    writeFileSync(join(root, pid, 'stat'), line)
  }
  return root
}

/** A `/proc/<pid>/stat` line whose start time, field 22, is `ticks`. */
function statLine(pid: number, comm: string, ticks: number): string {
  // Fields 3 to 21, then 22, then a few more.
  const middle = Array.from({ length: 19 }, (_, i) => (i === 0 ? 'S' : String(i)))
  return `${pid} (${comm}) ${middle.join(' ')} ${ticks} 1000 2000 3000\n`
}

/** A fake `ps` that records each call and prints `out`. */
function fakePs(
  out: string | null,
): PsRunner & { calls: [readonly string[], Record<string, string>][] } {
  const calls: [readonly string[], Record<string, string>][] = []
  const run: PsRunner = (args, env) => {
    calls.push([args, { ...env }])
    return out
  }
  return Object.assign(run, { calls })
}

const BOOT = 1_762_000_000 // 2025-11-01T12:26:40Z

describe('processStartedAt', () => {
  test('reads this process from the platform, close to its real start', () => {
    if (process.platform === 'win32') return
    const started = processStartedAt(process.pid)
    expect(started).not.toBeNull()
    const expected = Date.now() - process.uptime() * 1000
    expect(Math.abs(started! - expected)).toBeLessThan(5000)
    expect(started! % 1000).toBe(0)
  })

  test('on Linux, is boot time plus the start ticks, without running ps', () => {
    const ps = fakePs('Sun Nov  1 01:30:00 2026\n')
    const root = fakeProc(BOOT, { 42: statLine(42, 'node', 12_345) })
    const started = processStartedAt(42, { platform: 'linux', procRoot: root, ps })
    expect(started).toBe((BOOT + 123) * 1000)
    expect(ps.calls).toEqual([])
  })

  test('reads a command name that holds spaces and parentheses', () => {
    const root = fakeProc(BOOT, { 7: statLine(7, 'bash 2) (x', 500) })
    expect(processStartedAt(7, { platform: 'linux', procRoot: root })).toBe((BOOT + 5) * 1000)
  })

  test('on Linux, a pid with no /proc entry is gone', () => {
    const ps = fakePs('Sun Nov  1 01:30:00 2026\n')
    const root = fakeProc(BOOT, {})
    expect(processStartedAt(99, { platform: 'linux', procRoot: root, ps })).toBeNull()
    expect(ps.calls).toEqual([])
  })

  test('on Linux, a /proc it cannot parse falls back to ps', () => {
    const ps = fakePs('Sun Nov  1 01:30:00 2026\n')
    const root = fakeProc(BOOT, { 42: 'garbage\n' })
    expect(processStartedAt(42, { platform: 'linux', procRoot: root, ps })).toBe(
      Date.UTC(2026, 10, 1, 1, 30, 0),
    )
  })

  test('elsewhere, runs ps in UTC and the C locale and reads it as UTC', () => {
    const ps = fakePs('Sun Nov  1 01:30:00 2026\n')
    expect(processStartedAt(42, { platform: 'darwin', ps })).toBe(Date.UTC(2026, 10, 1, 1, 30, 0))
    expect(ps.calls).toEqual([[['-o', 'lstart=', '-p', '42'], { LC_ALL: 'C', TZ: 'UTC0' }]])
  })

  test('a ps that fails, or prints another locale, gives no start time', () => {
    expect(processStartedAt(42, { platform: 'darwin', ps: fakePs(null) })).toBeNull()
    expect(
      processStartedAt(42, { platform: 'darwin', ps: fakePs('So  1 Nov 01:30:00 2026') }),
    ).toBeNull()
  })

  test('Windows gives no start time and runs nothing', () => {
    const ps = fakePs('Sun Nov  1 01:30:00 2026\n')
    expect(processStartedAt(42, { platform: 'win32', ps })).toBeNull()
    expect(ps.calls).toEqual([])
  })

  test('a pid that is not a positive integer has no start time', () => {
    for (const pid of [0, -1, 1.5, Number.NaN]) expect(processStartedAt(pid)).toBeNull()
  })
})

describe('sameProcess', () => {
  const STARTED = Date.UTC(2026, 10, 1, 8, 30, 0) // 2026-11-01T08:30:00Z
  const live = { alive: () => true, startedAt: () => STARTED }

  test('a dead pid is never the same process', () => {
    expect(sameProcess(DEAD_PID, '2026-11-01T08:30:00Z')).toBe(false)
    expect(sameProcess(42, STARTED, { ...live, alive: () => false })).toBe(false)
  })

  test('an instant with a zone matches within two seconds', () => {
    expect(sameProcess(42, '2026-11-01T08:30:00Z', live)).toBe(true)
    expect(sameProcess(42, '2026-11-01T09:30:01.500+01:00', live)).toBe(true)
    expect(sameProcess(42, '2026-11-01T08:30:03Z', live)).toBe(false)
    expect(sameProcess(42, '2026-11-01T09:30:00Z', live)).toBe(false)
  })

  test('epoch seconds and ms match, as numbers or text', () => {
    for (const recorded of [STARTED, STARTED / 1000, String(STARTED), String(STARTED / 1000)]) {
      expect(sameProcess(42, recorded, live)).toBe(true)
    }
    expect(sameProcess(42, STARTED / 1000 + 3600, live)).toBe(false)
  })

  test('zoneless ps text matches in any real time zone, so its writer need not be known', () => {
    // 08:30Z as a UTC, a Los Angeles (UTC-8) and a Kathmandu (UTC+5:45) process printed it.
    for (const text of [
      'Sun Nov  1 08:30:00 2026',
      'Sun Nov  1 00:30:00 2026',
      'Sun Nov  1 14:15:00 2026',
    ]) {
      expect(sameProcess(42, text, live)).toBe(true)
    }
    // Seven minutes off is no zone's offset, and twenty hours is past any.
    expect(sameProcess(42, 'Sun Nov  1 08:37:00 2026', live)).toBe(false)
    expect(sameProcess(42, 'Mon Nov  2 04:30:00 2026', live)).toBe(false)
  })

  test('the repeated hour of a daylight-saving fall-back cannot make a live owner look gone', () => {
    // 01:30 local on 2026-11-01 in New York is either 05:30Z or 06:30Z; both are zone offsets.
    const started = { alive: () => true, startedAt: () => Date.UTC(2026, 10, 1, 6, 30, 0) }
    expect(sameProcess(42, 'Sun Nov  1 01:30:00 2026', started)).toBe(true)
  })

  test('when either start time cannot be read, the owner cannot be ruled out', () => {
    for (const recorded of ['2026-11-01', 'So  1 Nov 01:30:00 2026', 'soon', '', 0, -5]) {
      expect(sameProcess(42, recorded, live)).toBe(true)
    }
    expect(sameProcess(42, '2026-11-01T09:30:00Z', { ...live, startedAt: () => null })).toBe(true)
  })

  test('this process matches its own start time, as an instant and as local ps text', () => {
    if (process.platform === 'win32') return
    const started = processStartedAt(process.pid)!
    expect(sameProcess(process.pid, new Date(started).toISOString())).toBe(true)
    expect(sameProcess(process.pid, started + 3_600_000)).toBe(false)
    const local = new Date(started)
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][local.getDay()]
    const month = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ][local.getMonth()]
    const two = (n: number): string => String(n).padStart(2, '0')
    const text = `${day} ${month} ${String(local.getDate()).padStart(2, ' ')} ${two(local.getHours())}:${two(local.getMinutes())}:${two(local.getSeconds())} ${local.getFullYear()}`
    expect(sameProcess(process.pid, text)).toBe(true)
  })
})

describe('holderGone with recorded start times', () => {
  type Owner = { pid?: number; startedAt?: string }
  const held = (content: Owner): HeldLock<Owner> => ({
    content,
    mtimeMs: 0,
    raw: JSON.stringify(content),
  })
  const STARTED = Date.UTC(2026, 10, 1, 8, 30, 0)
  const rule = holderGone<Owner>((c) => [{ pid: c.pid!, startedAt: c.startedAt }], {
    alive: () => true,
    startedAt: () => STARTED,
  })

  test('a live pid that started at another time is a reused pid: the lock is stale', () => {
    expect(rule(held({ pid: 42, startedAt: '2026-11-01T08:30:00Z' }))).toBe(false)
    expect(rule(held({ pid: 42, startedAt: '2026-11-01T11:00:00Z' }))).toBe(true)
  })

  test('a holder recorded without a start time is judged on liveness alone', () => {
    expect(rule(held({ pid: 42 }))).toBe(false)
  })

  test('an entry with no numeric pid names no holder', () => {
    const loose = holderGone<Owner>(() => [{ pid: 'x' as unknown as number }, null, 'y'])
    expect(loose(held({}))).toBe(true)
  })
})
