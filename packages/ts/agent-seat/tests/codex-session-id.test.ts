import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import type { SessionRequest } from '../src/contract.ts'
import {
  findCodexSessionId,
  rolloutCreatedMs,
  rolloutNameTimeMs,
  SESSION_ID_WAIT_MS,
  sessionViaTerminal,
  wrapperSession,
} from '../src/harness.ts'
import { rolloutFileName } from './fixtures/codex-rollout.ts'

/** A clock that only moves when the fake sleep is called, plus a log of the sleeps. */
function fakeClock(start: number, onSleep: (call: number) => void = () => {}) {
  let t = start
  const sleeps: number[] = []
  return {
    sleeps,
    now: () => t,
    sleep: (ms: number) => {
      sleeps.push(ms)
      t += ms
      onSleep(sleeps.length)
    },
  }
}

const meta = (sessionId: string, cwd: string) =>
  `${JSON.stringify({ type: 'session_meta', payload: { session_id: sessionId, cwd } })}\n`

describe('rollout creation instant', () => {
  test('the file name is read as local time', () => {
    expect(rolloutNameTimeMs('/x/rollout-2026-03-04T05-06-07-0199aa.jsonl')).toBe(
      new Date(2026, 2, 4, 5, 6, 7).getTime(),
    )
  })
  test('a name without a valid instant gives null', () => {
    expect(rolloutNameTimeMs('rollout-abc.jsonl')).toBeNull()
    expect(rolloutNameTimeMs('rollout-2026-13-04T05-06-07-x.jsonl')).toBeNull()
    expect(rolloutNameTimeMs('rollout-2026-02-30T05-06-07-x.jsonl')).toBeNull()
  })
  test('name, else birthtime, else mtime', () => {
    const named = new Date(2026, 0, 1, 10, 0, 0).getTime()
    const path = rolloutFileName(named, 'id')
    expect(rolloutCreatedMs(path, { birthtimeMs: named + 500, mtimeMs: named + 9_000 })).toBe(named)
    expect(rolloutCreatedMs('rollout-x.jsonl', { birthtimeMs: 7, mtimeMs: 9 })).toBe(7)
    expect(rolloutCreatedMs('rollout-x.jsonl', { birthtimeMs: 0, mtimeMs: 9 })).toBe(9)
  })
  test('a name later than the last write (another time zone) is not trusted', () => {
    const named = new Date(2026, 0, 1, 10, 0, 0).getTime()
    const stats = { birthtimeMs: named - 3_600_000, mtimeMs: named - 3_600_000 + 10 }
    expect(rolloutCreatedMs(rolloutFileName(named, 'id'), stats)).toBe(stats.birthtimeMs)
  })
})

describe('findCodexSessionId selection and waiting', () => {
  let codexHome: string
  let dayDir: string
  const cwd = '/work/repo'
  beforeEach(() => {
    codexHome = mkdtempSync(join(tmpdir(), 'codex-sid-'))
    dayDir = join(codexHome, 'sessions', '2026', '11', '07')
    mkdirSync(dayDir, { recursive: true })
  })
  afterEach(() => rmSync(codexHome, { recursive: true, force: true }))

  test('an older session in the same cwd that keeps writing is not picked', () => {
    const sinceMs = Date.now()
    const older = join(dayDir, rolloutFileName(sinceMs - 60_000, 'older'))
    writeFileSync(older, meta('older-id', cwd))
    // Still appending: its mtime is after the launch.
    utimesSync(older, new Date(sinceMs + 1_000), new Date(sinceMs + 1_000))
    expect(findCodexSessionId(sinceMs, cwd, { codexHome })).toBeNull()

    const ours = join(dayDir, rolloutFileName(sinceMs, 'ours'))
    writeFileSync(ours, meta('our-id', cwd))
    utimesSync(older, new Date(sinceMs + 2_000), new Date(sinceMs + 2_000))
    expect(findCodexSessionId(sinceMs, cwd, { codexHome })).toBe('our-id')
  })

  test('a rollout that appears after a short delay is found', () => {
    const sinceMs = Date.now()
    const clock = fakeClock(sinceMs, (call) => {
      if (call === 3)
        writeFileSync(join(dayDir, rolloutFileName(sinceMs, 'late')), meta('late-id', cwd))
    })
    expect(
      findCodexSessionId(sinceMs, cwd, {
        codexHome,
        waitMs: 3_000,
        pollMs: 250,
        sleep: clock.sleep,
        now: clock.now,
      }),
    ).toBe('late-id')
    expect(clock.sleeps).toEqual([250, 250, 250])
  })

  test('none found gives null once the budget is spent', () => {
    const clock = fakeClock(1_000_000)
    expect(
      findCodexSessionId(1_000_000, cwd, {
        codexHome,
        waitMs: 1_000,
        pollMs: 300,
        sleep: clock.sleep,
        now: clock.now,
      }),
    ).toBeNull()
    expect(clock.sleeps).toEqual([300, 300, 300, 100])
  })

  test('with the real clock and sleep, gives up within the budget', () => {
    const started = Date.now()
    expect(findCodexSessionId(started, cwd, { codexHome, waitMs: 200, pollMs: 50 })).toBeNull()
    const took = Date.now() - started
    expect(took).toBeGreaterThanOrEqual(200 - 5)
    expect(took).toBeLessThan(2_000)
  })
})

describe('wrapperSession waits only when the host returned early', () => {
  // The resolver reads the real `~/.codex/sessions`; this fresh cwd matches nothing there.
  let cwd: string
  beforeEach(() => {
    cwd = mkdtempSync(join(realpathSync(tmpdir()), 'codex-sid-cwd-'))
  })
  afterEach(() => rmSync(cwd, { recursive: true, force: true }))
  const req = (): SessionRequest => ({
    cwd,
    harness: 'codex',
    binary: 'codex',
    prompt: 'hi',
    title: 't',
  })

  test('a host that returned at once is polled for the default budget', () => {
    const clock = fakeClock(Date.now())
    const res = wrapperSession(() => 0, req(), { sleep: clock.sleep, now: clock.now })
    expect(res).toEqual({ exitCode: 0, harnessSessionId: null })
    expect(clock.sleeps.reduce((a, b) => a + b, 0)).toBe(SESSION_ID_WAIT_MS)
  })

  test('a failed launch, a held launch and a non-codex harness look once', () => {
    const clock = fakeClock(Date.now())
    const opts = { sleep: clock.sleep, now: clock.now }
    expect(wrapperSession(() => 3, req(), opts).exitCode).toBe(3)
    expect(wrapperSession(() => 0, req(), { ...opts, hostWaited: true }).exitCode).toBe(0)
    wrapperSession(() => 0, { ...req(), harness: 'claude', binary: 'claude' }, opts)
    expect(clock.sleeps).toEqual([])
  })

  test('the current terminal and a waiting tmux count as held', () => {
    const started = Date.now()
    const terminal = () => 0
    sessionViaTerminal.call({ name: 'terminal', terminal }, req())
    sessionViaTerminal.call({ name: 'tmux', terminal }, { ...req(), wait: {} })
    expect(Date.now() - started).toBeLessThan(SESSION_ID_WAIT_MS)
  })
})
