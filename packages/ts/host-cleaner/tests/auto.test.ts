/** `clean --auto` and `schedule`: which candidates the unattended run takes, the report and lock, and the launchd agent. */

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
import { fakeRunner } from '@osdlc/command-seam/testing'
import { claimLock, releaseLock } from '@osdlc/file-lock'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

import { selectUnattended } from '../src/auto.ts'
import { main, type MainDeps } from '../src/cli.ts'
import { configFile, hostDirs } from '../src/config.ts'
import type { Candidate, Objection, Plugin } from '../src/index.ts'
import { renderPlist } from '../src/schedule.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})
const temp = (): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-auto-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function setup() {
  const home = temp()
  return {
    home,
    cwd: temp(),
    env: { ...(process.env as Record<string, string>), HOST_CLEANER_ROOT: home, HOME: home },
  }
}

function run(argv: string[], cwd: string, env: Record<string, string>, deps: MainDeps = {}) {
  const ctx = captureContext({ cwd, env })
  const code = main(argv, ctx, { confirm: () => null, ...deps })
  return { code, out: ctx.io.out, err: ctx.io.err }
}

const cand = (id: string, extra: Partial<Candidate> = {}): Candidate => ({
  id,
  kind: 'artifact',
  path: id,
  owner: 'fake',
  why: 'idle',
  evidence: { v: 1 },
  ...extra,
})

const objection = (candidate: string, level: Objection['level']): Objection => ({
  by: 'fake',
  candidate,
  level,
  code: 'x',
  reason: 'x',
})

/** A plugin that owns `items` and records what it deletes. */
function fake(items: Candidate[], os: Objection[] = []): Plugin & { removed: string[] } {
  const removed: string[] = []
  return {
    name: 'fake',
    detect: () => true,
    discover: () => items,
    object: () => os,
    delete: (c) => (removed.push(c.id), `removed ${c.id}`),
    removed,
  }
}

describe('selectUnattended', () => {
  test('takes only unattended: true candidates that nothing refuses or protests; a note does not hold one', () => {
    const cs = [
      cand('a', { unattended: true }),
      cand('b', { unattended: true }),
      cand('c', { unattended: true }),
      cand('d', { unattended: true }),
      cand('e'),
      cand('f', { unattended: false }),
    ]
    const os = [objection('b', 'refuse'), objection('c', 'protest'), objection('d', 'note')]
    expect(selectUnattended(cs, os)).toEqual(['a', 'd'])
  })
})

describe('host-cleaner clean --auto', () => {
  test('cleans the unattended subset only, and leaves a report, a receipt and a log line', () => {
    const { env, cwd } = setup()
    const plugin = fake(
      [
        cand('artifact:idle', { unattended: true, bytes: 2048 }),
        cand('artifact:held', { unattended: true }),
        cand('artifact:manual'),
      ],
      [objection('artifact:held', 'protest')],
    )
    const r = run(['clean', '--auto'], cwd, env, { plugins: [plugin] })
    expect(r.code).toBe(0)
    expect(plugin.removed).toEqual(['artifact:idle'])
    expect(r.out).toContain('host-cleaner clean --auto: complete')
    expect(r.out).toContain('freed: 2.0 KB')
    expect(r.out).toContain('left for review (2)')
    const dirs = hostDirs(env)
    expect(readdirSync(join(dirs.state, 'receipts'))).toHaveLength(1)
    const report = JSON.parse(
      readFileSync(
        join(dirs.state, 'reports', readdirSync(join(dirs.state, 'reports'))[0]!),
        'utf8',
      ),
    )
    expect(report).toMatchObject({ status: 'complete', bytesFreed: 2048 })
    expect(readFileSync(join(dirs.logs, 'host-cleaner.log'), 'utf8')).toContain('(auto)')
    expect(existsSync(join(dirs.state, 'host-cleaner.lock'))).toBe(false)
  })

  test('with nothing unattended it runs nothing, though a plain clean would run the rest', () => {
    const { env, cwd } = setup()
    const plugin = fake([cand('artifact:manual')])
    const r = run(['clean', '--auto', '--format', 'json'], cwd, env, { plugins: [plugin] })
    expect(r.code).toBe(0)
    expect(plugin.removed).toEqual([])
    expect(JSON.parse(r.out).report.status).toBe('nothing-to-clean')
  })

  test('with the real git plugin a merged branch is left for a person', () => {
    const { env } = setup()
    const dir = temp()
    makeGitFixture({ dir, initialBranch: 'main' })
    const git = new Git(dir, { env: { ...IDENTITY } })
    git.rawChecked(['commit', '--allow-empty', '-m', 'initial'])
    git.rawChecked(['branch', 'merged-a'])
    const r = run(['clean', '--auto'], dir, env)
    expect(r.code).toBe(0)
    expect(r.out).toContain('nothing-to-clean')
    expect(git.rawChecked(['branch', '--format=%(refname:short)']).stdout).toContain('merged-a')
  })

  test('a failed delete exits 11 and the report names it', () => {
    const { env, cwd } = setup()
    const broken: Plugin = {
      ...fake([cand('artifact:a', { unattended: true })]),
      delete: () => {
        throw new Error('disk on fire')
      },
    }
    const r = run(['clean', '--auto'], cwd, env, { plugins: [broken] })
    expect(r.code).toBe(11)
    expect(r.out).toContain('artifact:a: disk on fire')
  })

  test('a second run that finds the lock held exits without work', () => {
    const { env, cwd } = setup()
    const dirs = hostDirs(env)
    mkdirSync(dirs.state, { recursive: true })
    const lock = join(dirs.state, 'host-cleaner.lock')
    const claim = claimLock(
      lock,
      { pid: process.pid, startedAt: new Date().toISOString() },
      { isStale: () => false },
    )
    expect(claim.ok).toBe(true)
    const plugin = fake([cand('artifact:a', { unattended: true })])
    const r = run(['clean', '--auto'], cwd, env, { plugins: [plugin] })
    if (claim.ok) releaseLock(lock, claim.token)
    expect(r.code).toBe(0)
    expect(r.err).toContain('another run holds')
    expect(plugin.removed).toEqual([])
  })

  test('what --auto fixes for itself is refused with exit 2', () => {
    const { env, cwd } = setup()
    for (const extra of [['--pick', 'x'], ['--allow', 'lossy'], ['-i'], ['--yes'], ['--dry-run']]) {
      const r = run(['clean', '--auto', ...extra], cwd, env)
      expect(r.code).toBe(2)
      expect(r.err).toContain(`drop ${extra[0]}`)
    }
    expect(run(['--auto'], cwd, env).code).toBe(2)
  })

  test('--spare leaves a candidate out of the unattended subset', () => {
    const { env, cwd } = setup()
    const plugin = fake([cand('artifact:idle', { unattended: true })])
    const r = run(['clean', '--auto', '--spare', 'artifact:*'], cwd, env, { plugins: [plugin] })
    expect(r.code).toBe(0)
    expect(plugin.removed).toEqual([])
  })
})

describe('host-cleaner schedule', () => {
  function sched(argv: string[], over: MainDeps = {}, targets: string[] | null = ['~/dev']) {
    const { env, cwd, home } = setup()
    if (targets !== null) {
      const file = configFile(hostDirs(env))
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, JSON.stringify({ targets }))
    }
    const calls: string[][] = []
    const launchctl = fakeRunner((a) => {
      calls.push(a)
      return { exitCode: a[0] === 'print' ? 1 : 0 }
    }).runner
    const r = run(['schedule', ...argv], cwd, env, {
      platform: 'darwin',
      uid: 501,
      launchctl,
      program: ['/usr/bin/node', '/x/host-cleaner.js', 'clean', '--auto'],
      ...over,
    })
    return { ...r, calls, home }
  }

  test('install writes the plist and bootstraps it; status and uninstall follow', () => {
    const r = sched(['install', '--every', '3'])
    expect(r.code).toBe(0)
    const plist = join(r.home, 'Library', 'LaunchAgents', 'dev.osdlc.host-cleaner.plist')
    expect(readFileSync(plist, 'utf8')).toContain('<integer>10800</integer>')
    expect(r.calls.some((c) => c[0] === 'bootstrap' && c[1] === 'gui/501')).toBe(true)
    expect(r.out).toContain('every 3 hours')
  })

  test('install refuses when the config names no targets, since launchd starts the job in /', () => {
    const r = sched(['install'], {}, null)
    expect(r.code).toBe(2)
    expect(r.err).toContain('targets')
    expect(r.calls).toEqual([])
  })

  test('status says whether the plist is present and the agent loaded', () => {
    const r = sched(['status'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('(absent)')
    expect(r.out).toContain('launchd: not loaded')
  })

  test('uninstall with nothing there says so', () => {
    expect(sched(['uninstall']).out).toBe('not installed\n')
  })

  test('off macOS, a bad action or a bad --every is refused with exit 2', () => {
    expect(sched(['install'], { platform: 'linux' }).code).toBe(2)
    expect(sched(['frobnicate']).code).toBe(2)
    expect(sched(['install', '--every', '0']).code).toBe(2)
    expect(sched(['status', '--every', '2']).code).toBe(2)
  })

  test('the plist escapes its text and carries the HOST_CLEANER_ overrides', () => {
    const text = renderPlist({
      label: 'x',
      program: ['a&b', 'clean', '--auto'],
      everyHours: 1,
      logFile: '/l',
      vars: { HOST_CLEANER_ROOT: '/r' },
    })
    expect(text).toContain('a&amp;b')
    expect(text).toContain('<key>HOST_CLEANER_ROOT</key>')
  })
})
