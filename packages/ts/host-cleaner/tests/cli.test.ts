/** The `host-cleaner` CLI driven in process: exit codes, refusals, and plan to receipt through a fake adapter. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  existsSync,
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

import type { HostAdapter, HostRow } from '../src/adapter.ts'
import { main, type MainDeps } from '../src/cli.ts'
import { hostDirs } from '../src/config.ts'
import type { HostPlan } from '../src/plan.ts'
import { buildFixture, fakeAdapter, hostRow, type Fixture } from './fixture.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-cli-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function setup(): { fx: Fixture; home: string; env: Record<string, string> } {
  const fx = buildFixture()
  cleanups.push(fx.cleanup)
  const home = tempDir()
  return { fx, home, env: { ...(process.env as Record<string, string>), HOST_CLEANER_ROOT: home } }
}

function run(argv: string[], cwd: string, env: Record<string, string>, deps: MainDeps = {}) {
  const ctx = captureContext({ cwd, env })
  const code = main(argv, ctx, { confirm: () => null, ...deps })
  return { code, out: ctx.io.out, err: ctx.io.err }
}

const deletable = (): HostRow[] => [hostRow()]

describe('report', () => {
  test('with no adapter it reports repo-cleaner rows and no host rows', () => {
    const { fx, env } = setup()
    const r = run(['--format', 'json'], fx.root, env)
    expect(r.code).toBe(0)
    const doc = JSON.parse(r.out)
    expect(doc.hostRows).toEqual([])
    expect(doc.adapters).toEqual([])
    expect(JSON.stringify(doc.repos)).toContain('merged-a')
  })

  test('an adapter that does not detect is listed as skipped and adds nothing', () => {
    const { fx, env } = setup()
    const adapter = fakeAdapter(deletable, { detect: () => false })
    const r = run([], fx.root, env, { adapters: [adapter] })
    expect(r.code).toBe(0)
    expect(r.out).toContain('adapter fake: skipped (not-detected)')
    expect(r.out).not.toContain('artifact:cache')
  })

  test('an active adapter adds its rows to the text report', () => {
    const { fx, env } = setup()
    const r = run([], fx.root, env, { adapters: [fakeAdapter(deletable)] })
    expect(r.out).toContain('artifact:cache')
    expect(r.out).toContain('adapter fake: active')
  })

  test('targets come from the config file when none is named', () => {
    const { fx, home, env } = setup()
    const config = join(home, 'c.json')
    writeFileSync(config, JSON.stringify({ targets: [fx.root] }))
    const r = run(['--config', config, '--format', 'json'], tempDir(), env)
    expect(r.code).toBe(0)
    expect(JSON.stringify(JSON.parse(r.out).repos)).toContain('merged-a')
  })

  test('an adapter reads its settings from the config file', () => {
    const { fx, home, env } = setup()
    const config = join(home, 'c.json')
    writeFileSync(config, JSON.stringify({ adapters: { fake: { idleHours: 48 } } }))
    let seen: unknown
    const adapter: HostAdapter = {
      name: 'fake',
      detect: (ctx) => {
        seen = ctx.config.adapters.fake
        return false
      },
    }
    run(['--config', config], fx.root, env, { adapters: [adapter] })
    expect(seen).toEqual({ idleHours: 48 })
  })

  test('a bad config file and an unknown adapter are refused with exit 2', () => {
    const { fx, home, env } = setup()
    const config = join(home, 'c.json')
    writeFileSync(config, '{"targets": 3}')
    expect(run(['--config', config], fx.root, env).code).toBe(2)
    expect(run(['--adapter', 'nope'], fx.root, env).code).toBe(2)
    expect(run(['--only', 'remote'], fx.root, env).code).toBe(2)
  })
})

describe('plan and clean', () => {
  test('plan writes one file, and clean --plan runs the host row into a receipt', () => {
    const { fx, home, env } = setup()
    const adapter = fakeAdapter(deletable)
    const planFile = join(home, 'plan.json')
    expect(run(['plan', '-o', planFile], fx.root, env, { adapters: [adapter] }).code).toBe(0)
    const plan = JSON.parse(readFileSync(planFile, 'utf8')) as HostPlan
    expect(plan.rows.map((r) => r.id)).toEqual(['artifact:cache'])

    const receiptFile = join(home, 'receipt.json')
    const r = run(['clean', '--plan', planFile, '--yes', '--receipt', receiptFile], fx.root, env, {
      adapters: [adapter],
    })
    expect(r.code).toBe(0)
    expect(adapter.executed).toEqual(['artifact:cache'])
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
    expect(receipt.status).toBe('complete')
    expect(receipt.host.steps[0].verification).toBe('removed cache')
    expect(r.out).toContain('removed cache')
  })

  test('a clean without --receipt writes one in the state directory and a line in the log', () => {
    const { fx, env } = setup()
    const adapter = fakeAdapter(deletable)
    const r = run(['clean', '--yes', '--only', 'worktree'], fx.root, env, { adapters: [adapter] })
    expect(r.code).toBe(0)
    const dirs = hostDirs(env)
    expect(readdirSync(join(dirs.state, 'receipts'))).toHaveLength(1)
    const line = JSON.parse(readFileSync(join(dirs.logs, 'host-cleaner.log'), 'utf8').trim())
    expect(line.status).toBe('complete')
  })

  test('--dry-run shows the steps and executes nothing', () => {
    const { fx, env } = setup()
    const adapter = fakeAdapter(deletable)
    const r = run(['clean', '--dry-run', '--only', 'worktree'], fx.root, env, {
      adapters: [adapter],
    })
    expect(r.code).toBe(0)
    expect(r.out).toContain('artifact:cache')
    expect(adapter.executed).toEqual([])
    expect(existsSync(join(hostDirs(env).state, 'receipts'))).toBe(false)
  })

  test('without --yes it asks, and a no deletes nothing', () => {
    const { fx, env } = setup()
    const adapter = fakeAdapter(deletable)
    const r = run(['clean', '--only', 'worktree'], fx.root, env, {
      adapters: [adapter],
      confirm: () => false,
    })
    expect(r.code).toBe(0)
    expect(r.err).toContain('nothing deleted')
    expect(adapter.executed).toEqual([])
  })

  test('with no one to ask and no --yes it refuses with exit 2', () => {
    const { fx, env } = setup()
    const r = run(['clean', '--only', 'worktree'], fx.root, env, {
      adapters: [fakeAdapter(deletable)],
    })
    expect(r.code).toBe(2)
    expect(r.err).toContain('pass --yes')
  })

  test('a host row with a risk runs only when the risk is allowed', () => {
    const { fx, env } = setup()
    const risky = (): HostRow[] => [hostRow({ risks: ['loses-history'] })]
    const adapter = fakeAdapter(risky)
    run(['clean', '--yes', '--only', 'worktree'], fx.root, env, { adapters: [adapter] })
    expect(adapter.executed).toEqual([])
    run(['clean', '--yes', '--only', 'worktree', '--allow', 'loses-history'], fx.root, env, {
      adapters: [adapter],
    })
    expect(adapter.executed).toEqual(['artifact:cache'])
  })

  test('a failing step exits 11 and the receipt says failed', () => {
    const { fx, home, env } = setup()
    const adapter = fakeAdapter(deletable, {
      execute: () => {
        throw new Error('disk gone')
      },
    })
    const receiptFile = join(home, 'r.json')
    const r = run(
      ['clean', '--yes', '--only', 'worktree', '--receipt', receiptFile],
      fx.root,
      env,
      {
        adapters: [adapter],
      },
    )
    expect(r.code).toBe(11)
    expect(JSON.parse(readFileSync(receiptFile, 'utf8')).status).toBe('failed')
  })

  test('options that contradict each other are refused with exit 2', () => {
    const { fx, env } = setup()
    expect(run(['clean', '--yes', '--dry-run'], fx.root, env).code).toBe(2)
    expect(run(['clean', '--plan', '-'], fx.root, env).code).toBe(2)
    expect(run(['clean', '--plan', 'p.json', '--adapter', 'x'], fx.root, env).code).toBe(2)
    expect(run(['clean', '--dry-run', '--receipt', 'r.json'], fx.root, env).code).toBe(2)
  })

  test('--plan - reads the plan from stdin', () => {
    const { fx, home, env } = setup()
    const adapter = fakeAdapter(deletable)
    const planFile = join(home, 'plan.json')
    run(['plan', '-o', planFile], fx.root, env, { adapters: [adapter] })
    const r = run(
      ['clean', '--plan', '-', '--yes', '--receipt', join(home, 'r.json')],
      fx.root,
      env,
      {
        adapters: [adapter],
        readStdin: () => readFileSync(planFile, 'utf8'),
      },
    )
    expect(r.code).toBe(0)
    expect(adapter.executed).toEqual(['artifact:cache'])
  })

  test('--help exits 0 and names the commands', () => {
    const { fx, env } = setup()
    const r = run(['--help'], fx.root, env)
    expect(r.code).toBe(0)
    expect(r.out).toContain('Usage: host-cleaner')
    expect(r.out).toContain('--skip-adapter')
  })
})
