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
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { captureContext } from '@osdlc/cli-tool'
import type { ProcessHolder } from '@osdlc/repo-cleaner'

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
import { effectiveSettings, sourcesOf, settingsOf } from '../../src/settings.ts'
import {
  ageTree as age,
  contractSuite,
  fakeContext,
  fakeProcesses,
  fakeRunner,
  tempHome,
  type FakeProcesses,
} from '../../src/testing.ts'

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

/** Each store's folders by `paths` key, under the home folder, when nothing moves them. */
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
  yarn: { classic: { macos: 'Library/Caches/Yarn', linux: '.cache/yarn' } },
}

/**
 * For each store with an `inUse` process, the command line its program runs
 * as, the way `ps -axo args=` prints it, and the name a refusal shows for it
 * (the first word's last segment).
 */
const RUNNING: Partial<Record<Store, { command: string; shown: string }>> = {
  go: { command: '/usr/local/go/bin/go test ./...', shown: 'go' },
  gradle: {
    command:
      '/usr/bin/java -Xmx512m -cp /home/me/.gradle/wrapper/dists/gradle-8.10-bin/6o1bb8kk/gradle-8.10/lib/gradle-launcher-8.10.jar org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.10',
    shown: 'java',
  },
  maven: {
    command:
      '/usr/bin/java -classpath /opt/maven/boot/plexus-classworlds-2.8.0.jar -Dclassworlds.conf=/opt/maven/bin/m2.conf -Dmaven.home=/opt/maven org.codehaus.plexus.classworlds.launcher.Launcher package',
    shown: 'java',
  },
  npm: { command: 'node /usr/local/bin/npm install', shown: 'node' },
  pip: { command: '/usr/bin/python3 -m pip install -r requirements.txt', shown: 'python3' },
  pnpm: { command: 'node /opt/homebrew/bin/pnpm dev', shown: 'node' },
  uv: { command: '/home/me/.local/bin/uv sync', shown: 'uv' },
  yarn: { command: 'node /usr/local/bin/yarn install', shown: 'node' },
}

/**
 * The first fake process id, above any real one (Linux's pid_max is at most
 * 2^22), so the kit never leaves a fake row out as this process or an ancestor.
 */
const PID = 5_000_000

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

/** A process table where no process works in any folder, and `ps` lists `running`. */
const processes = (running: ProcessHolder[]): FakeProcesses => fakeProcesses({ '/': running })

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
  /** The calls made while the plugin's `delete` ran, in order, lookups included. */
  deleting: ReturnType<typeof fakeRunner>['calls']
  /** The folder of `paths.<key>` on the OS it was built for: where it was moved, or the default. */
  folder(key: string): string
}

/** The two fixture matches of `glob`, `a` and `b`, relative to its folder. */
const globMatches = (glob: string): Array<[name: string, rel: string]> =>
  ['a', 'b'].map((n): [string, string] => [n, glob.replace(/\/$/, '').replaceAll('*', n)])

/** `folder` made with a file in it, and the matches of each glob over `key`. */
function fill(d: Descriptor, key: string, folder: string): void {
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'blob'), 'x')
  for (const c of d.candidates) {
    if (c.path !== key || c.glob === undefined) continue
    for (const [n, rel] of globMatches(c.glob)) {
      mkdirSync(join(folder, rel), { recursive: true })
      writeFileSync(join(folder, rel, 'blob'), n)
    }
  }
}

/**
 * The shipped descriptor `name` as a plugin for `os` over a new fixture home,
 * with each of its default folders made and filled, and each folder `moves`
 * puts elsewhere made and filled too. `programs` are on PATH; the settings are
 * the defaults, with `moves.vars`, unless `config` gives the plugin's entry and
 * the top-level settings.
 */
function build(
  name: Store,
  os: TestedOs,
  o: {
    programs?: Programs
    processes?: FakeProcesses
    moves?: (home: string) => Moves
    config?: { entry: Record<string, unknown>; shared: { idleHours?: number } }
  } = {},
): Built {
  const h = tempHome()
  cleanups.push(h.cleanup)
  const d = shipped(name)
  const m = o.moves?.(h.home) ?? {}
  const defaultFolder = (key: string): string => join(h.home, DEFAULTS[name][key]![os])
  const folder = (key: string): string => m.moved?.[key] ?? defaultFolder(key)
  for (const key of Object.keys(d.paths)) {
    fill(d, key, defaultFolder(key))
    if (folder(key) !== defaultFolder(key)) fill(d, key, folder(key))
  }
  for (const [rel, text] of Object.entries(m.files ?? {})) {
    mkdirSync(dirname(join(h.home, rel)), { recursive: true })
    writeFileSync(join(h.home, rel), text)
  }
  const env = { ...h.env, ...m.env }
  const fake = fakeRunner({ ...o.programs, ...m.programs })
  const kit = pluginKit(name, { env, ...(o.processes ?? processes([])), ...fake })
  const def = descriptorPlugin(name, d, { os, ownDirs: [] })
  const plugin = def.create({
    ...(o.config === undefined
      ? { settings: { idleHours: DEFAULT_IDLE_HOURS, vars: m.vars } }
      : {
          settings: settingsOf(name, o.config.entry, o.config.shared, [def]) as {
            idleHours?: number
          },
          sources: sourcesOf(name, o.config.entry, o.config.shared, [def]),
        }),
    only: [],
    env,
    kit,
  })
  const deleting: Built['deleting'] = []
  const del = plugin.delete!.bind(plugin)
  plugin.delete = async (c, ctx) => {
    const from = fake.calls.length
    try {
      return await del(c, ctx)
    } finally {
      deleting.push(...fake.calls.slice(from))
    }
  }
  return { home: h.home, plugin, d, deleting, folder }
}

/** The candidates' paths `b`'s descriptor gives from its folders now: each folder, or each glob match in it. */
function expectedPaths(b: Built): string[] {
  const out = new Set<string>()
  for (const c of b.d.candidates) {
    const folder = b.folder(c.path)
    if (c.glob === undefined) out.add(folder)
    else for (const [, rel] of globMatches(c.glob)) out.add(join(folder, rel))
  }
  return [...out].sort()
}

/** The argv of each call the plugin made while deleting. */
const actions = (b: Built): string[][] => b.deleting.map((c) => c.argv)

/** `Object.entries` of a per-store table, keyed by {@link Store}. */
const storeEntries = <V>(r: Partial<Record<Store, V>>): Array<[Store, V]> =>
  Object.entries(r) as Array<[Store, V]>

const CTX: RunCtx = { cwd: '/', targets: [], allow: [] }

async function surveyAndClean(plugin: Plugin, pick: string[] = []) {
  const s = await survey([plugin], CTX)
  return { survey: s, receipt: await clean(plan(s, { pick }), [plugin], CTX) }
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

    test.each(storeEntries(TOOLS))(
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
        const s = await survey([b.plugin], CTX)
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
      const s = await survey([b.plugin], CTX)
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
    test.each(storeEntries(RUNNING))(
      '%s: its program running refuses every candidate',
      async (name, { command, shown }) => {
        const b = build(name, os, { processes: processes([{ pid: PID, command }]) })
        const s = await survey([b.plugin], CTX)
        const inUse = s.objections.filter((o) => o.code === IN_USE)
        expect(s.candidates.length).toBeGreaterThan(0)
        expect(inUse.map((o) => o.candidate).sort()).toEqual(ids(s.candidates))
        expect(inUse.map((o) => o.reason)).toContain(`running: ${shown} (pid ${PID})`)
      },
    )

    test.each(storeEntries(RUNNING).map(([name]) => name))(
      "%s: the other stores' programs running refuse none of its candidates",
      async (name) => {
        const others = Object.entries(RUNNING)
          .filter(([store]) => store !== name)
          .map(([, r], i) => ({ pid: PID + 1 + i, command: r.command }))
        const b = build(name, os, { processes: processes(others) })
        const s = await survey([b.plugin], CTX)
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
        [`pnpm:${b.folder('cache')}`, `pnpm:${b.folder('store')}`].sort(),
      )
      // pnpm store path prints nothing here, so the default folder is used.
      expect(b.deleting.map((c) => [c.argv, c.opts.cwd])).toEqual([
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
      expect(b.deleting.map((c) => [c.argv, c.opts.cwd])).toEqual([
        [['uv', 'cache', 'prune', '--cache-dir', b.folder('cache')], b.home],
      ])
      expect(receipt.steps.map((st) => st.result)).toEqual(['ok'])
    })
  })

  describe('huggingface-hub', () => {
    test('one candidate per model, dataset and space, removed after 30 idle days', async () => {
      const b = build('huggingface-hub', os)
      const hub = b.folder('hub')
      mkdirSync(join(hub, '.locks', 'models--a'), { recursive: true })
      age(join(hub, 'models--a'), 721)
      age(join(hub, 'models--b'), 719)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(ids(s.candidates)).toEqual(
        ['datasets--a', 'datasets--b', 'models--a', 'models--b', 'spaces--a', 'spaces--b'].map(
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

    test.each([
      ['a Gradle daemon', RUNNING.gradle!.command],
      [
        'a --no-daemon build through the wrapper',
        '/usr/bin/java -classpath /home/me/app/gradle/wrapper/gradle-wrapper.jar org.gradle.wrapper.GradleWrapperMain --no-daemon build',
      ],
      [
        'a --no-daemon build in its own JVM',
        '/usr/bin/java -cp /home/me/.gradle/wrapper/dists/gradle-8.10-bin/6o1bb8kk/gradle-8.10/lib/gradle-launcher-8.10.jar org.gradle.launcher.GradleMain --no-daemon build',
      ],
    ])('%s running refuses every candidate', async (_, command) => {
      const b = build('gradle', os, { processes: processes([{ pid: PID, command }]) })
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

    test.each([
      'node /opt/homebrew/bin/npx -y some-tool',
      'node /home/me/.volta/tools/image/node/20.0.0/lib/node_modules/npm/bin/npm-cli.js install',
      'node /usr/lib/node_modules/npm/bin/npx-cli.js -y some-tool',
    ])('`%s` running refuses the cache', async (command) => {
      const b = build('npm', os, { processes: processes([{ pid: PID, command }]) })
      const s = await survey([b.plugin], CTX)
      const inUse = s.objections.filter((o) => o.code === IN_USE)
      expect(inUse.map((o) => o.candidate)).toEqual([`npm:${b.folder('cache')}`])
    })
  })

  describe('pip', () => {
    test.each([
      '/usr/bin/pip install -r requirements.txt',
      '/usr/bin/python3 /usr/local/bin/pip3 install requests',
      '/usr/bin/python3.12 /usr/local/bin/pip3.12 install requests',
      'python -m pip install requests',
    ])('`%s` running refuses the idle cache', async (command) => {
      const b = build('pip', os, { processes: processes([{ pid: PID, command }]) })
      age(b.folder('cache'), 25)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      const inUse = s.objections.filter((o) => o.code === IN_USE)
      expect(inUse.map((o) => o.candidate)).toEqual([`pip:${b.folder('cache')}`])
      expect(receipt.steps).toEqual([])
      expect(existsSync(b.folder('cache'))).toBe(true)
    })

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
    test("removes Classic's idle cache, and leaves Berry's, which Plug'n'Play projects run from", async () => {
      const b = build('yarn', os)
      const berry = join(b.home, '.yarn', 'berry', 'cache')
      mkdirSync(berry, { recursive: true })
      writeFileSync(join(berry, 'pkg.zip'), 'x')
      age(berry, 721)
      age(b.folder('classic'), 25)
      const { survey: s, receipt } = await surveyAndClean(b.plugin)
      expect(ids(s.candidates)).toEqual([`yarn:${b.folder('classic')}`])
      expect(receipt.steps.map((st) => st.id)).toEqual([`yarn:${b.folder('classic')}`])
      expect(existsSync(join(berry, 'pkg.zip'))).toBe(true)
      expect(existsSync(b.folder('classic'))).toBe(false)
    })
  })

  describe('maven', () => {
    test('holds the local repository however long it sat unchanged, and removes it when picked', async () => {
      const b = build('maven', os)
      age(b.folder('repository'), 10_000)
      const held = await surveyAndClean(b.plugin)
      expect(held.survey.candidates).toMatchObject([{ held: true, costDescription: 'rebuild' }])
      expect(held.receipt.steps).toEqual([])
      expect(existsSync(b.folder('repository'))).toBe(true)

      const picked = await surveyAndClean(b.plugin, ids(held.survey.candidates))
      expect(picked.receipt.steps.map((st) => st.result)).toEqual(['ok'])
      expect(existsSync(b.folder('repository'))).toBe(false)
      expect(existsSync(join(b.home, '.m2'))).toBe(true)
    })

    test.each([
      [
        'the jar-based ./mvnw',
        '/usr/bin/java -classpath /home/me/app/.mvn/wrapper/maven-wrapper.jar -Dmaven.multiModuleProjectDirectory=/home/me/app org.apache.maven.wrapper.MavenWrapperMain install',
      ],
      ['the mvnd client', '/home/me/.sdkman/candidates/mvnd/current/bin/mvnd install'],
      [
        'the mvnd daemon',
        '/usr/bin/java -classpath /opt/mvnd/mvn/lib/ext/mvnd-daemon.jar org.mvndaemon.mvnd.common.MavenDaemon',
      ],
      [
        "IntelliJ's embedded Maven server",
        '/opt/idea/jbr/bin/java -classpath /opt/idea/plugins/maven/lib/maven-server.jar org.jetbrains.idea.maven.server.RemoteMavenServer36',
      ],
    ])('%s running refuses the repository', async (_, command) => {
      const b = build('maven', os, { processes: processes([{ pid: PID, command }]) })
      const id = `maven:${b.folder('repository')}`
      const { survey: s, receipt } = await surveyAndClean(b.plugin, [id])
      expect(s.objections.filter((o) => o.code === IN_USE).map((o) => o.candidate)).toEqual([id])
      expect(receipt.steps).toEqual([])
      expect(existsSync(b.folder('repository'))).toBe(true)
    })

    test('a LOCAL_REPOSITORY set in the config is trusted on another disk, and cleaned when picked', async () => {
      const disk = tempHome()
      cleanups.push(disk.cleanup)
      const repo = join(disk.home, 'm2')
      const b = build('maven', os, {
        moves: () => ({ vars: { LOCAL_REPOSITORY: repo }, moved: { repository: repo } }),
      })
      age(repo, 721)
      const { survey: s, receipt } = await surveyAndClean(b.plugin, [`maven:${repo}`])
      expect(s.objections).toEqual([])
      expect(receipt.steps).toMatchObject([{ id: `maven:${repo}`, result: 'ok' }])
      expect(existsSync(repo)).toBe(false)
      expect(existsSync(join(b.home, '.m2/repository/blob'))).toBe(true)
    })
  })

  describe("an entry's own idleHours", () => {
    type Config = { entry: Record<string, unknown>; shared: { idleHours?: number } }

    /** Whether Gradle's caches (168 hours), `hours` idle, are still there after a clean under `config`. */
    const kept = async (config: Config, hours: number): Promise<boolean> => {
      const b = build('gradle', os, { config })
      age(b.folder('caches'), hours)
      await surveyAndClean(b.plugin)
      return existsSync(b.folder('caches'))
    }

    test("the plugin's idleHours the user set wins over it, both ways", async () => {
      expect(await kept({ entry: { idleHours: 4000 }, shared: {} }, 169)).toBe(true)
      expect(await kept({ entry: { idleHours: 48 }, shared: { idleHours: 4000 } }, 49)).toBe(false)
    })

    test('the top-level idleHours raises it, and never lowers it', async () => {
      expect(await kept({ entry: {}, shared: { idleHours: 4000 } }, 169)).toBe(true)
      expect(await kept({ entry: {}, shared: { idleHours: 0 } }, 49)).toBe(true)
      expect(await kept({ entry: {}, shared: { idleHours: 0 } }, 169)).toBe(false)
    })

    test('config shows the threshold the run applies to each entry', () => {
      const { definitions } = loadPlugins({})
      const parts = (name: string, entry: Config['entry'], shared: Config['shared']) =>
        effectiveSettings({ [name]: entry }, shared, definitions)[name]!.find(
          (r) => r.key === 'idleHours',
        )!.parts
      const gradle = (caches: number, wrapper: number) => [
        { part: 'caches', idleHours: caches },
        { part: 'wrapper/*/', idleHours: wrapper },
      ]
      expect(parts('gradle', {}, {})).toEqual(gradle(168, 720))
      expect(parts('gradle', {}, { idleHours: 0 })).toEqual(gradle(168, 720))
      expect(parts('gradle', {}, { idleHours: 200 })).toEqual(gradle(200, 720))
      expect(parts('gradle', { idleHours: 10 }, { idleHours: 4000 })).toEqual(gradle(10, 10))
      expect(parts('huggingface-hub', {}, {})!.map((p) => p.part)).toEqual([
        'hub/models--*/',
        'hub/datasets--*/',
        'hub/spaces--*/',
      ])
      expect(parts('npm', {}, {})).toBeUndefined()
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
      const s = await survey([b.plugin], CTX)
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
        b.deleting.map((c) => [c.opts.env?.GOMODCACHE ?? c.opts.env?.GOCACHE, c.opts.cwd]),
      ).toEqual([
        [b.folder('modcache'), b.home],
        [b.folder('buildcache'), b.home],
      ])
      // No toolchain switch, so go clean never downloads one into the cache.
      expect(b.deleting.map((c) => c.opts.env?.GOTOOLCHAIN)).toEqual(['local', 'local'])
    })
  })

  describe('a moved store is found', () => {
    const at = (home: string, rel: string): string => join(home, 'moved', rel)
    const pnpmStorePath = (h: string): Moves => ({
      programs: {
        pnpm: (argv) => (argv[1] === 'path' ? { stdout: `${at(h, 'store/v10')}\n` } : {}),
      },
      moved: { store: at(h, 'store/v10') },
    })
    type Case = [Store, string, (home: string) => Moves]
    /** `variable` set to `moved/<rel>` moves `name`'s `paths.<key>` to `moved/<movedRel>`. */
    const byEnv = (
      name: Store,
      variable: string,
      rel: string,
      key: string,
      movedRel = rel,
    ): Case => [
      name,
      variable,
      (h) => ({ env: { [variable]: at(h, rel) }, moved: { [key]: at(h, movedRel) } }),
    ]
    const cases: Case[] = [
      byEnv('go', 'GOMODCACHE', 'mod', 'modcache'),
      byEnv('go', 'GOPATH', 'gopath', 'modcache', 'gopath/pkg/mod'),
      byEnv('go', 'GOCACHE', 'build', 'buildcache'),
      [
        'go',
        'go env',
        (h) => ({
          programs: { go: (argv) => (argv[0] === 'env' ? { stdout: `${at(h, argv[1]!)}\n` } : {}) },
          moved: { modcache: at(h, 'GOMODCACHE'), buildcache: at(h, 'GOCACHE') },
        }),
      ],
      [
        'go',
        'GOMODCACHE in the config, over go env',
        (h) => ({
          vars: { GOMODCACHE: at(h, 'mod') },
          programs: { go: (argv) => (argv[0] === 'env' ? { stdout: `${at(h, 'env')}\n` } : {}) },
          moved: { modcache: at(h, 'mod'), buildcache: at(h, 'env') },
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
      byEnv('huggingface-hub', 'HF_HOME', 'hf', 'hub', 'hf/hub'),
      [
        'huggingface-hub',
        'HF_HUB_CACHE, over HF_HOME',
        (h) => ({
          env: { HF_HUB_CACHE: at(h, 'hub'), HF_HOME: at(h, 'hf') },
          moved: { hub: at(h, 'hub') },
        }),
      ],
      byEnv('huggingface-hub', 'HUGGINGFACE_HUB_CACHE', 'hub', 'hub'),
      byEnv('huggingface-hub', 'XDG_CACHE_HOME', 'xdg', 'hub', 'xdg/huggingface/hub'),
      [
        'maven',
        'LOCAL_REPOSITORY in the config',
        (h) => ({ vars: { LOCAL_REPOSITORY: at(h, 'm2') }, moved: { repository: at(h, 'm2') } }),
      ],
      byEnv('npm', 'npm_config_cache', 'npm', 'cache', 'npm/_cacache'),
      byEnv('npm', 'NPM_CONFIG_CACHE', 'npm', 'cache', 'npm/_cacache'),
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
      byEnv('pip', 'PIP_CACHE_DIR', 'pip', 'cache'),
      ['pnpm', 'pnpm store path', pnpmStorePath],
      byEnv('pnpm', 'npm_config_store_dir', 'store', 'store'),
      byEnv('pnpm', 'PNPM_HOME', 'pnpm', 'store', 'pnpm/store'),
      // As pnpm and Yarn Classic do, a set XDG folder wins over ~/Library on macOS.
      byEnv('pnpm', 'XDG_CACHE_HOME', 'xdg', 'cache', 'xdg/pnpm'),
      byEnv('pnpm', 'XDG_DATA_HOME', 'data', 'store', 'data/pnpm/store'),
      [
        'uv',
        'uv cache dir',
        (h) => ({
          programs: { uv: (argv) => (argv[1] === 'dir' ? { stdout: `${at(h, 'uv')}\n` } : {}) },
          moved: { cache: at(h, 'uv') },
        }),
      ],
      byEnv('uv', 'UV_CACHE_DIR', 'uv', 'cache'),
      [
        'uv',
        'cache-dir in uv.toml',
        (h) => ({
          files: { '.config/uv/uv.toml': `cache-dir = "${at(h, 'uv')}"\n` },
          moved: { cache: at(h, 'uv') },
        }),
      ],
      byEnv('uv', 'XDG_CACHE_HOME', 'xdg', 'cache', 'xdg/uv'),
      byEnv('yarn', 'YARN_CACHE_FOLDER', 'classic', 'classic'),
      byEnv('yarn', 'XDG_CACHE_HOME', 'xdg', 'classic', 'xdg/yarn'),
    ]
    // On Linux these follow the XDG folders; on macOS they sit in ~/Library.
    const linuxOnly: Case[] = [
      byEnv('go', 'XDG_CACHE_HOME', 'xdg', 'buildcache', 'xdg/go-build'),
      byEnv('pip', 'XDG_CACHE_HOME', 'xdg', 'cache', 'xdg/pip'),
    ]

    test.each(os === 'linux' ? [...cases, ...linuxOnly] : cases)(
      '%s follows %s, and leaves the default folder alone',
      async (name, _how, moves) => {
        const b = build(name, os, { moves })
        const s = await survey([b.plugin], CTX)
        expect(s.warnings).toEqual([])
        expect(s.objections.filter((o) => o.code === OUTSIDE_ROOTS)).toEqual([])
        expect(s.candidates.map((c) => c.path).sort()).toEqual(expectedPaths(b))
      },
    )

    test.skipIf(os !== 'macos')(
      "XDG_CACHE_HOME leaves go's and pip's caches in ~/Library",
      async () => {
        for (const name of ['go', 'pip'] as const) {
          const b = build(name, os, { moves: (h) => ({ env: { XDG_CACHE_HOME: at(h, 'xdg') } }) })
          const s = await survey([b.plugin], CTX)
          expect(s.candidates.map((c) => c.path).sort(), name).toEqual(expectedPaths(b))
        }
      },
    )

    test('a moved pnpm store is pruned where pnpm says it is', async () => {
      const b = build('pnpm', os, { moves: pnpmStorePath })
      const { receipt } = await surveyAndClean(b.plugin)
      expect(receipt.steps.map((st) => [st.id, st.result])).toEqual([
        [`pnpm:${b.folder('store')}`, 'ok'],
      ])
      expect(actions(b)).toEqual([['pnpm', 'store', 'prune', '--store-dir', b.folder('store')]])
    })
  })
})
