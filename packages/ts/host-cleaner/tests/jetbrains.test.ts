/** The `jetbrains` plugin against a made-up home: version folders, installs, recent projects and processes. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ProcessHolder, ProcessProbe } from '@osdlc/repo-cleaner'
import { z } from 'zod'

import {
  JETBRAINS_PLUGIN,
  PLUGIN_API,
  clean,
  definePlugin,
  jetbrainsPlugin,
  plan,
  pluginKit,
  survey,
  type Ctx,
  type JetbrainsOptions,
  type Plugin,
} from '../src/index.ts'
import { javaHashHex } from '../src/jetbrains.ts'
import { contractSuite, fakeContext, tempHome, type TempHome } from '../src/testing.ts'

const NOW = new Date('2026-11-19T12:00:00Z')
const HOUR = 3_600_000
const ago = (hours: number): Date => new Date(NOW.getTime() - hours * HOUR)

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function home(): TempHome {
  const h = tempHome('host-cleaner-jb-')
  cleanups.push(h.cleanup)
  return h
}

function put(path: string, hoursOld = 48, body = 'x'.repeat(100)): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  utimesSync(path, ago(hoursOld), ago(hoursOld))
}

const caches = (h: TempHome): string => join(h.home, 'Library', 'Caches', 'JetBrains')
const logs = (h: TempHome): string => join(h.home, 'Library', 'Logs', 'JetBrains')
const config = (h: TempHome): string => join(h.home, 'Library', 'Application Support', 'JetBrains')
const apps = (h: TempHome): string => join(h.home, 'Applications')

/** An app bundle in the home's `Applications`, for the version folder `version`. */
function install(h: TempHome, app: string, version: string, launcher = 'rustrover'): string {
  const bundle = join(apps(h), `${app}.app`)
  put(
    join(bundle, 'Contents', 'Resources', 'product-info.json'),
    48,
    JSON.stringify({
      name: app,
      dataDirectoryName: version,
      launch: [{ os: 'macOS', launcherPath: `../MacOS/${launcher}` }],
    }),
  )
  return bundle
}

/** A version folder with a file in both roots. */
function version(h: TempHome, name: string, hoursOld = 48): void {
  put(join(caches(h), name, 'caches', 'names.dat'), hoursOld)
  put(join(logs(h), name, 'idea.log'), hoursOld)
}

/** Two RustRover versions, the newer one installed, beside folders that are no version. */
function twoVersions(): TempHome {
  const h = home()
  install(h, 'RustRover', 'RustRover2026.1')
  version(h, 'RustRover2025.1')
  version(h, 'RustRover2026.1')
  put(join(caches(h), 'Toolbox', 'download', 'x'))
  put(join(caches(h), 'Daemon', 'x'))
  // A file among the applications is not an install, and does not stop the look.
  put(join(apps(h), '.DS_Store'))
  return h
}

const probeOf = (holders: ProcessHolder[] | Error = []): ProcessProbe => ({
  alive: () => true,
  holders: () => {
    if (holders instanceof Error) throw holders
    return holders
  },
})

interface Make {
  idleHours?: number
  probe?: ProcessProbe
  options?: JetbrainsOptions
}

/** The plugin on `h`, built through `definePlugin` as a plugin author's would be, so the core binds its kit. */
function make(h: TempHome, over: Make = {}): Plugin {
  const def = definePlugin({
    name: JETBRAINS_PLUGIN,
    api: PLUGIN_API,
    settings: z.strictObject({}),
    create: ({ kit, env }) =>
      jetbrainsPlugin(
        {
          env,
          platform: 'darwin',
          apps: [apps(h)],
          idleHours: over.idleHours ?? 24,
          ...over.options,
        },
        kit,
      ),
  })
  return def.create({
    settings: {},
    only: [],
    env: h.env,
    kit: pluginKit(JETBRAINS_PLUGIN, { now: () => NOW, probe: over.probe ?? probeOf() }),
  })
}

const ctx = (): Ctx => fakeContext({ cwd: '/' })

const ids = (cs: ReadonlyArray<{ id: string }>): string[] => cs.map((c) => c.id).sort()

describe('version folders', () => {
  test('with two versions and one installed, the other is proposed in both roots', async () => {
    const h = twoVersions()
    const s = await survey([make(h)], ctx())
    expect(s.warnings).toEqual([])
    expect(ids(s.candidates)).toEqual([
      `ide-version:${join(caches(h), 'RustRover2025.1')}`,
      `ide-version:${join(logs(h), 'RustRover2025.1')}`,
    ])
    const c = s.candidates.find((x) => x.path === join(caches(h), 'RustRover2025.1'))!
    expect(c).toMatchObject({
      kind: 'ide-version',
      owner: 'jetbrains',
      name: 'RustRover2025.1',
      costDescription: 'rebuild',
      evidence: { kind: 'ide-version', version: 'RustRover2025.1' },
    })
    expect(c.why).toBe(
      'no installed IDE uses RustRover2025.1; unchanged for 48 hours (threshold 24)',
    )
    expect(c.held).toBeUndefined()
    expect(c.bytes).toBeGreaterThan(0)
    expect(s.objections).toEqual([])
  })

  test('clean removes the uninstalled version and leaves the installed one and the rest', async () => {
    const h = twoVersions()
    const plugin = make(h)
    const receipt = await clean(plan(await survey([plugin], ctx())), [plugin], ctx())
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => s.result)).toEqual(['ok', 'ok'])
    expect(existsSync(join(caches(h), 'RustRover2025.1'))).toBe(false)
    expect(existsSync(join(logs(h), 'RustRover2025.1'))).toBe(false)
    for (const kept of ['RustRover2026.1', 'Toolbox', 'Daemon']) {
      expect(existsSync(join(caches(h), kept))).toBe(true)
    }
  })

  test('one changed within idleHours is held', async () => {
    const h = home()
    install(h, 'RustRover', 'RustRover2026.1')
    version(h, 'RustRover2025.1', 2)
    const [c] = (await survey([make(h)], ctx())).candidates
    expect(c).toMatchObject({ held: true })
    expect(c!.why).toContain('unchanged for 2 hours (threshold 24)')
    expect((await survey([make(h, { idleHours: 1 })], ctx())).candidates[0]!.held).toBeUndefined()
  })

  test('an install the Toolbox lists outside the application folders counts; a record of a gone one does not', async () => {
    const h = home()
    version(h, 'WebStorm2025.1')
    version(h, 'CLion2025.1')
    const elsewhere = join(h.home, 'tools', 'WebStorm.app')
    put(
      join(elsewhere, 'Contents', 'Resources', 'product-info.json'),
      48,
      JSON.stringify({ dataDirectoryName: 'WebStorm2025.1' }),
    )
    put(
      join(config(h), 'Toolbox', 'state.json'),
      48,
      JSON.stringify({
        tools: [
          { toolId: 'WebStorm', installLocation: elsewhere },
          { toolId: 'CLion', installLocation: join(h.home, 'gone', 'CLion.app') },
        ],
      }),
    )
    const s = await survey([make(h)], ctx())
    expect(ids(s.candidates)).toEqual([
      `ide-version:${join(caches(h), 'CLion2025.1')}`,
      `ide-version:${join(logs(h), 'CLion2025.1')}`,
    ])
    expect(s.objections).toEqual([])
  })

  test('an app bundle reached through a link is an install', async () => {
    const h = home()
    version(h, 'PyCharm2025.1')
    const real = install(h, 'PyCharm', 'PyCharm2025.1', 'pycharm')
    const moved = join(h.home, 'elsewhere', 'PyCharm.app')
    mkdirSync(dirname(moved))
    renameSync(real, moved)
    symlinkSync(moved, real)
    expect((await survey([make(h)], ctx())).candidates).toEqual([])
  })

  test('a Toolbox state or product-info.json that cannot be read refuses every version folder', async () => {
    const h = twoVersions()
    put(join(config(h), 'Toolbox', 'state.json'), 48, '{ not json')
    const s = await survey([make(h)], ctx())
    expect(s.candidates).toHaveLength(2)
    expect(s.objections).toEqual([
      expect.objectContaining({ level: 'refuse', code: 'installs-unreadable' }),
      expect.objectContaining({ level: 'refuse', code: 'installs-unreadable' }),
    ])

    const other = twoVersions()
    put(join(apps(other), 'Broken.app', 'Contents', 'Resources', 'product-info.json'), 48, '{')
    const again = await survey([make(other)], ctx())
    expect(again.objections.map((o) => o.code)).toEqual([
      'installs-unreadable',
      'installs-unreadable',
    ])
    expect(again.objections[0]!.reason).toContain('Broken.app')
  })

  test('the product running refuses its folders; the process table unread refuses too', async () => {
    const h = twoVersions()
    const busy = await survey(
      [make(h, { probe: probeOf([{ pid: 7, command: 'rustrover' }]) })],
      ctx(),
    )
    expect(busy.objections).toEqual([
      expect.objectContaining({
        code: 'live-process',
        reason: 'RustRover is running: rustrover (pid 7)',
      }),
      expect.objectContaining({ code: 'live-process' }),
    ])
    const other = await survey(
      [make(h, { probe: probeOf([{ pid: 8, command: 'webstorm' }]) })],
      ctx(),
    )
    expect(other.objections).toEqual([])
    const unread = await survey([make(h, { probe: probeOf(new Error('lsof failed')) })], ctx())
    expect(unread.objections.map((o) => o.code)).toEqual([
      'process-table-unreadable',
      'process-table-unreadable',
    ])
  })

  test('with no install at all, a product the table does not know is watched by its lowercased name', async () => {
    const h = home()
    version(h, 'Fleetish2025.1')
    const s = await survey([make(h, { probe: probeOf([{ pid: 9, command: 'fleetish' }]) })], ctx())
    expect(s.objections.map((o) => o.code)).toEqual(['live-process', 'live-process'])
  })
})

/** An installed version whose recent projects are `live` (there) and `gone` (not). */
function withProjects(): { h: TempHome; projects: string; live: string; gone: string } {
  const h = home()
  install(h, 'RustRover', 'RustRover2026.1')
  version(h, 'RustRover2026.1')
  const live = join(h.home, 'dev', 'live')
  const gone = join(h.home, 'dev', 'old.app', 'gone')
  mkdirSync(live, { recursive: true })
  put(
    join(config(h), 'RustRover2026.1', 'options', 'recentProjects.xml'),
    48,
    [
      '<application><component name="RecentProjectsManager"><option name="additionalInfo"><map>',
      '<entry key="$USER_HOME$/dev/live"><value /></entry>',
      `<entry key="${gone}"><value /></entry>`,
      '</map></option></component></application>',
    ].join('\n'),
  )
  const projects = join(caches(h), 'RustRover2026.1', 'projects')
  put(join(projects, `live.${javaHashHex(live)}`, 'cache-state.xml'))
  put(join(projects, `gone.${javaHashHex(gone)}`, 'cache-state.xml'), 1)
  put(join(projects, 'light-edit.2de7021a', 'x'))
  put(join(projects, 'unknown.12345678', 'x'))
  return { h, projects, live, gone }
}

describe('project caches', () => {
  test("a project cache's hash is Java's hashCode of the project's path", () => {
    expect(javaHashHex('/Users/sksizer2/dev/repos/sksizer/cities')).toBe('bddd74e7')
  })

  test('inside an installed version, only the cache of a gone recent project is proposed', async () => {
    const { h, projects, gone } = withProjects()
    const s = await survey([make(h)], ctx())
    const path = join(projects, `gone.${javaHashHex(gone)}`)
    expect(s.candidates).toEqual([
      expect.objectContaining({
        id: `project-cache:${path}`,
        kind: 'project-cache',
        costDescription: 'rebuild',
        why: `RustRover2026.1's cache for ${gone}, which is gone`,
        evidence: { kind: 'project-cache', path, version: 'RustRover2026.1', project: gone },
      }),
    ])
    expect(s.candidates[0]!.held).toBeUndefined()

    const receipt = await clean(plan(s), [make(h)], ctx())
    expect(receipt.steps.map((x) => x.result)).toEqual(['ok'])
    expect(existsSync(path)).toBe(false)
    expect(existsSync(join(projects, 'unknown.12345678'))).toBe(true)
  })

  test('a project on a volume that is not mounted is not known to be gone', async () => {
    const { h, projects } = withProjects()
    const offline = '/Volumes/host-cleaner-not-mounted/proj'
    const xml = join(config(h), 'RustRover2026.1', 'options', 'recentProjects.xml')
    writeFileSync(xml, `<map><entry key="${offline}" /></map>`)
    put(join(projects, `proj.${javaHashHex(offline)}`, 'x'))
    expect((await survey([make(h)], ctx())).candidates).toEqual([])
  })
})

describe('refusing a folder outside', () => {
  test('a candidate moved outside behind a symlink is refused by delete and left as it was', async () => {
    const h = twoVersions()
    const plugin = make(h)
    const s = await survey([plugin], ctx())
    const c = s.candidates.find((x) => x.path === join(caches(h), 'RustRover2025.1'))!
    const outside = join(home().home, 'moved')
    renameSync(c.path!, outside)
    symlinkSync(outside, c.path!)

    await expect((async () => plugin.delete!(c, ctx()))()).rejects.toThrow(
      'is no longer a candidate',
    )
    expect(readFileSync(join(outside, 'caches', 'names.dat'), 'utf8')).toBe('x'.repeat(100))

    const receipt = await clean(plan(s), [plugin], ctx())
    expect(existsSync(join(outside, 'caches', 'names.dat'))).toBe(true)
    expect(receipt.dropped).toEqual(expect.arrayContaining([expect.objectContaining({ id: c.id })]))
  })

  test('a projects folder that is a link out of the version is not looked into', async () => {
    const { h, projects } = withProjects()
    const outside = join(home().home, 'projects')
    renameSync(projects, outside)
    symlinkSync(outside, projects)
    expect((await survey([make(h)], ctx())).candidates).toEqual([])
  })
})

describe('detection and roots', () => {
  test('without a JetBrains cache or log folder it drops out', async () => {
    const h = home()
    install(h, 'RustRover', 'RustRover2026.1')
    expect((await survey([make(h)], ctx())).plugins).toEqual([])
  })

  test('on Linux the root is the XDG cache folder, and Toolbox apps are installs', async () => {
    const h = home()
    const cache = join(h.home, 'xdg-cache')
    put(join(cache, 'JetBrains', 'GoLand2025.1', 'x'))
    put(join(cache, 'JetBrains', 'GoLand2024.3', 'x'))
    put(
      join(
        h.home,
        '.local',
        'share',
        'JetBrains',
        'Toolbox',
        'apps',
        'goland',
        'product-info.json',
      ),
      48,
      JSON.stringify({
        dataDirectoryName: 'GoLand2025.1',
        launch: [{ launcherPath: 'bin/goland' }],
      }),
    )
    const plugin = make(h, {
      options: {
        platform: 'linux',
        apps: undefined,
        env: { HOME: h.home, XDG_CACHE_HOME: cache },
      },
    })
    const s = await survey([plugin], ctx())
    expect(s.roots).toEqual({ jetbrains: [join(cache, 'JetBrains')] })
    expect(ids(s.candidates)).toEqual([`ide-version:${join(cache, 'JetBrains', 'GoLand2024.3')}`])
  })

  test('on another platform it has no roots and drops out', async () => {
    const h = twoVersions()
    const s = await survey([make(h, { options: { platform: 'win32' } })], ctx())
    expect(s.plugins).toEqual([])
  })
})

describe('the contract suite', () => {
  test('jetbrains keeps the contract, with a version folder and a project cache', async () => {
    const h = twoVersions()
    const gone = join(h.home, 'dev', 'gone')
    put(
      join(config(h), 'RustRover2026.1', 'options', 'recentProjects.xml'),
      48,
      `<map><entry key="${gone}" /></map>`,
    )
    put(join(caches(h), 'RustRover2026.1', 'projects', `gone.${javaHashHex(gone)}`, 'x'))
    expect(await contractSuite(make(h), ctx())).toEqual([])
    expect(existsSync(join(caches(h), 'RustRover2025.1'))).toBe(true)
  })

  test('jetbrains imports nothing private of host-cleaner', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'jetbrains.ts')
    const imports = [
      ...readFileSync(src, 'utf8').matchAll(/^(?:import|\}) .*from '([^']+)'$/gm),
    ].map((m) => m[1]!)
    expect(imports.filter((i) => i.startsWith('.')).sort()).toEqual(['./kit.ts', './types.ts'])
    expect(imports.filter((i) => i.startsWith('@osdlc/'))).toEqual([])
  })
})
