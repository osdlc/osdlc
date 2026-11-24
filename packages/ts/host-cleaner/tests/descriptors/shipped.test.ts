/**
 * The shipped descriptors, each read from the package's `descriptors/` and run
 * on a fixture home for macOS and Linux: the contract suite, its own refusal
 * of a folder outside its roots, and the choice its review made (prune or
 * wipe, idle time, in use). The engine's rules are tested in
 * descriptor-engine.test.ts; these test the files.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { captureContext } from '@osdlc/cli-tool'
import type { CommandRunner } from '@osdlc/command-seam'
import type { ProcessHolder, ProcessProbe } from '@osdlc/repo-cleaner'

import { main } from '../../src/cli.ts'
import {
  BUILT_IN_PLUGINS,
  DEFAULT_IDLE_HOURS,
  IN_USE,
  NO_PRUNE_TOOL,
  SHIPPED_DESCRIPTORS,
  clean,
  descriptorPlugin,
  loadPlugins,
  osOf,
  plan,
  pluginKit,
  readDescriptor,
  survey,
  type Descriptor,
  type Os,
  type PathCandidate,
  type Plugin,
  type RunCtx,
} from '../../src/index.ts'
import { contractSuite, fakeContext, fakeRunner, tempHome } from '../../src/testing.ts'

/** The eight first stores, by plugin name. */
const STORES = ['gradle', 'huggingface-hub', 'maven', 'npm', 'pip', 'pnpm', 'uv', 'yarn'] as const

/** The stores whose candidate is a prune, and the program it runs. */
const PRUNES: Partial<Record<(typeof STORES)[number], string>> = { pnpm: 'pnpm', uv: 'uv' }

const OSES_TESTED: readonly Os[] = ['macos', 'linux']

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

/** The kit's process table, as its `probe` and `ps` options. */
interface Processes {
  probe: ProcessProbe
  ps: CommandRunner
}

/**
 * A process table: `cwd` maps a folder to the processes working in it, for
 * the probe; `/` lists every process, read by `ps` with `command` as its
 * command line.
 */
const processes = (table: Record<string, ProcessHolder[]> = {}): Processes => ({
  probe: { alive: () => false, holders: (path) => table[path] ?? [] },
  ps: {
    run: () => ({
      exitCode: 0,
      stdout: [{ pid: 1, command: '/sbin/init' }, ...(table['/'] ?? [])]
        .map((h) => `${h.pid} ${h.command}\n`)
        .join(''),
      stderr: '',
    }),
  },
})

const shipped = (name: string): Descriptor =>
  readDescriptor(join(SHIPPED_DESCRIPTORS, `${name}.yaml`))

interface Built {
  home: string
  plugin: Plugin
  d: Descriptor
  calls: ReturnType<typeof fakeRunner>['calls']
  /** The folder of `paths.<key>` on the OS it was built for. */
  folder(key: string): string
}

/**
 * The shipped descriptor `name` as a plugin for `os` over a new fixture home,
 * with each of its folders made and a file in it, and two matches of each
 * glob, `a` and `b`. `programs` are on PATH; the settings are the defaults.
 */
function build(
  name: string,
  os: Os,
  o: { programs?: Parameters<typeof fakeRunner>[0]; processes?: Processes } = {},
): Built {
  const h = tempHome()
  cleanups.push(h.cleanup)
  const d = shipped(name)
  const folder = (key: string): string => {
    const p = d.paths[key]!
    const f = (p.all ?? p[os])!
    return join(h.home, f.slice(2))
  }
  for (const key of Object.keys(d.paths)) {
    mkdirSync(folder(key), { recursive: true })
    writeFileSync(join(folder(key), 'blob'), 'x')
  }
  for (const c of d.candidates) {
    for (const n of ['a', 'b']) {
      if (c.glob === undefined) continue
      const rel = c.glob.replace(/\/$/, '').replaceAll('*', n)
      mkdirSync(join(folder(c.path), rel), { recursive: true })
      writeFileSync(join(folder(c.path), rel, 'blob'), n)
    }
  }
  const fake = fakeRunner(o.programs ?? {})
  const kit = pluginKit(name, { env: h.env, ...(o.processes ?? processes()), ...fake })
  const plugin = descriptorPlugin(name, d, { os, ownDirs: [] }).create({
    settings: { idleHours: DEFAULT_IDLE_HOURS },
    only: [],
    env: h.env,
    kit,
  })
  return { home: h.home, plugin, d, calls: fake.calls, folder }
}

const ctxOf = (over: Partial<RunCtx> = {}): RunCtx => ({
  cwd: '/',
  targets: [],
  allow: [],
  ...over,
})

async function surveyAndClean(plugin: Plugin, allow: string[] = []) {
  const ctx = ctxOf({ allow })
  const s = await survey([plugin], ctx)
  return { survey: s, receipt: await clean(plan(s, { allow }), [plugin], ctx) }
}

/** Sets every modification time under `dir`, and its own, to `hours` ago. */
function age(dir: string, hours: number): void {
  const at = new Date(Date.now() - hours * 3_600_000)
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) age(p, hours)
    utimesSync(p, at, at)
  }
  utimesSync(dir, at, at)
}

const ids = (cs: readonly { id: string }[]): string[] => cs.map((c) => c.id).sort()

describe('the shipped folder', () => {
  test('holds the eight first stores, and each reads', () => {
    const files = readdirSync(SHIPPED_DESCRIPTORS).sort()
    expect(files).toEqual(STORES.map((s) => `${s}.yaml`))
    for (const name of STORES) expect(shipped(name).store).toBe(name)
  })

  test('a run loads all eight after the built-ins, by name', () => {
    const { definitions, descriptors } = loadPlugins({})
    expect(definitions.map((d) => d.name)).toEqual([
      ...BUILT_IN_PLUGINS.map((d) => d.name),
      ...STORES,
    ])
    expect(descriptors.map((d) => [d.name, d.source])).toEqual(STORES.map((s) => [s, 'shipped']))
  })

  test('status lists all eight on a home that has each store', async () => {
    const h = tempHome()
    cleanups.push(h.cleanup)
    const os = osOf(process.platform)
    for (const name of STORES) {
      for (const p of Object.values(shipped(name).paths)) {
        const f = p.all ?? p[os]
        if (f !== undefined) mkdirSync(join(h.home, f.slice(2)), { recursive: true })
      }
    }
    const cwd = join(h.home, 'work')
    mkdirSync(cwd)
    const env = {
      ...(process.env as Record<string, string>),
      HOME: h.home,
      HOST_CLEANER_ROOT: join(h.home, 'host-cleaner'),
    }
    const ctx = captureContext({ cwd, env })
    const code = await main(['status', '--skip-plugin', 'git,cargo,node,orca'], ctx, {
      confirm: () => null,
    })
    expect(code).toBe(0)
    expect(ctx.io.out).toContain(`plugins: ${STORES.join(', ')}\n`)
  })
})

describe.each(OSES_TESTED)('on %s', (os) => {
  describe('the contract suite', () => {
    test.each(STORES)('%s passes, with no tool on PATH', async (name) => {
      expect(await contractSuite(build(name, os).plugin)).toEqual([])
    })

    test.each(Object.entries(PRUNES))(
      '%s passes with %s on PATH, and runs it on no moved folder',
      async (name, program) => {
        const b = build(name, os, { programs: { [program]: () => ({}) } })
        expect(await contractSuite(b.plugin)).toEqual([])
        expect(b.calls).toEqual([])
      },
    )
  })

  describe('its own refusal of an outside folder', () => {
    test.each(STORES)(
      '%s: delete throws for a candidate moved out behind a symlink',
      async (name) => {
        const program = PRUNES[name]
        const b = build(
          name,
          os,
          program === undefined ? {} : { programs: { [program]: () => ({}) } },
        )
        const s = await survey([b.plugin], ctxOf())
        const c = s.candidates[0] as PathCandidate
        const outside = tempHome()
        cleanups.push(outside.cleanup)
        const moved = join(outside.home, 'moved')
        renameSync(c.path, moved)
        symlinkSync(moved, c.path)
        await expect(b.plugin.delete!(c, fakeContext())).rejects.toThrow(/is now a symlink/)
        expect(b.calls).toEqual([])
        expect(existsSync(join(moved, 'blob'))).toBe(true)
      },
    )

    test.each(STORES)('%s: delete throws for a folder outside its roots', async (name) => {
      const b = build(name, os)
      const s = await survey([b.plugin], ctxOf())
      const outside = tempHome()
      cleanups.push(outside.cleanup)
      writeFileSync(join(outside.home, 'blob'), 'x')
      const c = { ...(s.candidates[0] as PathCandidate), path: outside.home }
      await expect(b.plugin.delete!(c, fakeContext())).rejects.toThrow(
        `${outside.home} was not deleted: it is not inside ${name}'s roots`,
      )
      expect(existsSync(join(outside.home, 'blob'))).toBe(true)
    })
  })

  describe('pnpm', () => {
    test('prunes the store with pnpm, pointed at it, and removes the idle metadata cache', async () => {
      const b = build('pnpm', os, { programs: { pnpm: () => ({}) } })
      age(b.folder('cache'), 48)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(ids(s.candidates)).toEqual(
        ids([{ id: `pnpm:${b.folder('cache')}` }, { id: `pnpm:${b.folder('store')}` }]),
      )
      expect(b.calls.map((c) => [c.argv, c.opts.cwd])).toEqual([
        [['pnpm', 'store', 'prune', '--store-dir', b.folder('store')], b.home],
      ])
      expect(receipt.steps.map((st) => st.result)).toEqual(['ok', 'ok'])
      expect(existsSync(b.folder('store'))).toBe(true)
      expect(existsSync(b.folder('cache'))).toBe(false)
    })

    test('without pnpm on PATH the store is left alone, with a no-prune-tool protest', async () => {
      const b = build('pnpm', os)
      age(b.folder('store'), 48)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(s.objections.map((o) => [o.candidate, o.code])).toEqual([
        [`pnpm:${b.folder('store')}`, NO_PRUNE_TOOL],
      ])
      expect(receipt.steps).toEqual([])
      expect(existsSync(join(b.folder('store'), 'blob'))).toBe(true)
    })

    test('a running pnpm refuses both', async () => {
      const table = { '/': [{ pid: 7, command: 'node /opt/homebrew/bin/pnpm install' }] }
      const b = build('pnpm', os, { processes: processes(table) })
      const s = await survey([b.plugin], ctxOf())
      expect(s.objections.filter((o) => o.code === IN_USE)).toHaveLength(2)
    })
  })

  describe('uv', () => {
    test('prunes the cache with uv, pointed at it, with no idle check', async () => {
      const b = build('uv', os, { programs: { uv: () => ({}) } })
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(s.candidates[0]!.held).toBeUndefined()
      expect(b.calls.map((c) => [c.argv, c.opts.cwd])).toEqual([
        [['uv', 'cache', 'prune', '--cache-dir', b.folder('cache')], b.home],
      ])
      expect(receipt.steps.map((st) => st.result)).toEqual(['ok'])
    })
  })

  describe('huggingface-hub', () => {
    test('one candidate per model and dataset, removed after 30 idle days', async () => {
      const b = build('huggingface-hub', os)
      const hub = b.folder('hub')
      mkdirSync(join(hub, '.locks', 'models--a'), { recursive: true })
      age(join(hub, 'models--a'), 721)
      age(join(hub, 'models--b'), 719)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(ids(s.candidates)).toEqual(
        ['datasets--a', 'datasets--b', 'models--a', 'models--b'].map(
          (n) => `huggingface-hub:${join(hub, n)}`,
        ),
      )
      expect(s.candidates.find((c) => c.path === join(hub, 'models--b'))!.held).toBe(true)
      expect(receipt.steps.map((st) => st.id)).toEqual([
        `huggingface-hub:${join(hub, 'models--a')}`,
      ])
      expect(existsSync(join(hub, 'models--a'))).toBe(false)
      expect(existsSync(join(hub, 'models--b'))).toBe(true)
      expect(existsSync(join(hub, '.locks'))).toBe(true)
    })
  })

  describe('gradle', () => {
    test('the caches after a week, and each wrapper distribution after 30 days', async () => {
      const b = build('gradle', os)
      age(b.folder('caches'), 169)
      age(join(b.folder('wrapper'), 'a'), 721)
      age(join(b.folder('wrapper'), 'b'), 200)
      const { receipt } = await surveyAndClean(b.plugin)
      expect(receipt.steps.map((st) => st.id).sort()).toEqual(
        [`gradle:${b.folder('caches')}`, `gradle:${join(b.folder('wrapper'), 'a')}`].sort(),
      )
      expect(existsSync(b.folder('caches'))).toBe(false)
      expect(existsSync(join(b.folder('wrapper'), 'b'))).toBe(true)
    })

    test('a running Gradle daemon refuses every candidate', async () => {
      const daemon =
        'java -cp gradle-launcher.jar org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.10'
      const table = { '/': [{ pid: 9, command: daemon }] }
      const b = build('gradle', os, { processes: processes(table) })
      age(b.folder('caches'), 169)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(s.candidates).toHaveLength(3)
      expect(s.objections.filter((o) => o.code === IN_USE)).toHaveLength(3)
      expect(receipt.steps).toEqual([])
      expect(existsSync(b.folder('caches'))).toBe(true)
    })
  })

  describe('npm', () => {
    test('removes the idle package cache, and nothing else in ~/.npm', async () => {
      const b = build('npm', os)
      const npm = join(b.home, '.npm')
      mkdirSync(join(npm, '_logs'))
      mkdirSync(join(npm, '_npx'))
      age(b.folder('cache'), 25)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(ids(s.candidates)).toEqual([`npm:${join(npm, '_cacache')}`])
      expect(receipt.steps.map((st) => st.result)).toEqual(['ok'])
      expect(readdirSync(npm).sort()).toEqual(['_logs', '_npx'])
    })
  })

  describe('pip', () => {
    test(`removes the idle cache in ${os}'s folder`, async () => {
      const b = build('pip', os)
      const cache = join(b.home, os === 'macos' ? 'Library/Caches/pip' : '.cache/pip')
      expect(b.folder('cache')).toBe(cache)
      age(cache, 25)
      const { receipt } = await surveyAndClean(b.plugin)
      expect(receipt.steps.map((st) => st.id)).toEqual([`pip:${cache}`])
      expect(existsSync(cache)).toBe(false)
    })
  })

  describe('yarn', () => {
    test("removes Berry's and Classic's caches once idle, each on its own", async () => {
      const b = build('yarn', os)
      age(b.folder('classic'), 25)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(s.candidates.find((c) => c.path === b.folder('berry'))!.held).toBe(true)
      expect(receipt.steps.map((st) => st.id)).toEqual([`yarn:${b.folder('classic')}`])
      expect(existsSync(b.folder('berry'))).toBe(true)
      expect(existsSync(b.folder('classic'))).toBe(false)
    })
  })

  describe('maven', () => {
    test('holds the local repository until it sat 30 days unchanged', async () => {
      const fresh = build('maven', os)
      age(fresh.folder('repository'), 719)
      const held = await surveyAndClean(fresh.plugin)
      expect(held.survey.candidates[0]!.held).toBe(true)
      expect(held.receipt.steps).toEqual([])

      const idle = build('maven', os)
      age(idle.folder('repository'), 721)
      const { receipt } = await surveyAndClean(idle.plugin)
      expect(receipt.steps.map((st) => st.result)).toEqual(['ok'])
      expect(existsSync(idle.folder('repository'))).toBe(false)
      expect(existsSync(join(idle.home, '.m2'))).toBe(true)
    })
  })
})
