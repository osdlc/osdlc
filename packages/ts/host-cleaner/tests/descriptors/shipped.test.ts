/**
 * The shipped descriptors, each read from the package's `descriptors/` and run
 * on a fixture home for macOS and Linux: the contract suite, its own refusal
 * of a folder outside its roots, the choice its review made (prune or wipe,
 * idle time, in use), and each documented override finding a moved store. The
 * engine's rules are tested in descriptor-engine.test.ts; these test the files.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
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
  OUTSIDE_ROOTS,
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
  type PathCandidate,
  type Plugin,
  type RunCtx,
} from '../../src/index.ts'
import { contractSuite, fakeContext, fakeRunner, tempHome } from '../../src/testing.ts'

/** The shipped stores, by plugin name. */
const STORES = [
  'go',
  'gradle',
  'huggingface-hub',
  'maven',
  'npm',
  'pip',
  'pnpm',
  'uv',
  'yarn',
] as const

type Store = (typeof STORES)[number]

/** The stores whose candidates run a tool's command, and that program. */
const TOOLS: Partial<Record<Store, string>> = { go: 'go', pnpm: 'pnpm', uv: 'uv' }

const OSES_TESTED = ['macos', 'linux'] as const

type TestedOs = (typeof OSES_TESTED)[number]

const both = (path: string): Record<TestedOs, string> => ({ macos: path, linux: path })

/**
 * Each store's folders by `paths` key, under the home folder, when nothing
 * moves them: the folders the tier 1 files named.
 */
const DEFAULTS: Record<Store, Record<string, Record<TestedOs, string>>> = {
  go: {
    modcache: both('go/pkg/mod'),
    buildcache: { macos: 'Library/Caches/go-build', linux: '.cache/go-build' },
  },
  gradle: { caches: both('.gradle/caches'), wrapper: both('.gradle/wrapper/dists') },
  'huggingface-hub': { hub: both('.cache/huggingface/hub') },
  maven: { repository: both('.m2/repository') },
  npm: { cache: both('.npm/_cacache') },
  pip: { cache: { macos: 'Library/Caches/pip', linux: '.cache/pip' } },
  pnpm: {
    store: { macos: 'Library/pnpm/store', linux: '.local/share/pnpm/store' },
    cache: { macos: 'Library/Caches/pnpm', linux: '.cache/pnpm' },
  },
  uv: { cache: both('.cache/uv') },
  yarn: {
    berry: both('.yarn/berry/cache'),
    classic: { macos: 'Library/Caches/Yarn', linux: '.cache/yarn' },
  },
}

/**
 * For each store with an `inUse` process, the command line its program runs
 * as, the way `ps -axo args=` prints it, and the name a refusal shows for it
 * (the first word's last segment).
 */
const RUNNING: Partial<Record<Store, { command: string; shown: string }>> = {
  gradle: {
    command:
      '/usr/bin/java -Xmx512m -cp /home/me/.gradle/wrapper/dists/gradle-8.10-bin/6o1bb8kk/gradle-8.10/lib/gradle-launcher-8.10.jar org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.10',
    shown: 'java',
  },
  npm: { command: 'node /usr/local/bin/npm install', shown: 'node' },
  pnpm: { command: 'node /opt/homebrew/bin/pnpm dev', shown: 'node' },
  uv: { command: '/home/me/.local/bin/uv sync', shown: 'uv' },
  yarn: { command: 'node /usr/local/bin/yarn install', shown: 'node' },
}

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

type Programs = Parameters<typeof fakeRunner>[0]

/** What moves a store's folders in one fixture home. */
interface Moves {
  /** Over the fixture's `HOME`. */
  env?: Record<string, string>
  /** The config's `plugins.<name>.vars`. */
  vars?: Record<string, string>
  /** On PATH, with these answers. */
  programs?: Programs
  /** Files written first, by their path under the home folder. */
  files?: Record<string, string>
  /** Where the move puts each folder, by `paths` key. */
  moved?: Record<string, string>
}

interface Built {
  home: string
  plugin: Plugin
  d: Descriptor
  calls: ReturnType<typeof fakeRunner>['calls']
  /** The folder of `paths.<key>` on the OS it was built for: where it was moved, or the default. */
  folder(key: string): string
}

/** `folder` made with a file in it, and two matches, `a` and `b`, of each glob over `key`. */
function fill(d: Descriptor, key: string, folder: string): void {
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'blob'), 'x')
  for (const c of d.candidates) {
    if (c.path !== key || c.glob === undefined) continue
    for (const n of ['a', 'b']) {
      const rel = c.glob.replace(/\/$/, '').replaceAll('*', n)
      mkdirSync(join(folder, rel), { recursive: true })
      writeFileSync(join(folder, rel, 'blob'), n)
    }
  }
}

/**
 * The shipped descriptor `name` as a plugin for `os` over a new fixture home,
 * with each of its default folders made and filled, and each folder `moves`
 * puts elsewhere made and filled too. `programs` are on PATH; the settings are
 * the defaults, with `moves.vars`.
 */
function build(
  name: Store,
  os: TestedOs,
  o: { programs?: Programs; processes?: Processes; moves?: (home: string) => Moves } = {},
): Built {
  const h = tempHome()
  cleanups.push(h.cleanup)
  const d = shipped(name)
  const m = o.moves?.(h.home) ?? {}
  const folder = (key: string): string => m.moved?.[key] ?? join(h.home, DEFAULTS[name][key]![os])
  for (const key of Object.keys(d.paths)) {
    fill(d, key, join(h.home, DEFAULTS[name][key]![os]))
    fill(d, key, folder(key))
  }
  for (const [rel, text] of Object.entries(m.files ?? {})) {
    mkdirSync(dirname(join(h.home, rel)), { recursive: true })
    writeFileSync(join(h.home, rel), text)
  }
  const env = { ...h.env, ...m.env }
  const fake = fakeRunner({ ...o.programs, ...m.programs })
  const kit = pluginKit(name, { env, ...(o.processes ?? processes()), ...fake })
  const plugin = descriptorPlugin(name, d, { os, ownDirs: [] }).create({
    settings: { idleHours: DEFAULT_IDLE_HOURS, vars: m.vars },
    only: [],
    env,
    kit,
  })
  return { home: h.home, plugin, d, calls: fake.calls, folder }
}

/** The candidates' paths `b`'s descriptor gives from its folders now: each folder, or each glob match in it. */
function expectedPaths(b: Built): string[] {
  const out = new Set<string>()
  for (const c of b.d.candidates) {
    const folder = b.folder(c.path)
    if (c.glob === undefined) out.add(folder)
    else
      for (const n of ['a', 'b'])
        out.add(join(folder, c.glob.replace(/\/$/, '').replaceAll('*', n)))
  }
  return [...out].sort()
}

/** The calls other than a variable's `command` source: what the plugin ran to delete. */
function actions(b: Built): string[][] {
  const lookups = new Set(
    Object.values(b.d.vars ?? {})
      .flat()
      .flatMap((s) => ('command' in s ? [s.command.join(' ')] : [])),
  )
  return b.calls.map((c) => c.argv).filter((argv) => !lookups.has(argv.join(' ')))
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
  test('holds the nine stores, and each reads', () => {
    const files = readdirSync(SHIPPED_DESCRIPTORS).sort()
    expect(files).toEqual(STORES.map((s) => `${s}.yaml`))
    for (const name of STORES) expect(shipped(name).store).toBe(name)
  })

  test('the stores with an in-use process are those with a command line to fake', () => {
    const named = STORES.filter((name) => (shipped(name).inUse?.processes ?? []).length > 0)
    expect(named).toEqual(Object.keys(RUNNING))
  })

  test('a run loads all nine after the built-ins, by name', () => {
    const { definitions, descriptors } = loadPlugins({})
    expect(definitions.map((d) => d.name)).toEqual([
      ...BUILT_IN_PLUGINS.map((d) => d.name),
      ...STORES,
    ])
    expect(descriptors.map((d) => [d.name, d.source])).toEqual(STORES.map((s) => [s, 'shipped']))
  })

  test('status lists all nine on a home that has each store', async () => {
    const h = tempHome()
    cleanups.push(h.cleanup)
    const os = osOf(process.platform) as TestedOs
    for (const name of STORES) {
      for (const p of Object.values(DEFAULTS[name])) {
        mkdirSync(join(h.home, p[os]), { recursive: true })
      }
    }
    const cwd = join(h.home, 'work')
    mkdirSync(cwd)
    // Nothing on PATH and none of this machine's settings: each store is found by its folder.
    const env = { HOME: h.home, HOST_CLEANER_ROOT: join(h.home, 'host-cleaner'), PATH: cwd }
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

    test.each(Object.entries(TOOLS) as [Store, string][])(
      '%s passes with %s on PATH, and runs it on no moved folder',
      async (name, program) => {
        const b = build(name, os, { programs: { [program]: () => ({}) } })
        expect(await contractSuite(b.plugin)).toEqual([])
        expect(actions(b)).toEqual([])
      },
    )
  })

  describe('its own refusal of an outside folder', () => {
    test.each(STORES)(
      '%s: delete throws for a candidate moved out behind a symlink',
      async (name) => {
        const program = TOOLS[name]
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
        expect(actions(b)).toEqual([])
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

  describe('in use', () => {
    test.each(Object.entries(RUNNING) as [Store, { command: string; shown: string }][])(
      '%s: its program running refuses every candidate',
      async (name, { command, shown }) => {
        const b = build(name, os, { processes: processes({ '/': [{ pid: 7, command }] }) })
        const s = await survey([b.plugin], ctxOf())
        const inUse = s.objections.filter((o) => o.code === IN_USE)
        expect(s.candidates.length).toBeGreaterThan(0)
        expect(inUse.map((o) => o.candidate).sort()).toEqual(ids(s.candidates))
        expect(inUse.map((o) => o.reason)).toContain(`running: ${shown} (pid 7)`)
      },
    )

    test.each(Object.keys(RUNNING) as Store[])(
      "%s: the other stores' programs running refuse none of its candidates",
      async (name) => {
        const others = Object.entries(RUNNING)
          .filter(([store]) => store !== name)
          .map(([, r], i) => ({ pid: 10 + i, command: r.command }))
        const b = build(name, os, { processes: processes({ '/': others }) })
        const s = await survey([b.plugin], ctxOf())
        expect(s.objections.filter((o) => o.code === IN_USE)).toEqual([])
      },
    )
  })

  describe('pnpm', () => {
    test('prunes the store with pnpm, pointed at it, and removes the idle metadata cache', async () => {
      const b = build('pnpm', os, { programs: { pnpm: () => ({}) } })
      age(b.folder('cache'), 48)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(ids(s.candidates)).toEqual(
        ids([{ id: `pnpm:${b.folder('cache')}` }, { id: `pnpm:${b.folder('store')}` }]),
      )
      // pnpm store path prints nothing here, so the default folder is used.
      expect(b.calls.map((c) => [c.argv, c.opts.cwd])).toEqual([
        [['pnpm', 'store', 'path'], b.home],
        [['pnpm', 'store', 'path'], b.home],
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
      const table = { '/': [{ pid: 9, command: RUNNING.gradle!.command }] }
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

    test('a LOCAL_REPOSITORY set in the config is trusted on another disk, and cleaned', async () => {
      const disk = tempHome()
      cleanups.push(disk.cleanup)
      const repo = join(disk.home, 'm2')
      const b = build('maven', os, {
        moves: () => ({ vars: { LOCAL_REPOSITORY: repo }, moved: { repository: repo } }),
      })
      age(repo, 721)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(s.objections).toEqual([])
      expect(receipt.steps).toMatchObject([{ id: `maven:${repo}`, result: 'ok' }])
      expect(existsSync(repo)).toBe(false)
      expect(existsSync(join(b.home, '.m2/repository/blob'))).toBe(true)
    })
  })

  describe('go', () => {
    test('removes the module cache, read-only files and all, after 30 days, and the build cache after a week', async () => {
      const b = build('go', os)
      const mod = b.folder('modcache')
      const pkg = join(mod, 'example.com', 'm@v1.0.0')
      mkdirSync(pkg, { recursive: true })
      writeFileSync(join(pkg, 'go.mod'), 'module example.com/m\n')
      age(mod, 721)
      age(b.folder('buildcache'), 169)
      // As go leaves them: files and folders read-only.
      chmodSync(join(pkg, 'go.mod'), 0o444)
      chmodSync(pkg, 0o555)
      chmodSync(dirname(pkg), 0o555)
      cleanups.push(() => {
        if (!existsSync(pkg)) return
        chmodSync(dirname(pkg), 0o755)
        chmodSync(pkg, 0o755)
      })
      const { receipt } = await surveyAndClean(b.plugin)
      expect(receipt.steps.map((st) => [st.id, st.result])).toEqual([
        [`go:${mod}`, 'ok'],
        [`go:${b.folder('buildcache')}`, 'ok'],
      ])
      expect(existsSync(mod)).toBe(false)
      expect(existsSync(b.folder('buildcache'))).toBe(false)
      expect(existsSync(join(b.home, 'go'))).toBe(true)
    })

    test('holds the module cache until it sat 30 days unchanged', async () => {
      const b = build('go', os)
      age(b.folder('modcache'), 719)
      const s = await survey([b.plugin], ctxOf())
      expect(s.candidates.find((c) => c.path === b.folder('modcache'))!.held).toBe(true)
    })

    test('with go on PATH, each cache is where go env says, and go clean is pointed at it', async () => {
      const b = build('go', os, {
        moves: (home) => {
          const mod = join(home, 'disk/mod')
          const cache = join(home, 'disk/build')
          return {
            programs: {
              go: (argv) =>
                argv[0] === 'env' ? { stdout: `${argv[1] === 'GOMODCACHE' ? mod : cache}\n` } : {},
            },
            moved: { modcache: mod, buildcache: cache },
          }
        },
      })
      age(b.folder('modcache'), 721)
      age(b.folder('buildcache'), 169)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(s.candidates.map((c) => c.path)).toEqual([
        b.folder('modcache'),
        b.folder('buildcache'),
      ])
      expect(receipt.steps.map((st) => st.result)).toEqual(['ok', 'ok'])
      expect(actions(b)).toEqual([
        ['go', 'clean', '-modcache'],
        ['go', 'clean', '-cache'],
      ])
      expect(
        b.calls
          .filter((c) => c.argv[1] === 'clean')
          .map((c) => [c.opts.env?.GOMODCACHE ?? c.opts.env?.GOCACHE, c.opts.cwd]),
      ).toEqual([
        [b.folder('modcache'), b.home],
        [b.folder('buildcache'), b.home],
      ])
    })
  })

  describe('a moved store is found', () => {
    const at = (home: string, rel: string): string => join(home, 'moved', rel)
    const cases: Array<[Store, string, (home: string) => Moves]> = [
      [
        'go',
        'GOMODCACHE',
        (h) => ({ env: { GOMODCACHE: at(h, 'mod') }, moved: { modcache: at(h, 'mod') } }),
      ],
      [
        'go',
        'GOPATH',
        (h) => ({ env: { GOPATH: at(h, 'gopath') }, moved: { modcache: at(h, 'gopath/pkg/mod') } }),
      ],
      [
        'go',
        'GOCACHE',
        (h) => ({ env: { GOCACHE: at(h, 'build') }, moved: { buildcache: at(h, 'build') } }),
      ],
      [
        'go',
        'go env',
        (h) => ({
          programs: { go: (argv) => (argv[0] === 'env' ? { stdout: `${at(h, argv[1]!)}\n` } : {}) },
          moved: { modcache: at(h, 'GOMODCACHE'), buildcache: at(h, 'GOCACHE') },
        }),
      ],
      [
        'gradle',
        'GRADLE_USER_HOME',
        (h) => ({
          env: { GRADLE_USER_HOME: at(h, 'gradle') },
          moved: { caches: at(h, 'gradle/caches'), wrapper: at(h, 'gradle/wrapper/dists') },
        }),
      ],
      [
        'huggingface-hub',
        'HF_HOME',
        (h) => ({ env: { HF_HOME: at(h, 'hf') }, moved: { hub: at(h, 'hf/hub') } }),
      ],
      [
        'huggingface-hub',
        'HF_HUB_CACHE, over HF_HOME',
        (h) => ({
          env: { HF_HUB_CACHE: at(h, 'hub'), HF_HOME: at(h, 'hf') },
          moved: { hub: at(h, 'hub') },
        }),
      ],
      [
        'huggingface-hub',
        'HUGGINGFACE_HUB_CACHE',
        (h) => ({ env: { HUGGINGFACE_HUB_CACHE: at(h, 'hub') }, moved: { hub: at(h, 'hub') } }),
      ],
      [
        'huggingface-hub',
        'XDG_CACHE_HOME',
        (h) => ({
          env: { XDG_CACHE_HOME: at(h, 'xdg') },
          moved: { hub: at(h, 'xdg/huggingface/hub') },
        }),
      ],
      [
        'maven',
        'LOCAL_REPOSITORY in the config',
        (h) => ({ vars: { LOCAL_REPOSITORY: at(h, 'm2') }, moved: { repository: at(h, 'm2') } }),
      ],
      [
        'npm',
        'npm_config_cache',
        (h) => ({
          env: { npm_config_cache: at(h, 'npm') },
          moved: { cache: at(h, 'npm/_cacache') },
        }),
      ],
      [
        'npm',
        'NPM_CONFIG_CACHE',
        (h) => ({
          env: { NPM_CONFIG_CACHE: at(h, 'npm') },
          moved: { cache: at(h, 'npm/_cacache') },
        }),
      ],
      [
        'npm',
        'npm config get cache',
        (h) => ({
          programs: {
            npm: (argv) => (argv[0] === 'config' ? { stdout: `${at(h, 'npm')}\n` } : {}),
          },
          moved: { cache: at(h, 'npm/_cacache') },
        }),
      ],
      [
        'pip',
        'PIP_CACHE_DIR',
        (h) => ({ env: { PIP_CACHE_DIR: at(h, 'pip') }, moved: { cache: at(h, 'pip') } }),
      ],
      [
        'pnpm',
        'pnpm store path',
        (h) => ({
          programs: {
            pnpm: (argv) => (argv[1] === 'path' ? { stdout: `${at(h, 'store/v10')}\n` } : {}),
          },
          moved: { store: at(h, 'store/v10') },
        }),
      ],
      [
        'uv',
        'UV_CACHE_DIR',
        (h) => ({ env: { UV_CACHE_DIR: at(h, 'uv') }, moved: { cache: at(h, 'uv') } }),
      ],
      [
        'uv',
        'cache-dir in uv.toml',
        (h) => ({
          files: { '.config/uv/uv.toml': `cache-dir = "${at(h, 'uv')}"\n` },
          moved: { cache: at(h, 'uv') },
        }),
      ],
      [
        'uv',
        'XDG_CACHE_HOME',
        (h) => ({ env: { XDG_CACHE_HOME: at(h, 'xdg') }, moved: { cache: at(h, 'xdg/uv') } }),
      ],
      [
        'yarn',
        'YARN_GLOBAL_FOLDER',
        (h) => ({
          env: { YARN_GLOBAL_FOLDER: at(h, 'berry') },
          moved: { berry: at(h, 'berry/cache') },
        }),
      ],
      [
        'yarn',
        'globalFolder in ~/.yarnrc.yml',
        (h) => ({
          files: { '.yarnrc.yml': `globalFolder: ${at(h, 'berry')}\n` },
          moved: { berry: at(h, 'berry/cache') },
        }),
      ],
      [
        'yarn',
        'YARN_CACHE_FOLDER',
        (h) => ({
          env: { YARN_CACHE_FOLDER: at(h, 'classic') },
          moved: { classic: at(h, 'classic') },
        }),
      ],
    ]
    // On Linux these follow the XDG folders; on macOS they sit in ~/Library.
    const linuxOnly: typeof cases = [
      [
        'go',
        'XDG_CACHE_HOME',
        (h) => ({
          env: { XDG_CACHE_HOME: at(h, 'xdg') },
          moved: { buildcache: at(h, 'xdg/go-build') },
        }),
      ],
      [
        'pip',
        'XDG_CACHE_HOME',
        (h) => ({ env: { XDG_CACHE_HOME: at(h, 'xdg') }, moved: { cache: at(h, 'xdg/pip') } }),
      ],
      [
        'pnpm',
        'XDG_CACHE_HOME',
        (h) => ({ env: { XDG_CACHE_HOME: at(h, 'xdg') }, moved: { cache: at(h, 'xdg/pnpm') } }),
      ],
      [
        'pnpm',
        'XDG_DATA_HOME',
        (h) => ({
          env: { XDG_DATA_HOME: at(h, 'data') },
          moved: { store: at(h, 'data/pnpm/store') },
        }),
      ],
      [
        'yarn',
        'XDG_CACHE_HOME',
        (h) => ({ env: { XDG_CACHE_HOME: at(h, 'xdg') }, moved: { classic: at(h, 'xdg/yarn') } }),
      ],
    ]

    test.each(os === 'linux' ? [...cases, ...linuxOnly] : cases)(
      '%s follows %s, and leaves the default folder alone',
      async (name, _how, moves) => {
        const b = build(name, os, { moves })
        const s = await survey([b.plugin], ctxOf())
        expect(s.warnings).toEqual([])
        expect(s.objections.filter((o) => o.code === OUTSIDE_ROOTS)).toEqual([])
        expect(s.candidates.map((c) => c.path).sort()).toEqual(expectedPaths(b))
      },
    )

    test.skipIf(os !== 'macos')(
      'XDG_CACHE_HOME moves none of the caches kept in ~/Library',
      async () => {
        for (const name of ['go', 'pip', 'pnpm', 'yarn'] as const) {
          const b = build(name, os, { moves: (h) => ({ env: { XDG_CACHE_HOME: at(h, 'xdg') } }) })
          const s = await survey([b.plugin], ctxOf())
          expect(s.candidates.map((c) => c.path).sort(), name).toEqual(expectedPaths(b))
        }
      },
    )

    test('a moved pnpm store is pruned where pnpm says it is', async () => {
      const b = build('pnpm', os, {
        moves: (h) => ({
          programs: {
            pnpm: (argv) => (argv[1] === 'path' ? { stdout: `${at(h, 'store/v10')}\n` } : {}),
          },
          moved: { store: at(h, 'store/v10') },
        }),
      })
      const { receipt } = await surveyAndClean(b.plugin)
      expect(receipt.steps.map((st) => [st.id, st.result])).toEqual([
        [`pnpm:${b.folder('store')}`, 'ok'],
      ])
      expect(actions(b)).toEqual([['pnpm', 'store', 'prune', '--store-dir', b.folder('store')]])
    })
  })
})
