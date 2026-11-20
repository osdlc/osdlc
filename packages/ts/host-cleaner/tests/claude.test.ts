/** The `claude-code` plugin over recorded process tables, plus one real process. */

import { afterEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fakeRunner, type FakeRunner } from '@osdlc/command-seam/testing'
import type { ProcessProbe } from '@osdlc/repo-cleaner'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

import {
  CLOSE_SESSION,
  claudeCodePlugin,
  clean,
  plan,
  survey,
  type Candidate,
  type ClaudeOptions,
  type Ctx,
} from '../src/index.ts'
import { parseSession, projectSlug, resumeIdOf } from '../src/claude.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})
const temp = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'claude-plugin-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A repository with one commit. */
function repo(): string {
  const dir = temp()
  makeGitFixture({ dir, initialBranch: 'main' })
  new Git(dir, { env: { ...IDENTITY } }).rawChecked(['commit', '--allow-empty', '-m', 'initial'])
  return dir
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

/** A runner per binary over a recorded process table, and a probe that says every listed pid is alive. */
function machine(m: Machine) {
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
  const command = (binary: string) => (runners as Record<string, FakeRunner>)[binary]!.runner
  const probe: ProcessProbe = { alive: (pid) => alive.has(pid), holders: () => [] }
  return { command, probe, killed }
}

function pluginIn(config: string, over: ClaudeOptions = {}) {
  return claudeCodePlugin({
    env: { CLAUDE_CONFIG_DIR: config },
    home: '/nonexistent-home',
    tmp: join(config, 'os-tmp'),
    sleep: () => {},
    ...over,
  })
}

const ctxOf = (root: string): Ctx => ({ cwd: root, targets: [root], allow: [] })
const sessions = (cs: readonly Candidate[]): Candidate[] => cs.filter((c) => c.kind === 'session')

describe('parseSession', () => {
  test('claude, claude.exe and node running claude are sessions; wrappers, the desktop app and look-alikes are not', () => {
    const cmd = (c: string) => parseSession(psLine(1, c))
    expect(cmd('/opt/homebrew/bin/claude')).toMatchObject({ pid: 1, resumeId: null })
    expect(cmd('/x/node_modules/@anthropic-ai/claude-code/bin/claude.exe')).not.toBeNull()
    expect(cmd('node /usr/local/bin/claude --resume ' + ID_A)?.resumeId).toBe(ID_A)
    expect(cmd('/bin/sh /x/node_modules/.bin/claude')).toBeNull()
    expect(cmd('/opt/Agent Tools/claude --resume ' + ID_A)).toBeNull()
    expect(cmd('/usr/bin/vim /tmp/claude')).toBeNull()
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

describe('detection', () => {
  const report = (status: 'ok' | 'absent', config: string | null) =>
    ({
      reports: [
        {
          harness: 'claude',
          status,
          configDirs:
            config === null ? [] : [{ name: 'config', path: config, envVar: null, exists: true }],
        },
      ],
    }) as never
  const ctx = ctxOf('/x')

  test('a detect-harness report decides', () => {
    expect(pluginIn('/elsewhere', { harnesses: report('ok', temp()) }).detect(ctx)).toBe(true)
    expect(pluginIn('/elsewhere', { harnesses: report('absent', null) }).detect(ctx)).toBe(false)
  })

  test('with no report, an existing CLAUDE_CONFIG_DIR counts and a missing one does not', () => {
    expect(pluginIn(temp()).detect(ctx)).toBe(true)
    expect(pluginIn(join(temp(), 'missing')).detect(ctx)).toBe(false)
  })
})

describe('candidates', () => {
  function found(m: Machine, config: string, root: string, over: ClaudeOptions = {}) {
    const mach = machine(m)
    const plugin = pluginIn(config, { command: mach.command, probe: mach.probe, ...over })
    return { mach, plugin, s: survey([plugin], ctxOf(root)) }
  }

  test('two sessions resuming one id both appear and name each other; a lone one names nobody', () => {
    const root = repo()
    const { s } = found(
      {
        ps: [
          psLine(100, `/opt/homebrew/bin/claude --resume ${ID_A}`),
          psLine(200, `/opt/homebrew/bin/claude --resume ${ID_A}`),
          psLine(300, `/opt/homebrew/bin/claude --resume ${ID_B}`),
        ],
        cwds: { 100: root, 200: root, 300: root },
      },
      temp(),
      root,
    )
    const [a, b, c] = sessions(s.candidates).map((x) => x.evidence)
    expect(a).toMatchObject({ pid: 100, duplicateOf: [200], resumeId: ID_A })
    expect(b).toMatchObject({ pid: 200, duplicateOf: [100] })
    expect(c).toMatchObject({ pid: 300, duplicateOf: [] })
  })

  test('a cwd that is gone, or under the OS temp directory, is an orphan; a live one is not', () => {
    const root = repo()
    const config = temp()
    const osTmp = join(config, 'os-tmp')
    mkdirSync(join(osTmp, 'scratch'), { recursive: true })
    const { s } = found(
      {
        ps: [1, 2, 3].map((p) => psLine(p, '/opt/homebrew/bin/claude')),
        cwds: { 1: join(root, 'deleted-dir'), 2: join(osTmp, 'scratch'), 3: root },
      },
      config,
      root,
    )
    expect(sessions(s.candidates).map((c) => c.evidence.orphan)).toEqual([true, true, false])
  })

  test('lastWrite is the mtime of the resumed transcript, wherever its project folder is', () => {
    const root = repo()
    const config = temp()
    const folder = join(config, 'projects', projectSlug('/some/other/project'))
    mkdirSync(folder, { recursive: true })
    const file = join(folder, `${ID_A}.jsonl`)
    writeFileSync(file, '{}\n')
    const when = new Date('2026-11-18T12:00:00.000Z')
    utimesSync(file, when, when)
    const { s } = found(
      { ps: [psLine(100, `/opt/homebrew/bin/claude --resume ${ID_A}`)], cwds: { 100: root } },
      config,
      root,
    )
    expect(sessions(s.candidates)[0]!.evidence.lastWrite).toBe(when.toISOString())
  })

  test('without a resume id the newest transcript in the cwd folder is used, in the configured folder', () => {
    const root = repo()
    const [one, two] = [temp(), temp()]
    for (const [dir, iso] of [
      [one, '2026-03-03T00:00:00.000Z'],
      [two, '2026-04-04T00:00:00.000Z'],
    ] as const) {
      const folder = join(dir, 'projects', projectSlug(root))
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, 'old.jsonl'), '{}\n')
      utimesSync(
        join(folder, 'old.jsonl'),
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-01T00:00:00Z'),
      )
      writeFileSync(join(folder, 's.jsonl'), '{}\n')
      utimesSync(join(folder, 's.jsonl'), new Date(iso), new Date(iso))
    }
    const m = { ps: [psLine(100, '/opt/homebrew/bin/claude')], cwds: { 100: root } }
    expect(sessions(found(m, one, root).s.candidates)[0]!.evidence.lastWrite).toBe(
      '2026-03-03T00:00:00.000Z',
    )
    expect(sessions(found(m, two, root).s.candidates)[0]!.evidence.lastWrite).toBe(
      '2026-04-04T00:00:00.000Z',
    )
  })

  test('the checkout the cwd falls in is named; every candidate is a close-session protest and never unattended', () => {
    const root = repo()
    const inner = join(root, 'sub')
    mkdirSync(inner)
    const { s } = found(
      { ps: [psLine(100, '/opt/homebrew/bin/claude')], cwds: { 100: inner } },
      temp(),
      root,
    )
    const c = sessions(s.candidates)[0]!
    expect(c).toMatchObject({
      id: 'session:100',
      kind: 'session',
      owner: 'claude-code',
      path: inner,
      unattended: false,
    })
    expect(c.evidence).toMatchObject({ worktree: root, unattended: false })
    expect(s.objections).toEqual([
      expect.objectContaining({ candidate: 'session:100', level: 'protest', code: CLOSE_SESSION }),
    ])
  })

  test('a process table that cannot be read warns and proposes nothing', () => {
    const root = repo()
    const plugin = pluginIn(temp(), {
      command: () => fakeRunner(() => ({ exitCode: 1, stderr: 'ps: nope' })).runner,
    })
    const s = survey([plugin], ctxOf(root))
    expect(s.candidates).toEqual([])
    expect(s.warnings.join('\n')).toContain('ps failed')
  })
})

describe('closing a session', () => {
  const setup = (over: ClaudeOptions = {}) => {
    const root = repo()
    const m: Machine = { ps: [psLine(100, '/opt/homebrew/bin/claude')], cwds: { 100: root } }
    const mach = machine(m)
    const plugin = pluginIn(temp(), { command: mach.command, probe: mach.probe, ...over })
    const ctx = ctxOf(root)
    return { m, mach, plugin, ctx, planned: survey([plugin], ctx) }
  }

  test('without --allow close-session a pick is dropped as not-allowed and nothing is signalled', () => {
    const { mach, plugin, ctx, planned } = setup()
    const receipt = clean(plan(planned, { pick: ['session:100'] }), [plugin], ctx)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped).toEqual([
      expect.objectContaining({ id: 'session:100', reason: 'not-allowed' }),
    ])
    expect(mach.killed).toEqual([])
  })

  test('a run with no pick never takes a session, even with the protest allowed', () => {
    const { mach, plugin, ctx, planned } = setup()
    const receipt = clean(plan(planned, { allow: [CLOSE_SESSION] }), [plugin], {
      ...ctx,
      allow: [CLOSE_SESSION],
    })
    expect(receipt.steps).toEqual([])
    expect(mach.killed).toEqual([])
  })

  test('picked and allowed, it sends SIGTERM and records that the process exited', () => {
    const { mach, plugin, ctx, planned } = setup()
    const receipt = clean(
      plan(planned, { pick: ['session:100'], allow: [CLOSE_SESSION] }),
      [plugin],
      {
        ...ctx,
        allow: [CLOSE_SESSION],
      },
    )
    expect(receipt.status).toBe('complete')
    expect(receipt.steps[0]).toMatchObject({
      result: 'ok',
      delete: 'sent SIGTERM to pid 100; it exited',
    })
    expect(mach.killed).toEqual([100])
  })

  test('a pid reused by a session with another start time is dropped as changed and not signalled', () => {
    const { m, mach, plugin, ctx, planned } = setup()
    const p = plan(planned, { pick: ['session:100'], allow: [CLOSE_SESSION] })
    m.ps[0] = psLine(100, '/opt/homebrew/bin/claude', 'Thu Nov 19 01:02:03 2026')
    const receipt = clean(p, [plugin], { ...ctx, allow: [CLOSE_SESSION] })
    expect(receipt.dropped).toEqual([
      expect.objectContaining({ id: 'session:100', reason: 'changed' }),
    ])
    expect(mach.killed).toEqual([])
  })

  test('a pid reused by another command is dropped as gone and not signalled', () => {
    const { m, mach, plugin, ctx, planned } = setup()
    const p = plan(planned, { pick: ['session:100'], allow: [CLOSE_SESSION] })
    m.ps[0] = psLine(100, '/usr/bin/vim notes.md')
    const receipt = clean(p, [plugin], { ...ctx, allow: [CLOSE_SESSION] })
    expect(receipt.dropped).toEqual([
      expect.objectContaining({ id: 'session:100', reason: 'gone' }),
    ])
    expect(mach.killed).toEqual([])
  })

  test('delete itself refuses a process that changed after the re-check', () => {
    const { m, mach, plugin, ctx, planned } = setup()
    m.ps[0] = psLine(100, '/opt/homebrew/bin/claude --dangerously-skip-permissions')
    expect(() => plugin.delete!(planned.candidates[0]!, ctx)).toThrow(
      /not the session that was planned/,
    )
    expect(mach.killed).toEqual([])
  })

  test('a session that ignores SIGTERM fails the step and is not killed harder', () => {
    const base = setup()
    const stubborn = { ...base.mach.probe, alive: () => true }
    const plugin = pluginIn(temp(), { command: base.mach.command, probe: stubborn, waitMs: 400 })
    const receipt = clean(
      plan(base.planned, { pick: ['session:100'], allow: [CLOSE_SESSION] }),
      [plugin],
      { ...base.ctx, allow: [CLOSE_SESSION] },
    )
    expect(receipt.status).toBe('failed')
    expect(receipt.steps[0]!.error).toMatch(/still running 400 ms after SIGTERM/)
    expect(base.mach.killed).toEqual([100])
  })
})

describe('a real process', () => {
  test('SIGTERM stops a process that looks like a session', () => {
    const dir = temp()
    const bin = join(dir, 'claude')
    // `node <dir>/claude` reads as a session. (A symlink to sleep would not run on
    // systems whose sleep is a multi-call binary.)
    writeFileSync(bin, 'setTimeout(() => {}, 300000)\n')
    // The shell exits at once, so init owns the process and reaps it when it dies.
    const out = spawnSync(
      '/bin/sh',
      ['-c', `"${process.execPath}" "${bin}" >/dev/null 2>&1 & echo $!`],
      { encoding: 'utf8' },
    )
    const pid = Number(out.stdout.trim())
    cleanups.push(() => {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // already gone
      }
    })
    const root = repo()
    const plugin = pluginIn(temp(), { waitMs: 5000 })
    const ctx = { ...ctxOf(root), cwd: dir, allow: [CLOSE_SESSION] }
    const s = survey([plugin], ctx)
    const c = sessions(s.candidates).find((x) => x.evidence.pid === pid)
    const seen = spawnSync('ps', ['-o', 'pid=,lstart=,command=', '-p', String(pid)], {
      encoding: 'utf8',
    }).stdout
    expect(
      c,
      JSON.stringify({ pid, warnings: s.warnings, plugins: s.plugins.map((p) => p.name), seen }),
    ).toBeDefined()
    const receipt = clean(plan(s, { pick: [c!.id], allow: [CLOSE_SESSION] }), [plugin], ctx)
    expect(receipt.steps).toMatchObject([{ id: c!.id, result: 'ok' }])
    expect(spawnSync('ps', ['-p', String(pid)]).status).toBe(1)
  })
})
