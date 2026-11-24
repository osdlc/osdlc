/** The `cargo` and `node` plugins against real repositories, linked worktrees and temp directories. */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { asAsync, type CommandRunner } from '@osdlc/command-seam'
import type { ProcessHolder, ProcessProbe } from '@osdlc/repo-cleaner'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

import {
  cargoPlugin,
  clean,
  nodePlugin,
  parsePlan,
  plan,
  recheck,
  survey,
  type ArtifactOptions,
  type Ctx,
  type Plugin,
} from '../src/index.ts'
import { contractSuite, fakeRunner } from '../src/testing.ts'

const NOW = new Date('2026-11-19T12:00:00Z')
const HOUR = 3_600_000
const ago = (hours: number): Date => new Date(NOW.getTime() - hours * HOUR)

const cleanups: Array<() => void> = []
const INCREMENTAL_VARS = ['CARGO_INCREMENTAL', 'CARGO_BUILD_INCREMENTAL'] as const
let savedEnv: Array<string | undefined> = []
beforeEach(() => {
  savedEnv = INCREMENTAL_VARS.map((k) => process.env[k])
  for (const k of INCREMENTAL_VARS) delete process.env[k]
})
afterEach(() => {
  INCREMENTAL_VARS.forEach((k, i) => {
    if (savedEnv[i] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[i]
  })
  while (cleanups.length > 0) cleanups.pop()!()
})

const tmp = (prefix: string): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const sh = (cwd: string, args: string[]): void => {
  new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args)
}

/** A repository with one commit. */
function repo(): string {
  const dir = tmp('host-cleaner-art-')
  makeGitFixture({ dir, initialBranch: 'main' })
  sh(dir, ['commit', '--allow-empty', '-m', 'initial'])
  return dir
}

/** A linked worktree of `root`, beside it in its own temp directory. */
function linked(root: string): string {
  const path = join(tmp('host-cleaner-wt-'), 'wt')
  sh(root, ['worktree', 'add', '-q', path, '-b', 'linked'])
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

/** A `cargo` on PATH (or not) that answers `config get build.incremental`. */
function fakeCargo(opts: { present?: boolean; incremental?: boolean } = {}): ArtifactOptions {
  const ok = opts.present ?? true
  return {
    which: (program) => (ok ? `/bin/${program}` : undefined),
    runner: () =>
      asAsync({
        run: (argv: string[]) => {
          const out =
            argv[0] === 'config' ? `build.incremental = ${opts.incremental ?? true}\n` : ''
          return { exitCode: ok ? 0 : 127, stdout: ok ? out : '', stderr: '' }
        },
      } as unknown as CommandRunner),
  }
}

const probeOf = (holders: ProcessHolder[] | Error = []): ProcessProbe => ({
  alive: () => true,
  holders: () => {
    if (holders instanceof Error) throw holders
    return holders
  },
})

const options = (over: ArtifactOptions = {}): ArtifactOptions => ({
  now: () => NOW,
  ...fakeCargo(),
  probe: probeOf(),
  ...over,
})

const ctxOf = (root: string): Ctx => ({
  cwd: root,
  targets: [root],
  targetsGiven: true,
  allow: [],
  signal: new AbortController().signal,
})

/** What one plugin proposes over `root`, and what it refuses. */
async function sweep(
  make: (o: ArtifactOptions) => Plugin,
  root: string,
  over: ArtifactOptions = {},
) {
  const s = await survey([make(options(over))], ctxOf(root))
  return { ...s, refused: s.objections.filter((o) => o.level === 'refuse') }
}

const cargo = (root: string, over: ArtifactOptions = {}) => sweep(cargoPlugin, root, over)
const node = (root: string, over: ArtifactOptions = {}) => sweep(nodePlugin, root, over)

describe('cargo plugin', () => {
  test('a target/ idle for 48 hours is a candidate with its size; one idle for 1 hour is not', async () => {
    const root = repo()
    writeFileSync(join(root, 'Cargo.toml'), '[package]\n')
    target(root, 48)
    const found = (await cargo(root)).candidates
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      id: `artifact:${join(root, 'target')}`,
      kind: 'artifact',
      owner: 'cargo',
      evidence: { kind: 'cargo-target', checkout: root },
    })
    expect(found[0]!.held).toBeUndefined()
    expect(found[0]!.bytes).toBeGreaterThanOrEqual(1000)

    rmSync(join(root, 'target'), { recursive: true })
    target(root, 1)
    expect((await cargo(root)).candidates).toEqual([])
  })

  test('a recent --target build keeps the whole target/ from being idle', async () => {
    const root = repo()
    target(root, 100)
    put(join(root, 'target', 'x86_64-unknown-linux-gnu', 'debug', '.fingerprint', 'a', 'f'), 1)
    expect((await cargo(root)).candidates).toEqual([])
  })

  test('a target/ without CACHEDIR.TAG is never a candidate', async () => {
    const root = repo()
    target(root, 100, false)
    expect((await cargo(root)).candidates).toEqual([])
  })

  test('the threshold is idleHours', async () => {
    const root = repo()
    target(root, 10)
    expect((await cargo(root)).candidates).toEqual([])
    expect((await cargo(root, { idleHours: 6 })).candidates).toHaveLength(1)
  })

  test('idleHours takes fractions: 0.5 is half an hour', async () => {
    const root = repo()
    target(root, 0.25)
    expect((await cargo(root, { idleHours: 0.5 })).candidates).toEqual([])
    target(root, 0.75)
    expect((await cargo(root, { idleHours: 0.5 })).candidates).toEqual([
      expect.objectContaining({ why: 'no build for 0.7 hours (threshold 0.5)' }),
    ])
  })

  test('idleHours 0 makes an artifact built just now a candidate', async () => {
    const root = repo()
    target(root, 0)
    expect((await cargo(root)).candidates).toEqual([])
    expect((await cargo(root, { idleHours: 0 })).candidates).toHaveLength(1)
  })

  test('a cargo process in the checkout refuses the candidate, and clean drops it as blocked', async () => {
    const root = repo()
    const dir = target(root, 48)
    const holders = [{ pid: 7, command: 'cargo' } as ProcessHolder]
    const plugin = cargoPlugin(options({ probe: probeOf(holders) }))
    const s = await survey([plugin], ctxOf(root))
    expect(s.objections).toEqual([
      expect.objectContaining({ level: 'refuse', code: 'live-process', by: 'cargo' }),
    ])
    expect(s.objections[0]!.reason).toMatch(/cargo \(pid 7\)/)
    const receipt = await clean(plan(s, { select: [s.candidates[0]!.id] }), [plugin], ctxOf(root))
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped).toEqual([expect.objectContaining({ reason: 'blocked' })])
    expect(existsSync(dir)).toBe(true)
  })

  test('any process working in the checkout refuses it, and so does an unreadable process table', async () => {
    const root = repo()
    target(root, 48)
    expect(
      (
        await cargo(root, {
          probe: probeOf([{ pid: 9, command: './target/release/server' } as ProcessHolder]),
        })
      ).refused,
    ).toEqual([expect.objectContaining({ code: 'live-process' })])
    const unreadable = await cargo(root, { probe: probeOf(new Error('no ps')) })
    expect(unreadable.refused).toEqual([
      expect.objectContaining({ code: 'process-table-unreadable' }),
    ])
  })

  test('with incremental off, target/*/incremental is a candidate though target/ is not idle', async () => {
    const root = repo()
    target(root, 1)
    put(join(root, 'target', 'debug', 'incremental', 'c-1', 'work'), 1)
    const off = (await cargo(root, fakeCargo({ incremental: false }))).candidates
    expect(off.map((c) => c.evidence.kind)).toEqual(['cargo-incremental'])
    expect(off[0]!.id).toBe(`artifact:${join(root, 'target', 'debug', 'incremental')}`)
    expect(off[0]!.held).toBe(true)
    expect((await cargo(root, fakeCargo({ incremental: true }))).candidates).toEqual([])
  })

  test('CARGO_BUILD_INCREMENTAL decides before cargo is asked', async () => {
    const root = repo()
    target(root, 1)
    put(join(root, 'target', 'debug', 'incremental', 'work'), 1)
    process.env.CARGO_BUILD_INCREMENTAL = 'false'
    expect((await cargo(root)).candidates).toHaveLength(1)
    process.env.CARGO_BUILD_INCREMENTAL = 'true'
    expect((await cargo(root, fakeCargo({ incremental: false }))).candidates).toEqual([])
  })

  test('CARGO_INCREMENTAL decides before CARGO_BUILD_INCREMENTAL', async () => {
    const root = repo()
    target(root, 1)
    put(join(root, 'target', 'debug', 'incremental', 'work'), 1)
    process.env.CARGO_INCREMENTAL = '0'
    process.env.CARGO_BUILD_INCREMENTAL = 'true'
    expect((await cargo(root)).candidates).toHaveLength(1)
  })

  test('an idle target/ is one candidate; its incremental directories go with it', async () => {
    const root = repo()
    target(root, 48)
    put(join(root, 'target', 'debug', 'incremental', 'work'), 48)
    expect((await cargo(root, fakeCargo({ incremental: false }))).candidates).toHaveLength(1)
  })

  test('a target/ that leads outside its checkout is refused before anything is measured', async () => {
    const root = repo()
    const outside = tmp('host-cleaner-out-')
    put(join(outside, 'CACHEDIR.TAG'), 100)
    put(join(outside, 'debug', '.fingerprint', 'a', 'f'), 100)
    symlinkSync(outside, join(root, 'target'))
    const found = await cargo(root)
    expect(found.candidates).toHaveLength(1)
    expect(found.candidates[0]!.bytes).toBeUndefined()
    // The core refuses it too: its real path is outside the target.
    expect(found.refused.map((o) => o.code)).toEqual(['outside-roots', 'outside-checkout'])
    const plugin = cargoPlugin(options())
    const s = await survey([plugin], ctxOf(root))
    const receipt = await clean(plan(s, { select: [s.candidates[0]!.id] }), [plugin], ctxOf(root))
    expect(receipt.steps).toEqual([])
    expect(existsSync(join(outside, 'CACHEDIR.TAG'))).toBe(true)
  })

  test('clean removes the directory, checks it is gone and records the bytes freed', async () => {
    const root = repo()
    const dir = target(root, 48)
    const plugin = cargoPlugin(options())
    const s = await survey([plugin], ctxOf(root))
    const bytes = s.candidates[0]!.bytes!
    const receipt = await clean(plan(s), [plugin], ctxOf(root))
    expect(receipt.status).toBe('complete')
    expect(receipt.steps[0]).toMatchObject({
      result: 'ok',
      delete: `removed ${dir}; freed ${bytes} bytes`,
    })
    expect(existsSync(dir)).toBe(false)
  })

  test('delete refuses a directory that became busy after the survey', async () => {
    const root = repo()
    const dir = target(root, 48)
    const quiet = cargoPlugin(options())
    const p = plan(await survey([quiet], ctxOf(root)))
    const busy = cargoPlugin(
      options({ probe: probeOf([{ pid: 3, command: 'rustc' } as ProcessHolder]) }),
    )
    const receipt = await clean(p, [busy], ctxOf(root))
    expect(receipt.dropped).toEqual([expect.objectContaining({ reason: 'blocked' })])
    expect(existsSync(dir)).toBe(true)
  })

  test('a candidate inside a worktree the run removes first is already gone, not a failure', async () => {
    const root = repo()
    const wt = linked(root)
    const dir = target(wt, 48)
    const plugin = cargoPlugin(options())
    const s = await survey([plugin], ctxOf(root))
    expect(s.candidates).toHaveLength(1)
    rmSync(wt, { recursive: true })
    const gone = cargoPlugin(options())
    const direct = await gone.delete!(s.candidates[0]!, ctxOf(root))
    expect(direct).toBe(`already gone: ${dir}`)
  })

  test('a worktree removed since the plan is dropped as gone', async () => {
    const root = repo()
    const wt = linked(root)
    target(wt, 48)
    const plugin = cargoPlugin(options())
    const s = await survey([plugin], ctxOf(root))
    const p = plan(s, { select: [s.candidates[0]!.id] })
    sh(root, ['worktree', 'remove', '--force', wt])
    const receipt = await clean(p, [plugin], ctxOf(root), { dryRun: true })
    expect(receipt.dropped).toEqual([expect.objectContaining({ reason: 'gone' })])
  })
})

describe('node plugin', () => {
  test('the primary checkout is never a candidate; an idle linked worktree is', async () => {
    const root = repo()
    writeFileSync(join(root, 'package.json'), '{}')
    put(join(root, 'node_modules', 'a', 'index.js'), 500)
    const wt = linked(root)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'src', 'a.ts'), 72)
    put(join(wt, 'node_modules', 'a', 'index.js'), 1, 'z'.repeat(2000))
    const found = (await node(root)).candidates
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      id: `artifact:${join(wt, 'node_modules')}`,
      owner: 'node',
      evidence: { kind: 'node-modules', checkout: wt },
    })
    expect(found[0]!.bytes).toBeGreaterThanOrEqual(2000)
  })

  test('a recently changed worktree has no candidate', async () => {
    const root = repo()
    const wt = linked(root)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'src', 'a.ts'), 2)
    put(join(wt, 'node_modules', 'a', 'index.js'), 72)
    expect((await node(root)).candidates).toEqual([])
  })

  test('a process in the worktree refuses it; an idle shell does not', async () => {
    const root = repo()
    const wt = linked(root)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'node_modules', 'a', 'index.js'), 72)
    const shell = { pid: 4, command: 'zsh', hasChildren: false } as ProcessHolder
    expect((await node(root, { probe: probeOf([shell]) })).refused).toEqual([])
    const busy = await node(root, {
      probe: probeOf([{ pid: 5, command: 'node' } as ProcessHolder]),
    })
    expect(busy.refused[0]).toMatchObject({ code: 'live-process' })
    expect(busy.refused[0]!.reason).toMatch(/node \(pid 5\)/)
  })

  test('a version 1 plan of it, whose evidence held the size and modification time, is not changed at the re-check', async () => {
    const root = repo()
    const wt = linked(root)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'node_modules', 'a', 'index.js'), 72)
    const plugin = nodePlugin(options())
    const v2 = plan(await survey([plugin], ctxOf(root)))
    const v1 = {
      ...v2,
      version: 1,
      candidates: v2.candidates.map((c) => ({
        ...c,
        evidence: { ...c.evidence, sizeBytes: 4096, newestMtimeMs: ago(72).getTime() },
      })),
    }
    const read = parsePlan(JSON.stringify(v1), 'v1.json')
    expect(read.candidates[0]!.evidence).toEqual(v2.candidates[0]!.evidence)
    const { decision } = await recheck(read, [plugin], ctxOf(root))
    expect(decision.run.map((c) => c.id)).toEqual([`artifact:${join(wt, 'node_modules')}`])
    expect(decision.dropped).toEqual([])
  })

  test('clean removes node_modules and records the bytes freed', async () => {
    const root = repo()
    const wt = linked(root)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'node_modules', 'a', 'index.js'), 72)
    const plugin = nodePlugin(options())
    const receipt = await clean(plan(await survey([plugin], ctxOf(root))), [plugin], ctxOf(root))
    expect(receipt.status).toBe('complete')
    expect(receipt.steps[0]!.delete).toMatch(/^removed .*node_modules; freed \d+ bytes$/)
    expect(existsSync(join(wt, 'node_modules'))).toBe(false)
    expect(existsSync(join(wt, 'package.json'))).toBe(true)
  })
})

describe('a folder too slow to measure (D11)', () => {
  /** A clock a minute later at every read, so the walk runs out of its budget at once. */
  const slow = (): (() => Date) => {
    let t = NOW.getTime()
    return () => new Date((t += 60_000))
  }

  /** A linked worktree, idle for 72 hours, with a node_modules. */
  function idleWorktree(): { root: string; wt: string } {
    const root = repo()
    const wt = linked(root)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'node_modules', 'a', 'index.js'), 72)
    return { root, wt }
  }

  test('is proposed unmeasured, unsized and not held, with the core protesting it', async () => {
    const { root, wt } = idleWorktree()
    const s = await node(root, { now: slow() })
    expect(s.candidates).toEqual([
      expect.objectContaining({ id: `artifact:${join(wt, 'node_modules')}`, unmeasured: true }),
    ])
    expect(s.candidates[0]!.bytes).toBeUndefined()
    expect(s.candidates[0]!.held).toBeUndefined()
    expect(s.objections).toEqual([
      expect.objectContaining({ by: 'host-cleaner', level: 'protest', code: 'unmeasured' }),
    ])
    expect(plan(s).candidates[0]!.unmeasured).toBe(true)
  })

  test('a cargo target/ whose fingerprints run out of time is unmeasured too', async () => {
    const root = repo()
    target(root, 48)
    const s = await cargo(root, { now: slow() })
    expect(s.candidates).toEqual([
      expect.objectContaining({
        unmeasured: true,
        evidence: expect.objectContaining({ kind: 'cargo-target' }),
      }),
    ])
  })

  test('plan then re-check shows no changed, whether the second walk finishes or not', async () => {
    const { root, wt } = idleWorktree()
    const s = await survey([nodePlugin(options({ now: slow() }))], ctxOf(root))
    // Allowed, so the plan runs it and the re-check compares its evidence.
    const allowed = plan(s, { allow: ['unmeasured'] })
    for (const now of [slow(), () => NOW]) {
      const { decision, survey: again } = await recheck(
        allowed,
        [nodePlugin(options({ now }))],
        ctxOf(root),
      )
      expect(again.candidates[0]!.evidence).toEqual(allowed.candidates[0]!.evidence)
      expect(decision.run.map((c) => c.id)).toEqual([`artifact:${join(wt, 'node_modules')}`])
      expect(decision.dropped).toEqual([])
    }
    // Without --allow unmeasured, nothing runs; with it, the folder is removed.
    const without = await clean(plan(s), [nodePlugin(options())], ctxOf(root))
    expect(without.steps).toEqual([])
    const receipt = await clean(allowed, [nodePlugin(options())], ctxOf(root))
    expect(receipt.steps).toEqual([expect.objectContaining({ result: 'ok' })])
    expect(existsSync(join(wt, 'node_modules'))).toBe(false)
  })
})

describe('the contract suite', () => {
  test('cargo keeps the contract, with cargo itself faked', async () => {
    const root = repo()
    writeFileSync(join(root, 'Cargo.toml'), '[package]\n')
    target(root, 48)
    const cargoBin = fakeRunner({
      cargo: { 'config get build.incremental': { stdout: 'build.incremental = true\n' } },
    })
    const plugin = cargoPlugin({ now: () => NOW, probe: probeOf(), ...cargoBin })
    expect(await contractSuite(plugin, ctxOf(root))).toEqual([])
    expect(existsSync(join(root, 'target'))).toBe(true)
  })

  test('node keeps the contract', async () => {
    const root = repo()
    writeFileSync(join(root, 'package.json'), '{}')
    const wt = linked(root)
    put(join(wt, 'package.json'), 72, '{}')
    put(join(wt, 'node_modules', 'a', 'index.js'), 1)
    expect(await contractSuite(nodePlugin(options()), ctxOf(root))).toEqual([])
    expect(existsSync(join(wt, 'node_modules'))).toBe(true)
  })
})

describe('the kit is all they use', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
  const imports = (file: string): string[] =>
    [...readFileSync(join(src, file), 'utf8').matchAll(/^(?:import|\}) .*from '([^']+)'$/gm)].map(
      (m) => m[1]!,
    )

  test('cargo, node and what they share import nothing private of host-cleaner', () => {
    expect(imports('cargo.ts')).toEqual(expect.arrayContaining(['./artifacts.ts', './kit.ts']))
    for (const file of ['cargo.ts', 'node.ts', 'artifacts.ts']) {
      const own = imports(file).filter((i) => i.startsWith('.'))
      expect(own.filter((i) => !['./kit.ts', './types.ts', './artifacts.ts'].includes(i))).toEqual(
        [],
      )
    }
    for (const file of ['cargo.ts', 'node.ts']) {
      expect(imports(file).filter((i) => i.startsWith('@osdlc/'))).toEqual([])
    }
  })
})

describe('detection', () => {
  test('with neither cargo nor a node or Rust checkout, both plugins drop out of the survey', async () => {
    const root = repo()
    const s = await survey(
      [cargoPlugin(options(fakeCargo({ present: false }))), nodePlugin(options())],
      ctxOf(root),
    )
    expect(s.plugins).toEqual([])
    expect(s.candidates).toEqual([])
  })

  test('a Cargo.toml detects cargo without cargo on PATH', async () => {
    const root = repo()
    writeFileSync(join(root, 'Cargo.toml'), '[package]\n')
    const s = await survey([cargoPlugin(options(fakeCargo({ present: false })))], ctxOf(root))
    expect(s.plugins.map((p) => p.name)).toEqual(['cargo'])
  })
})
