import {
  existsSync,
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
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import type { CommandRunner } from '@osdlc/command-seam'
import type { ProcessHolder, ProcessProbe } from '@osdlc/repo-cleaner'

import { cargoAdapter } from '../src/cargo.ts'
import { hostCheck, hostRun } from '../src/clean.ts'
import { nodeAdapter } from '../src/node.ts'
import { hostPlan } from '../src/plan.ts'
import { hostSweep } from '../src/sweep.ts'
import { buildFixture, sh, type Fixture } from './fixture.ts'

const NOW = new Date('2026-11-19T12:00:00Z')
const HOUR = 3_600_000
const ago = (hours: number): Date => new Date(NOW.getTime() - hours * HOUR)

const cleanups: Array<() => void> = []
let savedEnv: string | undefined
beforeEach(() => {
  savedEnv = process.env.CARGO_BUILD_INCREMENTAL
  delete process.env.CARGO_BUILD_INCREMENTAL
})
afterEach(() => {
  if (savedEnv === undefined) delete process.env.CARGO_BUILD_INCREMENTAL
  else process.env.CARGO_BUILD_INCREMENTAL = savedEnv
  while (cleanups.length > 0) cleanups.pop()!()
})

function fixture(): Fixture {
  const fx = buildFixture()
  cleanups.push(fx.cleanup)
  return fx
}

/** A linked worktree of `fx`, beside it in its own temp directory. */
function linked(fx: Fixture): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-wt-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'wt')
  sh(fx.root, ['worktree', 'add', '-q', path, '-b', 'linked'])
  return path
}

function put(path: string, hoursOld: number, body = 'x'.repeat(100)): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, body)
  utimesSync(path, ago(hoursOld), ago(hoursOld))
}

/** A cargo `target/` with a fingerprint `hoursOld`; `tag` false leaves out CACHEDIR.TAG. */
function target(checkout: string, hoursOld: number, tag = true): string {
  const dir = join(checkout, 'target')
  if (tag) put(join(dir, 'CACHEDIR.TAG'), hoursOld, 'Signature: 8a477f597d28d172789f06886806bc55')
  put(join(dir, 'debug', '.fingerprint', 'a', 'lib-a'), hoursOld)
  put(join(dir, 'debug', 'deps', 'liba.rlib'), hoursOld, 'y'.repeat(900))
  return dir
}

function fakeCargo(
  opts: { present?: boolean; incremental?: boolean } = {},
): (b: string) => CommandRunner {
  return () =>
    ({
      run: (argv: string[]) => {
        const ok = opts.present ?? true
        const out =
          argv[0] === 'config' ? `build.incremental = ${opts.incremental ?? true}\n` : 'cargo 1.0\n'
        return { exitCode: ok ? 0 : 127, stdout: ok ? out : '', stderr: '' }
      },
    }) as unknown as CommandRunner
}

const probeOf = (holders: ProcessHolder[] | Error = []): ProcessProbe => ({
  alive: () => true,
  holders: () => {
    if (holders instanceof Error) throw holders
    return holders
  },
})

function sweep(fx: Fixture, over: Record<string, unknown> = {}) {
  return hostSweep([fx.root], {
    cwd: fx.root,
    now: () => NOW,
    adapters: [cargoAdapter, nodeAdapter],
    command: fakeCargo(),
    probe: probeOf(),
    ...over,
  })
}

describe('cargo adapter', () => {
  test('a target/ idle for 48 hours is a delete row with its size; one idle for 1 hour is not', () => {
    const fx = fixture()
    writeFileSync(join(fx.root, 'Cargo.toml'), '[package]\n')
    target(fx.root, 48)
    const rows = sweep(fx).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: `artifact:${join(fx.root, 'target')}`,
      verdict: 'delete',
      action: 'remove',
      evidence: { kind: 'cargo-target', idleHours: 48, checkout: fx.root, unattended: true },
    })
    expect(rows[0]!.evidence.sizeBytes).toBeGreaterThanOrEqual(1000)

    rmSync(join(fx.root, 'target'), { recursive: true })
    target(fx.root, 1)
    expect(sweep(fx).rows).toEqual([])
  })

  test('a target/ without CACHEDIR.TAG is never a row', () => {
    const fx = fixture()
    target(fx.root, 100, false)
    expect(sweep(fx).rows).toEqual([])
  })

  test('the threshold is the config idleHours', () => {
    const fx = fixture()
    target(fx.root, 10)
    expect(sweep(fx).rows).toEqual([])
    const rows = sweep(fx, { config: { adapters: { cargo: { idleHours: 6 } } } }).rows
    expect(rows.map((r) => r.verdict)).toEqual(['delete'])
  })

  test('a cargo process in the checkout blocks the row, and clean drops it', () => {
    const fx = fixture()
    const dir = target(fx.root, 48)
    const holders = [{ pid: 7, command: 'cargo' }]
    const swept = sweep(fx, { probe: probeOf(holders) })
    expect(swept.rows[0]).toMatchObject({ verdict: 'blocked' })
    expect(swept.rows[0]!.blockers[0]).toMatch(/cargo \(pid 7\)/)
    const preview = hostCheck(
      hostPlan(swept, NOW),
      { pick: [swept.rows[0]!.id] },
      {
        cwd: fx.root,
        now: () => NOW,
        adapters: [cargoAdapter],
        command: fakeCargo(),
        probe: probeOf(holders),
      },
    )
    expect(preview.steps).toEqual([])
    expect(preview.dropped).toEqual([expect.objectContaining({ reason: 'blocked' })])
    expect(existsSync(dir)).toBe(true)
  })

  test('another process in the checkout does not block it, and an unreadable table does', () => {
    const fx = fixture()
    target(fx.root, 48)
    expect(sweep(fx, { probe: probeOf([{ pid: 9, command: 'vim' }]) }).rows[0]!.verdict).toBe(
      'delete',
    )
    const rows = sweep(fx, { probe: probeOf(new Error('no ps')) }).rows
    expect(rows[0]).toMatchObject({ verdict: 'blocked' })
  })

  test('with incremental off, target/*/incremental is a row though target/ is not idle', () => {
    const fx = fixture()
    target(fx.root, 1)
    put(join(fx.root, 'target', 'debug', 'incremental', 'c-1', 'work'), 1)
    const off = sweep(fx, { command: fakeCargo({ incremental: false }) }).rows
    expect(off.map((r) => r.evidence.kind)).toEqual(['cargo-incremental'])
    expect(off[0]!.id).toBe(`artifact:${join(fx.root, 'target', 'debug', 'incremental')}`)
    expect(off[0]!.evidence.unattended).toBe(false)
    expect(sweep(fx, { command: fakeCargo({ incremental: true }) }).rows).toEqual([])
  })

  test('CARGO_BUILD_INCREMENTAL decides before cargo is asked', () => {
    const fx = fixture()
    target(fx.root, 1)
    put(join(fx.root, 'target', 'debug', 'incremental', 'work'), 1)
    process.env.CARGO_BUILD_INCREMENTAL = 'false'
    expect(sweep(fx).rows).toHaveLength(1)
    process.env.CARGO_BUILD_INCREMENTAL = 'true'
    expect(sweep(fx, { command: fakeCargo({ incremental: false }) }).rows).toEqual([])
  })

  test('an idle target/ is one row; its incremental directories go with it', () => {
    const fx = fixture()
    target(fx.root, 48)
    put(join(fx.root, 'target', 'debug', 'incremental', 'work'), 48)
    expect(sweep(fx, { command: fakeCargo({ incremental: false }) }).rows).toHaveLength(1)
  })

  test('a target/ that leads outside its checkout is refused before anything is measured', () => {
    const fx = fixture()
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-out-')))
    cleanups.push(() => rmSync(outside, { recursive: true, force: true }))
    put(join(outside, 'CACHEDIR.TAG'), 100)
    put(join(outside, 'debug', '.fingerprint', 'a', 'f'), 100)
    symlinkSync(outside, join(fx.root, 'target'))
    const swept = sweep(fx)
    expect(swept.rows).toHaveLength(1)
    expect(swept.rows[0]).toMatchObject({
      verdict: 'blocked',
      action: null,
      evidence: { sizeBytes: null, idleHours: null },
    })
    const preview = hostCheck(
      hostPlan(swept, NOW),
      { pick: [swept.rows[0]!.id] },
      {
        cwd: fx.root,
        now: () => NOW,
        adapters: [cargoAdapter],
        command: fakeCargo(),
        probe: probeOf(),
      },
    )
    expect(preview.steps).toEqual([])
    expect(existsSync(join(outside, 'CACHEDIR.TAG'))).toBe(true)
  })

  test('clean removes the directory, checks it is gone and records the bytes freed', () => {
    const fx = fixture()
    const dir = target(fx.root, 48)
    const opts = {
      cwd: fx.root,
      now: () => NOW,
      adapters: [cargoAdapter],
      command: fakeCargo(),
      probe: probeOf(),
    }
    const swept = hostSweep([fx.root], opts)
    const bytes = swept.rows[0]!.evidence.sizeBytes as number
    const preview = hostCheck(hostPlan(swept, NOW), { pick: [swept.rows[0]!.id] }, opts)
    expect(preview.steps).toHaveLength(1)
    const receipt = hostRun(preview, opts)
    expect(receipt.status).toBe('complete')
    expect(receipt.host.steps[0]).toMatchObject({ result: 'ok' })
    expect(receipt.host.steps[0]!.verification).toBe(`removed ${dir}; freed ${bytes} bytes`)
    expect(existsSync(dir)).toBe(false)
  })

  test('execute refuses a directory that has become busy since the check', () => {
    const fx = fixture()
    const dir = target(fx.root, 48)
    const opts = { cwd: fx.root, now: () => NOW, adapters: [cargoAdapter], command: fakeCargo() }
    const swept = hostSweep([fx.root], { ...opts, probe: probeOf() })
    const preview = hostCheck(hostPlan(swept, NOW), {}, { ...opts, probe: probeOf() })
    const receipt = hostRun(preview, { ...opts, probe: probeOf([{ pid: 3, command: 'rustc' }]) })
    expect(receipt.host.dropped).toEqual([expect.objectContaining({ reason: 'blocked' })])
    expect(existsSync(dir)).toBe(true)
  })

  test('a row inside a worktree the run removes is dropped as gone', () => {
    const fx = fixture()
    const wt = linked(fx)
    target(wt, 48)
    const opts = {
      cwd: fx.root,
      now: () => NOW,
      adapters: [cargoAdapter],
      command: fakeCargo(),
      probe: probeOf(),
    }
    const swept = hostSweep([fx.root], opts)
    expect(swept.rows).toHaveLength(1)
    const plan = hostPlan(swept, NOW)
    sh(fx.root, ['worktree', 'remove', '--force', wt])
    const preview = hostCheck(plan, { pick: [swept.rows[0]!.id] }, opts)
    expect(preview.dropped).toEqual([expect.objectContaining({ reason: 'gone' })])
  })
})

describe('node adapter', () => {
  test('the primary checkout is never a row; an idle linked worktree is', () => {
    const fx = fixture()
    writeFileSync(join(fx.root, 'package.json'), '{}')
    put(join(fx.root, 'node_modules', 'a', 'index.js'), 500)
    const wt = linked(fx)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'src', 'a.ts'), 72)
    put(join(wt, 'node_modules', 'a', 'index.js'), 1, 'z'.repeat(2000))
    const rows = sweep(fx).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: `artifact:${join(wt, 'node_modules')}`,
      verdict: 'delete',
      evidence: { kind: 'node-modules', checkout: wt, idleHours: 72, unattended: true },
    })
    expect(rows[0]!.evidence.sizeBytes).toBeGreaterThanOrEqual(2000)
  })

  test('a recently changed worktree has no row', () => {
    const fx = fixture()
    const wt = linked(fx)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'src', 'a.ts'), 2)
    put(join(wt, 'node_modules', 'a', 'index.js'), 72)
    expect(sweep(fx).rows).toEqual([])
  })

  test('a process in the worktree blocks the row; an idle shell does not', () => {
    const fx = fixture()
    const wt = linked(fx)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'node_modules', 'a', 'index.js'), 72)
    const shell = { pid: 4, command: 'zsh', hasChildren: false }
    expect(sweep(fx, { probe: probeOf([shell]) }).rows[0]!.verdict).toBe('delete')
    const busy = sweep(fx, { probe: probeOf([{ pid: 5, command: 'node' }]) }).rows[0]!
    expect(busy.verdict).toBe('blocked')
    expect(busy.blockers[0]).toMatch(/node \(pid 5\)/)
  })

  test('a pnpm tree says it frees less than it measures', () => {
    const fx = fixture()
    const wt = linked(fx)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'node_modules', '.pnpm', 'x', 'f'), 72)
    expect(sweep(fx).rows[0]!.notes[0]).toMatch(/hard links into the pnpm store/)
  })

  test('clean removes node_modules and records the bytes freed', () => {
    const fx = fixture()
    const wt = linked(fx)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'node_modules', 'a', 'index.js'), 72)
    const opts = { cwd: fx.root, now: () => NOW, adapters: [nodeAdapter], probe: probeOf() }
    const swept = hostSweep([fx.root], opts)
    const receipt = hostRun(hostCheck(hostPlan(swept, NOW), {}, opts), opts)
    expect(receipt.status).toBe('complete')
    expect(receipt.host.steps[0]!.verification).toMatch(/^removed .*node_modules; freed 100 bytes$/)
    expect(existsSync(join(wt, 'node_modules'))).toBe(false)
    expect(existsSync(join(wt, 'package.json'))).toBe(true)
  })
})

describe('detection', () => {
  test('with neither cargo nor a node or Rust checkout, both adapters report skipped', () => {
    const fx = fixture()
    const swept = sweep(fx, { command: fakeCargo({ present: false }) })
    expect(swept.adapters).toEqual([
      { name: 'cargo', status: 'skipped', reason: 'not-detected' },
      { name: 'node', status: 'skipped', reason: 'not-detected' },
    ])
    expect(swept.rows).toEqual([])
  })

  test('a Cargo.toml detects cargo without cargo on PATH', () => {
    const fx = fixture()
    writeFileSync(join(fx.root, 'Cargo.toml'), '[package]\n')
    expect(sweep(fx, { command: fakeCargo({ present: false }) }).adapters[0]).toEqual({
      name: 'cargo',
      status: 'active',
    })
  })
})
