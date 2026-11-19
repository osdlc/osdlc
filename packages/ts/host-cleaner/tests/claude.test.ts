import { spawnSync } from 'node:child_process'
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
import { afterEach, describe, expect, test } from 'vitest'

import { fakeRunner, type FakeRunner } from '@osdlc/command-seam/testing'
import type { ProcessProbe } from '@osdlc/repo-cleaner'

import type { HostRow } from '../src/adapter.ts'
import {
  CLOSE_SESSION,
  createClaudeAdapter,
  parseSession,
  projectSlug,
  resumeIdOf,
} from '../src/claude.ts'
import { hostCheck, hostRun } from '../src/clean.ts'
import { hostPlan } from '../src/plan.ts'
import { hostSweep } from '../src/sweep.ts'
import { buildFixture, type Fixture } from './fixture.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})
const temp = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'claude-adapter-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
function fixture(): Fixture {
  const fx = buildFixture()
  cleanups.push(fx.cleanup)
  return fx
}

const ID_A = '11111111-2222-4333-8444-555555555555'
const ID_B = '66666666-7777-4888-9999-000000000000'

/** `ps -axo pid=,lstart=,command=` lines as macOS prints them (recorded shapes). */
const psLine = (pid: number, command: string, lstart = 'Wed Nov 18 23:37:21 2026'): string =>
  `${String(pid).padStart(5)} ${lstart} ${command}`

interface Machine {
  ps: string[]
  cwds: Record<number, string>
}

/** A runner per binary over a recorded process table, and a probe that says every pid is alive. */
function machine(m: Machine) {
  const calls: string[] = []
  const killed: number[] = []
  const alive = new Set(Object.keys(m.cwds).map(Number))
  const runners = {
    ps: fakeRunner((argv) => {
      if (argv[0] === '-axo') return { stdout: m.ps.join('\n') + '\n' }
      const pid = Number(argv.at(-1))
      const line = m.ps.find((l) => Number(l.trim().split(/\s+/)[0]) === pid)
      return line === undefined ? { exitCode: 1 } : { stdout: line + '\n' }
    }),
    lsof: fakeRunner((argv) => {
      const wanted = argv.at(-1)!.split(',').map(Number)
      return {
        stdout: wanted
          .filter((p) => m.cwds[p] !== undefined)
          .map((p) => `p${p}\nfcwd\nn${m.cwds[p]}\n`)
          .join(''),
      }
    }),
    kill: fakeRunner((argv) => {
      killed.push(Number(argv[1]))
      alive.delete(Number(argv[1]))
      return {}
    }),
  }
  const command = (binary: string) => {
    calls.push(binary)
    return (runners as Record<string, FakeRunner>)[binary]!.runner
  }
  const probe: ProcessProbe = { alive: (pid) => alive.has(pid), holders: () => [] }
  return { command, probe, killed, alive }
}

function adapterIn(config: string, over: Parameters<typeof createClaudeAdapter>[0] = {}) {
  return createClaudeAdapter({
    env: { CLAUDE_CONFIG_DIR: config },
    home: '/nonexistent-home',
    tmp: join(config, 'os-tmp'),
    sleep: () => {},
    ...over,
  })
}

const sessionRows = (swept: ReturnType<typeof hostSweep>): HostRow[] =>
  swept.rows.filter((r) => r.kind === 'session')

describe('parseSession', () => {
  test('claude, claude.exe and node running claude are sessions; wrappers, the desktop app and look-alikes are not', () => {
    const cmd = (c: string) => parseSession(psLine(1, c))
    expect(cmd('/opt/homebrew/bin/claude')).toMatchObject({ pid: 1, resumeId: null })
    expect(cmd('/x/node_modules/@anthropic-ai/claude-code/bin/claude.exe')).not.toBeNull()
    expect(cmd('node /usr/local/bin/claude --resume ' + ID_A)?.resumeId).toBe(ID_A)
    expect(cmd('/bin/sh /x/node_modules/.bin/claude')).toBeNull()
    expect(cmd('/Applications/Claude.app/Contents/MacOS/Claude')).toBeNull()
    expect(cmd('/usr/bin/vim claude')).toBeNull()
    expect(cmd('/usr/bin/grep claude')).toBeNull()
    expect(parseSession('garbage')).toBeNull()
  })

  test('the start time is read whole and the day padding does not matter', () => {
    expect(parseSession(psLine(7, 'claude', 'Sat Nov  7 08:01:02 2026'))?.startedAt).toBe(
      'Sat Nov 7 08:01:02 2026',
    )
  })

  test('only a UUID after --resume, --resume= or -r is a resume id', () => {
    expect(resumeIdOf(['--resume', ID_A])).toBe(ID_A)
    expect(resumeIdOf([`--resume=${ID_B}`])).toBe(ID_B)
    expect(resumeIdOf(['-r', ID_A.toUpperCase()])).toBe(ID_A)
    expect(resumeIdOf(['--resume', 'fix the bug'])).toBeNull()
    expect(resumeIdOf(['--resume'])).toBeNull()
    expect(resumeIdOf(['-c'])).toBeNull()
  })

  test('a project slug turns every character but a letter or digit into a dash', () => {
    expect(projectSlug('/Users/me/my_repo.v2/wt')).toBe('-Users-me-my-repo-v2-wt')
  })
})

describe('claude-code adapter: detection', () => {
  const ctxOf = (harnesses: unknown = null) => ({ harnesses }) as never
  const report = (status: 'ok' | 'absent', config: string | null) => ({
    reports: [
      {
        harness: 'claude',
        status,
        configDirs:
          config === null ? [] : [{ name: 'config', path: config, envVar: null, exists: true }],
      },
    ],
  })

  test('a detect-harness report decides, and its config folder holds the transcripts', () => {
    const config = temp()
    const a = adapterIn('/elsewhere')
    expect(a.detect(ctxOf(report('ok', config)))).toBe(true)
    expect(a.detect(ctxOf(report('absent', null)))).toBe(false)
  })

  test('with no report, an existing CLAUDE_CONFIG_DIR counts and a missing one does not', () => {
    expect(adapterIn(temp()).detect(ctxOf())).toBe(true)
    expect(adapterIn(join(temp(), 'missing')).detect(ctxOf())).toBe(false)
  })
})

describe('claude-code adapter: rows', () => {
  function sweepWith(m: Machine, config: string, fx: Fixture, over = {}) {
    const mach = machine(m)
    const adapter = adapterIn(config, over)
    return {
      mach,
      adapter,
      swept: hostSweep([fx.root], {
        cwd: fx.root,
        adapters: [adapter],
        command: mach.command,
        probe: mach.probe,
      }),
    }
  }

  test('two sessions resuming one id both appear and name each other; a lone one names nobody', () => {
    const fx = fixture()
    const config = temp()
    const { swept } = sweepWith(
      {
        ps: [
          psLine(100, `/opt/homebrew/bin/claude --resume ${ID_A}`),
          psLine(200, `/opt/homebrew/bin/claude --resume ${ID_A}`),
          psLine(300, `/opt/homebrew/bin/claude --resume ${ID_B}`),
        ],
        cwds: { 100: fx.root, 200: fx.root, 300: fx.root },
      },
      config,
      fx,
    )
    const [a, b, c] = sessionRows(swept).map((r) => r.evidence)
    expect(a).toMatchObject({ pid: 100, duplicateOf: [200], resumeId: ID_A })
    expect(b).toMatchObject({ pid: 200, duplicateOf: [100] })
    expect(c).toMatchObject({ pid: 300, duplicateOf: [] })
  })

  test('a cwd that is gone, or under the OS temp directory, is an orphan; a live one is not', () => {
    const fx = fixture()
    const config = temp()
    const osTmp = join(config, 'os-tmp')
    mkdirSync(join(osTmp, 'scratch'), { recursive: true })
    const { swept } = sweepWith(
      {
        ps: [1, 2, 3].map((p) => psLine(p, '/opt/homebrew/bin/claude')),
        cwds: { 1: join(fx.root, 'deleted-dir'), 2: join(osTmp, 'scratch'), 3: fx.root },
      },
      config,
      fx,
    )
    expect(sessionRows(swept).map((r) => r.evidence.orphan)).toEqual([true, true, false])
  })

  test('lastWrite is the mtime of the resumed transcript, wherever its project folder is', () => {
    const fx = fixture()
    const config = temp()
    const folder = join(config, 'projects', projectSlug('/some/other/project'))
    mkdirSync(folder, { recursive: true })
    const file = join(folder, `${ID_A}.jsonl`)
    writeFileSync(file, '{}\n')
    const when = new Date('2026-11-18T12:00:00.000Z')
    utimesSync(file, when, when)
    const { swept } = sweepWith(
      {
        ps: [psLine(100, `/opt/homebrew/bin/claude --resume ${ID_A}`)],
        cwds: { 100: fx.root },
      },
      config,
      fx,
    )
    expect(sessionRows(swept)[0]!.evidence.lastWrite).toBe(when.toISOString())
  })

  test('without a resume id the newest transcript in the cwd folder is used', () => {
    const fx = fixture()
    const config = temp()
    const folder = join(config, 'projects', projectSlug(fx.root))
    mkdirSync(folder, { recursive: true })
    for (const [name, iso] of [
      ['old.jsonl', '2026-01-01T00:00:00.000Z'],
      ['new.jsonl', '2026-02-02T00:00:00.000Z'],
    ] as const) {
      writeFileSync(join(folder, name), '{}\n')
      utimesSync(join(folder, name), new Date(iso), new Date(iso))
    }
    const { swept } = sweepWith(
      { ps: [psLine(100, '/opt/homebrew/bin/claude')], cwds: { 100: fx.root } },
      config,
      fx,
    )
    expect(sessionRows(swept)[0]!.evidence.lastWrite).toBe('2026-02-02T00:00:00.000Z')
  })

  test('CLAUDE_CONFIG_DIR moves where transcripts are read from', () => {
    const fx = fixture()
    const [one, two] = [temp(), temp()]
    for (const [dir, iso] of [
      [one, '2026-03-03T00:00:00.000Z'],
      [two, '2026-04-04T00:00:00.000Z'],
    ] as const) {
      const folder = join(dir, 'projects', projectSlug(fx.root))
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, 's.jsonl'), '{}\n')
      utimesSync(join(folder, 's.jsonl'), new Date(iso), new Date(iso))
    }
    const m = { ps: [psLine(100, '/opt/homebrew/bin/claude')], cwds: { 100: fx.root } }
    expect(sessionRows(sweepWith(m, one, fx).swept)[0]!.evidence.lastWrite).toBe(
      '2026-03-03T00:00:00.000Z',
    )
    expect(sessionRows(sweepWith(m, two, fx).swept)[0]!.evidence.lastWrite).toBe(
      '2026-04-04T00:00:00.000Z',
    )
  })

  test('the swept worktree the cwd falls in is named; every row is review, close-session and never unattended', () => {
    const fx = fixture()
    const inner = join(fx.root, 'sub')
    mkdirSync(inner)
    const { swept } = sweepWith(
      { ps: [psLine(100, '/opt/homebrew/bin/claude')], cwds: { 100: inner } },
      temp(),
      fx,
    )
    const row = sessionRows(swept)[0]!
    expect(row).toMatchObject({
      id: 'session:100',
      adapter: 'claude-code',
      kind: 'session',
      verdict: 'review',
      action: 'close',
      risks: [CLOSE_SESSION],
      commands: ['kill -TERM 100'],
    })
    expect(row.evidence).toMatchObject({ worktree: fx.root, unattended: false })
  })

  test('a process table that cannot be read is reported on the adapter, with no rows', () => {
    const fx = fixture()
    const bad = {
      command: () => fakeRunner(() => ({ exitCode: 1, stderr: 'ps: nope' })).runner,
    }
    const swept = hostSweep([fx.root], {
      cwd: fx.root,
      adapters: [adapterIn(temp())],
      ...bad,
    })
    expect(sessionRows(swept)).toEqual([])
    expect(swept.adapters[0]!.error).toContain('ps failed')
  })
})

describe('claude-code adapter: closing a session', () => {
  const setup = (extra: string[] = []) => {
    const fx = fixture()
    const m: Machine = {
      ps: [psLine(100, '/opt/homebrew/bin/claude'), ...extra],
      cwds: { 100: fx.root },
    }
    const mach = machine(m)
    const adapter = adapterIn(temp())
    const opts = { cwd: fx.root, adapters: [adapter], command: mach.command, probe: mach.probe }
    const plan = hostPlan(hostSweep([fx.root], opts))
    return { fx, m, mach, opts, plan }
  }

  test('without --allow close-session the row is dropped as not-allowed and nothing is signalled', () => {
    const { mach, opts, plan } = setup()
    const preview = hostCheck(plan, { pick: ['session:100'] }, opts)
    expect(preview.steps).toEqual([])
    expect(preview.dropped).toEqual([
      { row: 'session:100', reason: 'not-allowed', detail: 'needs close-session' },
    ])
    expect(mach.killed).toEqual([])
  })

  test('the unattended run (no pick) never selects a session row, even with the risk allowed', () => {
    const { mach, opts, plan } = setup()
    const preview = hostCheck(plan, { allow: [CLOSE_SESSION] }, opts)
    expect(preview.steps).toEqual([])
    expect(preview.dropped.map((d) => d.reason)).toEqual(['needs-pick'])
    expect(mach.killed).toEqual([])
  })

  test('picked and allowed, it sends SIGTERM and records that the process exited', () => {
    const { mach, opts, plan } = setup()
    const preview = hostCheck(plan, { pick: ['session:100'], allow: [CLOSE_SESSION] }, opts)
    expect(preview.steps.map((s) => s.command)).toEqual(['kill -TERM 100'])
    const receipt = hostRun(preview, opts)
    expect(receipt.status).toBe('complete')
    expect(receipt.host.steps[0]).toMatchObject({
      result: 'ok',
      verification: 'sent SIGTERM to pid 100; it exited',
    })
    expect(mach.killed).toEqual([100])
  })

  test('a pid reused by a session with another start time is dropped as changed and not signalled', () => {
    const { m, mach, opts, plan } = setup()
    m.ps[0] = psLine(100, '/opt/homebrew/bin/claude', 'Thu Nov 19 01:02:03 2026')
    const preview = hostCheck(plan, { pick: ['session:100'], allow: [CLOSE_SESSION] }, opts)
    expect(preview.dropped).toMatchObject([{ row: 'session:100', reason: 'changed' }])
    expect(mach.killed).toEqual([])
  })

  test('a pid reused by another command is dropped and not signalled', () => {
    const { m, mach, opts, plan } = setup()
    m.ps[0] = psLine(100, '/usr/bin/vim notes.md')
    const preview = hostCheck(plan, { pick: ['session:100'], allow: [CLOSE_SESSION] }, opts)
    expect(preview.steps).toEqual([])
    expect(preview.dropped).toMatchObject([{ row: 'session:100', reason: 'gone' }])
    expect(mach.killed).toEqual([])
  })

  test('execute itself refuses a process that changed after the re-check', () => {
    const { fx, m, mach, opts } = setup()
    const adapter = opts.adapters[0]!
    const row = hostSweep([fx.root], opts).rows[0]!
    m.ps[0] = psLine(100, '/opt/homebrew/bin/claude --dangerously-skip-permissions')
    const ctx = { command: mach.command, probe: mach.probe } as never
    expect(() => adapter.execute!({ row, command: row.commands[0]! }, ctx)).toThrow(
      /not the session that was planned/,
    )
    expect(mach.killed).toEqual([])
  })

  test('a session that ignores SIGTERM fails the step and is not killed harder', () => {
    const { mach, opts, plan } = setup()
    const stubborn = { ...mach.probe, alive: () => true }
    const adapter = adapterIn(temp(), { waitMs: 400 })
    const o = { ...opts, adapters: [adapter], probe: stubborn }
    const preview = hostCheck(plan, { pick: ['session:100'], allow: [CLOSE_SESSION] }, o)
    const receipt = hostRun(preview, o)
    expect(receipt.status).toBe('failed')
    expect(receipt.host.steps[0]!.error).toMatch(/still running 400 ms after SIGTERM/)
    expect(mach.killed).toEqual([100])
  })
})

describe('claude-code adapter: a real process', () => {
  test('SIGTERM stops a process that looks like a session', () => {
    const dir = temp()
    const bin = join(dir, 'claude')
    symlinkSync(realpathSync('/bin/sleep'), bin)
    // The shell exits at once, so launchd or init owns the sleeper and reaps it when it dies.
    const out = spawnSync('/bin/sh', ['-c', `${bin} 300 >/dev/null 2>&1 & echo $!`], {
      encoding: 'utf8',
    })
    const pid = Number(out.stdout.trim())
    cleanups.push(() => {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // already gone
      }
    })
    const fx = fixture()
    const adapter = adapterIn(temp(), { waitMs: 5000 })
    const opts = { cwd: dir, adapters: [adapter] }
    const swept = hostSweep([fx.root], opts)
    const row = sessionRows(swept).find((r) => r.evidence.pid === pid)
    expect(row).toBeDefined()
    const plan = hostPlan(swept)
    const preview = hostCheck(plan, { pick: [row!.id], allow: [CLOSE_SESSION] }, opts)
    expect(preview.steps.map((s) => s.row)).toEqual([row!.id])
    const receipt = hostRun(preview, opts)
    expect(receipt.host.steps).toMatchObject([{ row: row!.id, result: 'ok' }])
    expect(spawnSync('ps', ['-p', String(pid)]).status).toBe(1)
  })
})
