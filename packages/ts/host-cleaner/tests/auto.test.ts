/** `--auto`: the unattended subset as a pure function, the run through the CLI, the lock, and the launchd agent. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'
import { claimLock } from '@osdlc/file-lock'
import { fakeRunner } from '@osdlc/command-seam/testing'
import type { Row } from '@osdlc/repo-cleaner'

import type { HostRow } from '../src/adapter.ts'
import { selectUnattended } from '../src/auto.ts'
import { main, type MainDeps } from '../src/cli.ts'
import { hostDirs } from '../src/config.ts'
import { SCHEDULE_LABEL, plistPath, renderPlist } from '../src/schedule.ts'
import type { HostSweep } from '../src/sweep.ts'
import { buildFixture, fakeAdapter, hostRow, sh, type Fixture } from './fixture.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-auto-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const wtRow = (id: string, over: Partial<Row> = {}): Row =>
  ({
    id,
    kind: 'worktree',
    name: id.slice('worktree:'.length),
    verdict: 'delete',
    action: 'remove',
    why: 'landed',
    risks: [],
    blockers: [],
    commands: [],
    notes: [],
    evidence: {},
    ...over,
  }) as Row

const sweepOf = (rows: Row[], host: HostRow[]): Pick<HostSweep, 'repo' | 'rows'> =>
  ({ repo: { repos: [{ rows }] }, rows: host }) as unknown as Pick<HostSweep, 'repo' | 'rows'>

const idle = (id: string, over: Partial<HostRow> = {}): HostRow =>
  hostRow({
    id,
    name: id.slice('artifact:'.length),
    evidence: { sizeBytes: 5, unattended: true },
    ...over,
  })

describe('selectUnattended', () => {
  test('takes idle artifacts and delete worktrees with no risk, and nothing else', () => {
    const picked = selectUnattended(
      sweepOf(
        [
          wtRow('worktree:/a'),
          wtRow('worktree:/dirty', { verdict: 'review', risks: ['discard-changes'] }),
          wtRow('worktree:/risky', { risks: ['abandon-unmerged'] }),
          wtRow('worktree:/held', { verdict: 'blocked', blockers: ['live-process'] as never }),
          { ...wtRow('branch:merged'), kind: 'branch' } as Row,
        ],
        [
          idle('artifact:/t'),
          idle('artifact:/recent', { evidence: { unattended: false } }),
          idle('artifact:/busy', { verdict: 'blocked' }),
          idle('artifact:/risky', { risks: ['x'] }),
          hostRow({
            id: 'session:1',
            kind: 'session',
            name: '1',
            verdict: 'review',
            risks: ['close-session'],
          }),
        ],
      ),
    )
    expect(picked).toEqual(['worktree:/a', 'artifact:/t'])
  })
})

describe('--auto', () => {
  function setup(): { fx: Fixture; env: Record<string, string>; wtClean: string; wtDirty: string } {
    const fx = buildFixture()
    cleanups.push(fx.cleanup)
    const home = tempDir()
    const base = tempDir()
    const wtClean = join(base, 'clean')
    const wtDirty = join(base, 'dirty')
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'landed', wtClean, 'main'])
    sh(wtClean, ['commit', '--allow-empty', '-m', 'work'])
    sh(fx.root, ['merge', '-q', '--ff-only', 'landed'])
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'wip', wtDirty, 'main'])
    writeFileSync(join(wtDirty, 'scratch.txt'), 'x')
    return {
      fx,
      wtClean: realpathSync(wtClean),
      wtDirty: realpathSync(wtDirty),
      env: { ...(process.env as Record<string, string>), HOST_CLEANER_ROOT: home },
    }
  }

  function auto(argv: string[], fx: Fixture, env: Record<string, string>, deps: MainDeps) {
    const ctx = captureContext({ cwd: fx.root, env })
    const code = main(['--auto', ...argv], ctx, { confirm: () => null, ...deps })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }

  test('cleans the idle artifact and the landed worktree, and only those', () => {
    const { fx, env, wtClean, wtDirty } = setup()
    const dirs = hostDirs(env)
    const rows = (): HostRow[] =>
      [
        existsSync(fx.scratch)
          ? idle(`artifact:${fx.scratch}`, { evidence: { sizeBytes: 100, unattended: true } })
          : null,
        hostRow({
          id: 'session:7',
          kind: 'session',
          name: '7',
          verdict: 'review',
          risks: ['close-session'],
          evidence: { unattended: false },
        }),
      ].filter((r): r is HostRow => r !== null)
    mkdirSync(fx.scratch, { recursive: true })
    const adapter = fakeAdapter(rows, {
      execute: (step) => {
        rmSync(step.row.name, { recursive: true, force: true })
        return `removed ${step.row.name}`
      },
    })
    const r = auto([], fx, env, { adapters: [adapter] })
    expect(r.code).toBe(0)
    expect(existsSync(wtClean)).toBe(false)
    expect(existsSync(wtDirty)).toBe(true)
    expect(existsSync(fx.scratch)).toBe(false)
    expect(sh(fx.root, ['branch', '--list', 'merged-a'])).toContain('merged-a')
    expect(r.out).toContain('session:7')
    expect(r.out).toContain(`worktree:${wtDirty}`)
    expect(r.out).toMatch(/freed: .*B/)
    const [report] = readdirSync(join(dirs.state, 'reports'))
    const doc = JSON.parse(readFileSync(join(dirs.state, 'reports', report!), 'utf8'))
    expect(doc.cleaned.map((c: { id: string }) => c.id).sort()).toEqual(
      [`artifact:${fx.scratch}`, `worktree:${wtClean}`].sort(),
    )
    expect(doc.bytesFreed).toBeGreaterThanOrEqual(100)
    expect(doc.left.map((l: { id: string }) => l.id)).toContain('session:7')
    expect(existsSync(join(dirs.state, 'host-cleaner.lock'))).toBe(false)
    expect(readdirSync(join(dirs.state, 'receipts'))).toHaveLength(1)
  })

  test('nothing in the subset runs nothing, even though delete rows exist', () => {
    const { fx, env, wtDirty } = setup()
    const adapter = fakeAdapter(() => [hostRow({ risks: ['x'] })])
    const r = auto(['--only', 'branch'], fx, env, { adapters: [adapter] })
    expect(r.code).toBe(0)
    expect(adapter.executed).toEqual([])
    expect(existsSync(wtDirty)).toBe(true)
    expect(sh(fx.root, ['branch', '--list', 'merged-a'])).toContain('merged-a')
    expect(r.out).toContain('nothing-to-clean')
  })

  test('a second run started while one holds the lock exits without work', () => {
    const { fx, env, wtClean } = setup()
    const dirs = hostDirs(env)
    mkdirSync(dirs.state, { recursive: true })
    claimLock(join(dirs.state, 'host-cleaner.lock'), { pid: process.pid }, { isStale: () => false })
    const r = auto([], fx, env, {})
    expect(r.code).toBe(0)
    expect(r.err).toContain('another run holds')
    expect(existsSync(wtClean)).toBe(true)
    expect(existsSync(join(dirs.state, 'reports'))).toBe(false)
  })

  test('refuses --all', () => {
    const { fx, env } = setup()
    expect(auto(['--all'], fx, env, {}).code).toBe(2)
  })
})

describe('schedule', () => {
  const spec = {
    label: SCHEDULE_LABEL,
    program: ['/usr/bin/node', '/opt/host-cleaner/bin/host-cleaner.js', '--auto'],
    everyHours: 6,
    logFile: '/home/u/logs/host-cleaner-schedule.log',
    path: '/usr/bin:/bin',
  }

  test('renders a plist that runs host-cleaner --auto', () => {
    expect(renderPlist(spec)).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
      <plist version="1.0">
      <dict>
        <key>Label</key>
        <string>dev.osdlc.host-cleaner</string>
        <key>ProgramArguments</key>
        <array>
          <string>/usr/bin/node</string>
          <string>/opt/host-cleaner/bin/host-cleaner.js</string>
          <string>--auto</string>
        </array>
        <key>StartInterval</key>
        <integer>21600</integer>
        <key>RunAtLoad</key>
        <false/>
        <key>EnvironmentVariables</key>
        <dict>
          <key>PATH</key>
          <string>/usr/bin:/bin</string>
        </dict>
        <key>StandardOutPath</key>
        <string>/home/u/logs/host-cleaner-schedule.log</string>
        <key>StandardErrorPath</key>
        <string>/home/u/logs/host-cleaner-schedule.log</string>
      </dict>
      </plist>
      "
    `)
  })

  test('escapes XML in arguments', () => {
    expect(renderPlist({ ...spec, program: ['a&b<c'] })).toContain('<string>a&amp;b&lt;c</string>')
  })

  function drive(
    argv: string[],
    answers: Record<string, { exitCode: number; stderr?: string }>,
    platform = 'darwin',
  ) {
    const home = tempDir()
    const { runner, calls } = fakeRunner((argv) => answers[argv.join(' ')] ?? { exitCode: 0 })
    const ctx = captureContext({
      cwd: home,
      env: { HOME: home, HOST_CLEANER_ROOT: home, PATH: '/usr/bin' },
    })
    const code = main(['schedule', ...argv], ctx, {
      platform,
      uid: 501,
      launchctl: runner,
      program: ['node', '/x/host-cleaner.js', '--auto'],
    })
    return {
      code,
      home,
      out: ctx.io.out,
      err: ctx.io.err,
      calls: calls.map((c) => c.argv?.join(' ') ?? ''),
    }
  }

  const target = `gui/501/${SCHEDULE_LABEL}`

  test('install writes the plist and bootstraps it', () => {
    const r = drive(['install', '--every', '3'], {
      [`print ${target}`]: { exitCode: 113 },
    })
    expect(r.code).toBe(0)
    expect(readFileSync(plistPath(r.home), 'utf8')).toContain('<integer>10800</integer>')
    expect(r.calls.at(-1)).toBe(`bootstrap gui/501 ${plistPath(r.home)}`)
  })

  test('uninstall keeps the plist and fails when launchd will not unload it', () => {
    const home = tempDir()
    const { runner } = fakeRunner((argv) => ({ exitCode: argv[0] === 'bootout' ? 5 : 0 }))
    mkdirSync(join(home, 'Library', 'LaunchAgents'), { recursive: true })
    writeFileSync(plistPath(home), 'x')
    const ctx = captureContext({ cwd: home, env: { HOME: home, HOST_CLEANER_ROOT: home } })
    const code = main(['schedule', 'uninstall'], ctx, {
      platform: 'darwin',
      uid: 501,
      launchctl: runner,
    })
    expect(code).toBe(1)
    expect(existsSync(plistPath(home))).toBe(true)
  })

  test('refuses off macOS and a bad --every', () => {
    expect(drive(['install'], {}, 'linux').code).toBe(2)
    expect(drive(['install', '--every', '0'], {}).code).toBe(2)
    expect(drive(['frobnicate'], {}).code).toBe(2)
  })
})
