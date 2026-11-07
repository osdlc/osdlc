import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import type { SessionRequest } from '../src/contract.ts'
import {
  codexSessionsDir,
  findCodexSessionId,
  rolloutCreatedMs,
  rolloutDayDirs,
  rolloutNameTimeMs,
  SESSION_ID_WAIT_MS,
  sessionViaTerminal,
  wrapperSession,
} from '../src/harness.ts'
import { makeTerminalHost } from '../src/hosts/terminal.ts'
import { rolloutDayDir, rolloutFileName } from './fixtures/codex-rollout.ts'

// A host's `session` part takes no codex home, so `homedir()` points at a temp dir:
// no test here reads the real `~/.codex`.
const home = vi.hoisted(() => ({ dir: '' }))
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>()
  const homedir = () => home.dir
  return { ...os, homedir, default: { ...os, homedir } }
})
beforeAll(() => {
  home.dir = mkdtempSync(join(tmpdir(), 'codex-sid-home-'))
})
afterAll(() => rmSync(home.dir, { recursive: true, force: true }))

// A file's birthtime cannot be set, so a test that needs an old one names it here and
// `statSync` reports it.
const birth = vi.hoisted(() => new Map<string, number>())
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  const statSync = ((...args: Parameters<typeof fs.statSync>) => {
    const stats = fs.statSync(...args)
    const born = birth.get(String(args[0]))
    if (stats !== undefined && born !== undefined) stats.birthtimeMs = born
    return stats
  }) as typeof fs.statSync
  return { ...fs, statSync, default: { ...fs, statSync } }
})
afterEach(() => birth.clear())

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
  test('birthtime, else name, else mtime', () => {
    const named = new Date(2026, 0, 1, 10, 0, 0).getTime()
    const path = rolloutFileName(named, 'id')
    expect(rolloutCreatedMs(path, { birthtimeMs: named + 500, mtimeMs: named + 9_000 })).toBe(
      named + 500,
    )
    expect(rolloutCreatedMs(path, { birthtimeMs: 0, mtimeMs: named + 9_000 })).toBe(named)
    expect(rolloutCreatedMs('rollout-x.jsonl', { birthtimeMs: 0, mtimeMs: 9 })).toBe(9)
  })
  test('a name 8 hours before its birthtime (codex west of the caller) gives the birthtime', () => {
    const born = new Date(2026, 0, 1, 18, 0, 0).getTime()
    const path = rolloutFileName(born - 8 * 3_600_000, 'id')
    expect(rolloutCreatedMs(path, { birthtimeMs: born, mtimeMs: born + 10 })).toBe(born)
  })
  test('without a birthtime, a name later than the last write is not trusted', () => {
    const named = new Date(2026, 0, 1, 10, 0, 0).getTime()
    const stats = { birthtimeMs: 0, mtimeMs: named - 3_600_000 }
    expect(rolloutCreatedMs(rolloutFileName(named, 'id'), stats)).toBe(stats.mtimeMs)
  })
  test('the date folders run from a day or two before the launch to a day or two after now', () => {
    const launch = new Date(2026, 10, 7, 12, 0, 0).getTime()
    const dirs = rolloutDayDirs('/s', launch, launch + 60_000)
    expect(dirs).toEqual([
      join('/s', '2026', '11', '06'),
      join('/s', '2026', '11', '07'),
      join('/s', '2026', '11', '08'),
    ])
    const lateNight = new Date(2026, 11, 31, 23, 0, 0).getTime()
    const across = rolloutDayDirs('/s', lateNight, lateNight)
    expect(across[0]).toBe(join('/s', '2026', '12', '30'))
    expect(across.at(-1)).toBe(join('/s', '2027', '01', '02'))
  })
})

describe('findCodexSessionId selection and waiting', () => {
  let codexHome: string
  let dayDir: string
  const cwd = '/work/repo'
  beforeEach(() => {
    codexHome = mkdtempSync(join(tmpdir(), 'codex-sid-'))
    dayDir = rolloutDayDir(codexSessionsDir(codexHome), Date.now())
    mkdirSync(dayDir, { recursive: true })
  })
  afterEach(() => rmSync(codexHome, { recursive: true, force: true }))

  test('an older session in the same cwd that keeps writing is not picked', () => {
    const sinceMs = Date.now()
    const older = join(dayDir, rolloutFileName(sinceMs - 60_000, 'older'))
    writeFileSync(older, meta('older-id', cwd))
    birth.set(older, sinceMs - 60_000)
    // Still appending: its mtime is after the launch.
    utimesSync(older, new Date(sinceMs + 1_000), new Date(sinceMs + 1_000))
    expect(findCodexSessionId(sinceMs, cwd, { codexHome })).toBeNull()

    const ours = join(dayDir, rolloutFileName(sinceMs, 'ours'))
    writeFileSync(ours, meta('our-id', cwd))
    utimesSync(older, new Date(sinceMs + 2_000), new Date(sinceMs + 2_000))
    expect(findCodexSessionId(sinceMs, cwd, { codexHome })).toBe('our-id')
  })

  test('a rollout named in a time zone west of the caller is found by its birthtime', () => {
    const sinceMs = Date.now()
    const named = sinceMs - 8 * 3_600_000
    const westDir = rolloutDayDir(codexSessionsDir(codexHome), named)
    mkdirSync(westDir, { recursive: true })
    const path = join(westDir, rolloutFileName(named, 'west'))
    writeFileSync(path, meta('west-id', cwd))
    birth.set(path, sinceMs + 10)
    expect(findCodexSessionId(sinceMs, cwd, { codexHome })).toBe('west-id')
  })

  test('a name more than 26 hours before the launch rules the file out unread', () => {
    const sinceMs = Date.now()
    const path = join(dayDir, rolloutFileName(sinceMs - 27 * 3_600_000, 'stale'))
    writeFileSync(path, meta('stale-id', cwd))
    // Its stats would let it through; the name alone rules it out.
    birth.set(path, sinceMs + 10)
    expect(findCodexSessionId(sinceMs, cwd, { codexHome, listFiles: () => [path] })).toBeNull()
  })

  test('only the date folders around the launch are read', () => {
    const sinceMs = Date.now()
    const farDir = join(codexSessionsDir(codexHome), '2020', '01', '01')
    mkdirSync(farDir, { recursive: true })
    writeFileSync(join(farDir, rolloutFileName(sinceMs, 'far')), meta('far-id', cwd))
    expect(findCodexSessionId(sinceMs, cwd, { codexHome })).toBeNull()
    writeFileSync(join(dayDir, rolloutFileName(sinceMs, 'near')), meta('near-id', cwd))
    expect(findCodexSessionId(sinceMs, cwd, { codexHome })).toBe('near-id')
  })

  // Creating a symlink needs extra rights on Windows.
  test.skipIf(process.platform === 'win32')(
    'a cwd reached through a symlink matches the real path codex records',
    () => {
      const sinceMs = Date.now()
      const real = realpathSync(mkdtempSync(join(tmpdir(), 'codex-sid-real-')))
      const link = join(codexHome, 'link')
      symlinkSync(real, link)
      try {
        writeFileSync(join(dayDir, rolloutFileName(sinceMs, 'linked')), meta('linked-id', real))
        expect(findCodexSessionId(sinceMs, link, { codexHome })).toBe('linked-id')
      } finally {
        rmSync(real, { recursive: true, force: true })
      }
    },
  )

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

  test('only the first line is read, however long, with or without its newline', () => {
    const sinceMs = Date.now()
    const longCwd = `/work/${'x'.repeat(10_000)}`
    writeFileSync(
      join(dayDir, rolloutFileName(sinceMs, 'long')),
      `${meta('long-id', longCwd)}{"more":1}\n`,
    )
    expect(findCodexSessionId(sinceMs, longCwd, { codexHome })).toBe('long-id')
    writeFileSync(join(dayDir, rolloutFileName(sinceMs, 'bare')), meta('bare-id', cwd).trimEnd())
    expect(findCodexSessionId(sinceMs, cwd, { codexHome })).toBe('bare-id')
  })

  test('a rollout ruled out for its cwd is not read again on a later look', () => {
    const sinceMs = Date.now()
    const path = join(dayDir, rolloutFileName(sinceMs, 'other'))
    writeFileSync(path, meta('other-id', '/elsewhere'))
    const clock = fakeClock(sinceMs, () => writeFileSync(path, meta('other-id', cwd)))
    const found = findCodexSessionId(sinceMs, cwd, {
      codexHome,
      waitMs: 500,
      pollMs: 250,
      sleep: clock.sleep,
      now: clock.now,
    })
    expect(found).toBeNull()
    expect(clock.sleeps).toEqual([250, 250])
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
  let cwd: string
  let codexHome: string
  beforeEach(() => {
    cwd = mkdtempSync(join(realpathSync(tmpdir()), 'codex-sid-cwd-'))
    codexHome = mkdtempSync(join(tmpdir(), 'codex-sid-home-'))
  })
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(codexHome, { recursive: true, force: true })
  })
  const req = (): SessionRequest => ({
    cwd,
    harness: 'codex',
    binary: 'codex',
    prompt: 'hi',
    title: 't',
  })

  test('a host that returned at once is polled for the default budget', () => {
    const clock = fakeClock(Date.now())
    const res = wrapperSession(() => 0, req(), { codexHome, sleep: clock.sleep, now: clock.now })
    expect(res).toEqual({ exitCode: 0, harnessSessionId: null })
    expect(clock.sleeps.reduce((a, b) => a + b, 0)).toBe(SESSION_ID_WAIT_MS)
  })

  test('a failed launch, a held launch and a non-codex harness look once', () => {
    const clock = fakeClock(Date.now())
    const opts = { codexHome, sleep: clock.sleep, now: clock.now }
    expect(wrapperSession(() => 3, req(), opts).exitCode).toBe(3)
    expect(wrapperSession(() => 0, req(), { ...opts, hostWaited: true }).exitCode).toBe(0)
    wrapperSession(() => 0, { ...req(), harness: 'claude', binary: 'claude' }, opts)
    expect(clock.sleeps).toEqual([])
  })

  test('the terminal host and a waiting tmux count as held', () => {
    expect(codexSessionsDir().startsWith(home.dir)).toBe(true)
    const started = Date.now()
    const terminalHost = makeTerminalHost({
      streamRunner: () => ({ run: () => ({ exitCode: 0 }) }),
    })
    expect(terminalHost.session!({ ...req(), binary: 'node' }).exitCode).toBe(0)
    sessionViaTerminal.call({ name: 'tmux', terminal: () => 0 }, { ...req(), wait: {} })
    expect(Date.now() - started).toBeLessThan(SESSION_ID_WAIT_MS)
  })

  test('a codex home given to wrapperSession is where the rollout is looked up', () => {
    const dayDir = rolloutDayDir(codexSessionsDir(codexHome), Date.now())
    mkdirSync(dayDir, { recursive: true })
    writeFileSync(join(dayDir, rolloutFileName(Date.now(), 'mine')), meta('mine-id', cwd))
    expect(wrapperSession(() => 0, req(), { codexHome, hostWaited: true })).toEqual({
      exitCode: 0,
      harnessSessionId: 'mine-id',
    })
  })
})
