/**
 * The `jetbrains` plugin: the cache and log folders of IDE versions no longer
 * installed, and, inside an installed version, the caches of projects that
 * are gone. Both are rebuilt by the IDE when needed (`costDescription: rebuild`).
 *
 * Roots: `~/Library/Caches/JetBrains` and `~/Library/Logs/JetBrains` on macOS,
 * `~/.cache/JetBrains` on Linux. A version folder is `<Product><year>.<n>`,
 * such as `RustRover2026.1`; other folders there are never touched.
 *
 * An install is known by the `dataDirectoryName` in its `product-info.json`,
 * found through the Toolbox's `state.json` and in the application folders. A
 * version folder no install names is a candidate, held until it has sat
 * unchanged for `idleHours`, in case an install sits somewhere not looked in.
 * A record that is there but cannot be read refuses every version folder.
 *
 * A project's cache is `projects/<name>.<hash>`, the hash being Java's
 * `String.hashCode` of the project's path in hex. Its path is found among the
 * version's recent projects (`options/recentProjects.xml` in its config
 * folder); a cache whose hash matches none is left alone.
 *
 * A running process of the product refuses its candidates (`live-process`).
 * Settings: `plugins.jetbrains.idleHours` (default {@link DEFAULT_IDLE_HOURS}).
 */

import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, sep } from 'node:path'

import { z } from 'zod'

import { DEFAULT_IDLE_HOURS, attachKit, idleHoursSetting, type Kit } from './kit.ts'
import {
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type Ctx,
  type Objection,
  type Plugin,
} from './types.ts'

export const JETBRAINS_PLUGIN = 'jetbrains'

/** A version folder: the product, then the version, as in `IntelliJIdea2025.1`. */
const VERSION_DIR = /^([A-Za-z]+)(\d{4}\.\d+)$/

/** A project's cache folder: its name, a dot and the hash of its path. */
const PROJECT_DIR = /^(.+)\.([0-9a-f]{1,8})$/

/** The launcher each product runs as, for a version no install describes. */
const LAUNCHERS: Readonly<Record<string, string>> = {
  AppCode: 'appcode',
  Aqua: 'aqua',
  CLion: 'clion',
  DataGrip: 'datagrip',
  DataSpell: 'dataspell',
  GoLand: 'goland',
  IdeaIC: 'idea',
  IntelliJIdea: 'idea',
  JetBrainsGateway: 'gateway',
  PhpStorm: 'phpstorm',
  PyCharm: 'pycharm',
  PyCharmCE: 'pycharm',
  Rider: 'rider',
  RubyMine: 'rubymine',
  RustRover: 'rustrover',
  WebStorm: 'webstorm',
  Writerside: 'writerside',
}

/** The folders volumes are mounted under, which {@link gone} treats apart. */
const MOUNT_PARENTS = ['/Volumes', '/mnt', '/media', '/run/media']

const DISCOVER_LIMIT_MS = 10 * 60_000

export interface JetbrainsOptions {
  /** Idle hours before a version folder is a candidate (default {@link DEFAULT_IDLE_HOURS}). */
  idleHours?: number | undefined
  /** The environment `HOME` and the XDG folders are read from. Default: this process's. */
  env?: Readonly<Record<string, string | undefined>> | undefined
  /** Default: this process's. Only `darwin` and `linux` have roots. */
  platform?: NodeJS.Platform | undefined
  /** Folders whose entries are looked at as installs. Default: the platform's application folders. */
  apps?: readonly string[] | undefined
}

/** Where the plugin looks, for one home and platform. */
interface Layout {
  /** The home `$USER_HOME$` in recent projects stands for. */
  home: string
  /** The roots: cache and log folders holding version folders. */
  roots: string[]
  /** The folder holding each version's config, with its recent projects. */
  config: string
  /** The Toolbox's `state.json`. */
  toolbox: string
  apps: readonly string[]
}

function layoutOf(opts: JetbrainsOptions): Layout {
  const env = opts.env ?? process.env
  const home = env.HOME ?? homedir()
  const platform = opts.platform ?? process.platform
  if (platform === 'darwin') {
    const lib = join(home, 'Library')
    const config = join(lib, 'Application Support', 'JetBrains')
    return {
      home,
      roots: [join(lib, 'Caches', 'JetBrains'), join(lib, 'Logs', 'JetBrains')],
      config,
      toolbox: join(config, 'Toolbox', 'state.json'),
      apps: opts.apps ?? ['/Applications', join(home, 'Applications')],
    }
  }
  if (platform === 'linux') {
    const xdg = (name: string, rel: string): string => {
      const v = env[name]
      return v !== undefined && isAbsolute(v) ? v : join(home, rel)
    }
    const data = join(xdg('XDG_DATA_HOME', '.local/share'), 'JetBrains', 'Toolbox')
    return {
      home,
      roots: [join(xdg('XDG_CACHE_HOME', '.cache'), 'JetBrains')],
      config: join(xdg('XDG_CONFIG_HOME', '.config'), 'JetBrains'),
      toolbox: join(data, 'state.json'),
      apps: opts.apps ?? [
        join(data, 'apps'),
        '/opt',
        '/usr/local',
        '/usr/share',
        '/snap',
        join(home, 'opt'),
        join(home, '.local', 'share'),
        join(home, 'Applications'),
      ],
    }
  }
  return { home, roots: [], config: '', toolbox: '', apps: [] }
}

/** True when `path` exists as itself, a link counted as present. One that cannot be checked counts as present, so it is never taken as gone. */
function present(path: string): boolean {
  return exists(path) !== false
}

/** Whether `path` exists as itself, a link counted as present; `unknown` when it cannot be checked. */
function exists(path: string): boolean | 'unknown' {
  try {
    return lstatSync(path, { throwIfNoEntry: false }) !== undefined
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOTDIR' ? false : 'unknown'
  }
}

/** The device `path` is on, links followed; undefined when it cannot be checked. */
function deviceOf(path: string): number | undefined {
  try {
    return statSync(path).dev
  } catch {
    return undefined
  }
}

/** True when `path` is a folder itself, not a link to one; false when it cannot be checked. */
function isDir(path: string): boolean {
  try {
    return lstatSync(path, { throwIfNoEntry: false })?.isDirectory() === true
  } catch {
    return false
  }
}

/** The folders in `dir`, by name; a link is not a folder. None when it cannot be read. */
function folders(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Java's `String.hashCode` of `s`, in unpadded hex, as JetBrains names a project's cache. */
export function javaHashHex(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

/** What the installs say: the version folders in use, each product's launchers, and records that could not be read. */
interface Installs {
  versions: Set<string>
  launchers: Map<string, Set<string>>
  problems: string[]
}

/**
 * The installs in `layout`. A `product-info.json` that is missing means no
 * install; one that is there and cannot be read, or a Toolbox install whose
 * folder has none or names no version folder, is a problem, since an install
 * may be missed. In the application folders, an entry that cannot be looked
 * into, or whose `product-info.json` names no version folder, is some other
 * app and is passed over.
 */
function installsOf(layout: Layout): Installs {
  const found: Installs = { versions: new Set(), launchers: new Map(), problems: [] }
  const read = (dir: string, toolbox: boolean): void => {
    let file: string | undefined
    for (const f of [
      join(dir, 'Contents', 'Resources', 'product-info.json'),
      join(dir, 'product-info.json'),
      // A snap: `/snap/<name>/current`.
      join(dir, 'current', 'product-info.json'),
    ]) {
      const there = exists(f)
      if (there === 'unknown' && toolbox) {
        found.problems.push(`${f} could not be checked`)
        return
      }
      if (there === true) {
        file = f
        break
      }
    }
    if (file === undefined) {
      if (toolbox) {
        found.problems.push(`the Toolbox installed ${dir}, which has no product-info.json`)
      }
      return
    }
    let info: unknown
    try {
      info = JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
      found.problems.push(
        `${file} could not be read: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
    const name = isObject(info) ? info.dataDirectoryName : undefined
    const m = typeof name === 'string' ? VERSION_DIR.exec(name) : null
    if (!isObject(info) || m === null) {
      if (toolbox) found.problems.push(`${file} names no version folder`)
      return
    }
    found.versions.add(m[0])
    const product = m[1]!
    const names = found.launchers.get(product) ?? new Set<string>()
    for (const l of Array.isArray(info.launch) ? info.launch : []) {
      const path = isObject(l) ? l.launcherPath : undefined
      if (typeof path === 'string' && path !== '') names.add(basename(path).replace(/\.sh$/, ''))
    }
    if (names.size > 0) found.launchers.set(product, names)
  }
  if (present(layout.toolbox)) {
    let state: unknown
    try {
      state = JSON.parse(readFileSync(layout.toolbox, 'utf8'))
    } catch {
      state = null
    }
    if (!isObject(state) || !Array.isArray(state.tools)) {
      found.problems.push(`${layout.toolbox} could not be read as the Toolbox's state`)
    } else {
      for (const tool of state.tools) {
        const where = isObject(tool) ? tool.installLocation : undefined
        if (typeof where !== 'string' || !isAbsolute(where) || !present(where)) continue
        read(where, true)
      }
    }
  }
  // Links followed: an install reached through a link is still an install.
  for (const apps of layout.apps) {
    let names: string[]
    try {
      names = readdirSync(apps)
    } catch {
      continue
    }
    for (const name of names) read(join(apps, name), false)
  }
  return found
}

const unescapeXml = (s: string): string =>
  s
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

/** The absolute paths named in a version's `recentProjects.xml`, `$USER_HOME$` expanded; none when it cannot be read. */
function recentProjects(file: string, home: string): string[] {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const out = new Set<string>()
  for (const m of text.matchAll(/\b(?:key|value)="([^"]*)"/g)) {
    const path = unescapeXml(m[1]!)
      .replace(/^\$USER_HOME\$/, home)
      .replace(/\/+$/, '')
    if (isAbsolute(path)) out.add(path)
  }
  return [...out]
}

/** How {@link gone} looks at the disk. */
export interface DiskProbe {
  present: (path: string) => boolean
  device: (path: string) => number | undefined
}

const DISK: DiskProbe = { present, device: deviceOf }

/**
 * Whether `path` is gone from a volume that is there. A missing one under a
 * mount folder ({@link MOUNT_PARENTS}) is gone only when
 * its nearest existing folder there is on a device of its own, a volume that
 * is mounted: an unmounted volume may leave its empty mount point behind.
 */
export function gone(path: string, disk: DiskProbe = DISK): boolean {
  if (disk.present(path)) return false
  let dir = dirname(path)
  while (!disk.present(dir)) dir = dirname(dir)
  if (dir === dirname(dir)) return false
  const mounts = MOUNT_PARENTS.find((m) => dir === m || dir.startsWith(m + '/'))
  if (mounts === undefined) return true
  if (dir === mounts) return false
  const here = disk.device(dir)
  const under = disk.device(mounts)
  return here !== undefined && under !== undefined && here !== under
}

/** One folder that may be a candidate, before anything is measured. */
interface Found {
  kind: 'ide-version' | 'project-cache'
  path: string
  /** The version folder's name, such as `RustRover2026.1`. */
  version: string
  product: string
  /** For a project cache: the gone project's path. */
  project?: string
}

/** The version folders no install uses, and the caches of gone projects inside the installed ones; with `only`, just the version folder holding it. */
function scan(layout: Layout, installs: Installs, only?: string): Found[] {
  const out: Found[] = []
  for (const root of layout.roots) {
    for (const version of folders(root)) {
      const m = VERSION_DIR.exec(version)
      if (m === null) continue
      const product = m[1]!
      const path = join(root, version)
      if (only !== undefined && only !== path && !only.startsWith(path + sep)) continue
      if (!installs.versions.has(version)) {
        out.push({ kind: 'ide-version', path, version, product })
        continue
      }
      const projects = join(path, 'projects')
      if (!isDir(projects)) continue
      const known = recentProjects(
        join(layout.config, version, 'options', 'recentProjects.xml'),
        layout.home,
      )
      const byHash = new Map<string, string[]>()
      for (const p of known) {
        const hash = javaHashHex(p)
        const paths = byHash.get(hash)
        if (paths === undefined) byHash.set(hash, [p])
        else paths.push(p)
      }
      for (const name of folders(projects)) {
        const hash = PROJECT_DIR.exec(name)?.[2]
        const paths = hash === undefined ? undefined : byHash.get(hash)
        if (paths === undefined || !paths.every(gone)) continue
        out.push({
          kind: 'project-cache',
          path: join(projects, name),
          version,
          product,
          project: paths[0]!,
        })
      }
    }
  }
  return out
}

/** A candidate and the refusals its owner adds to it. */
interface Row {
  candidate: Candidate
  blockers: Array<{ code: string; reason: string }>
}

/** What one hook call works with. */
interface Env {
  kit: Kit
  idleHours: number
  ctx: Ctx
  installs: Installs
  /** What {@link runningOf} found for each product this hook call. */
  running: Map<string, Row['blockers']>
}

/** `hours` in tenths rounded down, so a sentence never says more than was measured. */
const hoursText = (hours: number): string => String(Math.floor(hours * 10) / 10)

/** The refusals `product`'s running processes add, looked up once per hook call. */
function runningOf(env: Env, product: string): Row['blockers'] {
  const cached = env.running.get(product)
  if (cached !== undefined) return cached
  const blockers: Row['blockers'] = []
  const names = new Set(env.installs.launchers.get(product))
  const fixed = LAUNCHERS[product]
  if (fixed !== undefined) names.add(fixed)
  if (names.size === 0) names.add(product.toLowerCase())
  const running = new Set<string>()
  // A Linux `.sh` launcher runs `java -Djb.vmOptionsFile=.../bin/<name>64.vmoptions ...`.
  for (const name of [...names].flatMap((n) => [n, `${n}64`]).sort()) {
    const r = env.kit.running({ name }, env.ctx)
    for (const n of r.names) running.add(n)
    if (r.unknown !== undefined) {
      blockers.push({
        code: 'process-table-unreadable',
        reason: `process table unreadable: ${r.unknown}`,
      })
      break
    }
  }
  if (running.size > 0) {
    blockers.push({
      code: 'live-process',
      reason: `${product} is running: ${[...running].join(', ')}`,
    })
  }
  env.running.set(product, blockers)
  return blockers
}

/** The row for `f`, measured now, its size only when `sized`; null when its folder cannot be read. */
function rowOf(env: Env, f: Found, sized = true): Row | null {
  const { kit, idleHours, installs } = env
  const blockers = [...runningOf(env, f.product)]

  let why: string
  let held = false
  let unmeasured = false
  if (f.kind === 'ide-version') {
    for (const p of installs.problems) blockers.push({ code: 'installs-unreadable', reason: p })
    let since
    try {
      since = kit.idle(f.path)
    } catch {
      // A folder that cannot be read may hide recent use.
      return null
    }
    if (since.unmeasured) {
      unmeasured = true
      why = `no installed IDE uses ${f.version}; when it was last used could not be measured in the time budget`
    } else {
      held = since.hours !== null && since.hours < idleHours
      why =
        since.hours === null
          ? `no installed IDE uses ${f.version}, and it holds no file`
          : `no installed IDE uses ${f.version}; unchanged for ${hoursText(since.hours)} hours (threshold ${idleHours})`
    }
  } else {
    why = `${f.version}'s cache for ${f.project}, which is gone`
  }
  const bytes = unmeasured || !sized ? null : kit.size(f.path)
  return {
    blockers,
    candidate: kit.candidate({
      kind: f.kind,
      path: f.path,
      name: basename(f.path),
      why,
      costDescription: 'rebuild',
      ...(bytes === null ? {} : { bytes }),
      ...(held ? { held: true } : {}),
      ...(unmeasured ? { unmeasured: true } : {}),
      evidence: {
        kind: f.kind,
        path: f.path,
        version: f.version,
        ...(f.project === undefined ? {} : { project: f.project }),
        // A version used again since the plan then reads as changed, picked or not.
        ...(held ? { recent: true } : {}),
      },
    }),
  }
}

/** The `jetbrains` plugin on `kit`: caches of uninstalled IDE versions and of gone projects. */
export function jetbrainsPlugin(opts: JetbrainsOptions, kit: Kit): Plugin {
  const layout = layoutOf(opts)
  const idle = opts.idleHours
  const idleHours =
    idle !== undefined && Number.isFinite(idle) && idle >= 0 ? idle : DEFAULT_IDLE_HOURS
  const envOf = (ctx: Ctx): Env => ({
    kit,
    ctx,
    idleHours,
    installs: installsOf(layout),
    running: new Map(),
  })
  let rows = new Map<string, Row>()
  const plugin: Plugin = {
    name: JETBRAINS_PLUGIN,
    limits: { discover: DISCOVER_LIMIT_MS },
    detect: () => layout.roots.some(isDir),
    roots: () => layout.roots,
    discover(ctx) {
      const env = envOf(ctx)
      const found = scan(layout, env.installs).flatMap((f) => rowOf(env, f) ?? [])
      rows = new Map(found.map((r) => [r.candidate.id, r]))
      return found.map((r) => r.candidate)
    },
    object: (all) =>
      all.flatMap((c): Objection[] => {
        const row = rows.get(c.id)
        if (c.owner !== JETBRAINS_PLUGIN || row === undefined) return []
        return row.blockers.map((b) => ({
          by: JETBRAINS_PLUGIN,
          candidate: c.id,
          level: 'refuse',
          code: b.code,
          reason: b.reason,
        }))
      }),
    delete(c, ctx) {
      if (c.path === undefined) throw new Error(`${c.id} is not a folder`)
      if (!present(c.path)) return `already gone: ${c.path}`
      // Found and measured again, so an install, a project or a process that came back since the plan is seen.
      const env = envOf(ctx)
      const f = scan(layout, env.installs, c.path).find(
        (x) => x.path === c.path && x.kind === c.kind,
      )
      const now = f === undefined ? null : rowOf(env, f, false)
      if (now === null) throw new Error(`${c.path} is no longer a candidate`)
      if (now.blockers.length > 0) {
        throw new Error(`${c.path} is refused: ${now.blockers.map((b) => b.reason).join(', ')}`)
      }
      // `c` is the candidate the re-check just made; its `held` is set only when it was held then.
      if (now.candidate.held === true && c.held !== true) {
        throw new Error(`${c.path} was used within the last ${idleHours} hours`)
      }
      return kit.remove(c.path, ctx)
    },
  }
  // Built without `definePlugin` when called directly, so tie the kit here too.
  attachKit(plugin, kit)
  return plugin
}

/** The `jetbrains` plugin as the command line builds it. */
export const jetbrainsDefinition = definePlugin({
  name: JETBRAINS_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({ idleHours: idleHoursSetting }),
  create: ({ settings, kit, env }) => jetbrainsPlugin({ idleHours: settings.idleHours, env }, kit),
})
