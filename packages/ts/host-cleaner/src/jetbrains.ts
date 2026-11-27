/**
 * The `jetbrains` plugin: the cache and log folders of IDE versions no longer
 * installed, and, inside an installed version, the caches of projects that
 * are gone. Caches are rebuilt by the IDE when needed (`costDescription: rebuild`);
 * the macOS log folders are not (`lost`), so they wait for a pick.
 *
 * Roots: `~/Library/Caches/JetBrains` and `~/Library/Logs/JetBrains` on macOS,
 * `~/.cache/JetBrains` on Linux. A version folder is `<Product><year>.<n>`,
 * such as `RustRover2026.1`; other folders there are never touched.
 *
 * An install is known by the `dataDirectoryName` in its `product-info.json`,
 * found through the Toolbox's `state.json`, in the application folders (on
 * Linux the home too) and through `jetbrains-*.desktop` entries. A
 * version folder no install names is a candidate, held until it has sat
 * unchanged for `idleHours`, in case an install sits somewhere not looked in.
 * A record that is there but cannot be read refuses every version folder.
 *
 * A project's cache is `projects/<name>.<hash>`, the hash being Java's
 * `String.hashCode` of the project's path in hex. Its path is found among the
 * version's recent projects (`options/recentProjects.xml` in its config
 * folder); a cache whose hash matches none is left alone. One whose project
 * is gone is held the same way, as the project may be back soon.
 *
 * A running process of the product refuses its candidates (`live-process`).
 * Settings: `plugins.jetbrains.idleHours` (default {@link DEFAULT_IDLE_HOURS}).
 */

import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, sep } from 'node:path'

import { z } from 'zod'

import {
  DISCOVER_LIMIT_MS,
  checkAgain,
  errorText,
  homeFrom,
  hoursText,
  isObject,
  objectionsTo,
  type Row,
  yieldToLimit,
} from './helpers.ts'
import { attachKit, idleHoursOr, idleHoursSetting, present, type Kit } from './kit.ts'
import { PLUGIN_API, builtIn, definePlugin, type Ctx, type Plugin } from './types.ts'

export const JETBRAINS_PLUGIN = 'jetbrains'

/** A version folder: the product, then the version, as in `IntelliJIdea2025.1`. */
const VERSION_DIR = /^([A-Za-z]+)(\d{4}\.\d+)$/

/** A project's cache folder: its name, a dot and the hash of its path. */
const PROJECT_DIR = /^(.+)\.([0-9a-f]{1,8})$/

/** The launchers each product runs as, for a version no install describes. */
const LAUNCHERS: Readonly<Record<string, readonly string[]>> = {
  AppCode: ['appcode'],
  Aqua: ['aqua'],
  CLion: ['clion'],
  DataGrip: ['datagrip'],
  DataSpell: ['dataspell'],
  GoLand: ['goland'],
  IdeaIC: ['idea'],
  IntelliJIdea: ['idea'],
  // Its distribution sits under the caches, so no install names it; the Gateway starts whichever of these it has.
  JetBrainsClient: ['jetbrains_client', 'cwm_guest', 'intellij_client'],
  JetBrainsGateway: ['gateway'],
  PhpStorm: ['phpstorm'],
  PyCharm: ['pycharm'],
  PyCharmCE: ['pycharm'],
  Rider: ['rider'],
  RubyMine: ['rubymine'],
  RustRover: ['rustrover'],
  WebStorm: ['webstorm'],
  Writerside: ['writerside'],
}

/** The folders volumes are mounted under, which {@link gone} treats apart; `/net` is autofs's. */
const MOUNT_PARENTS = ['/Volumes', '/mnt', '/media', '/run/media', '/net']

export interface JetbrainsOptions {
  /** Idle hours before a version folder is a candidate (default {@link DEFAULT_IDLE_HOURS}). */
  idleHours?: number | undefined
  /** The environment `HOME` and the XDG folders are read from. Default: this process's. */
  env?: Readonly<Record<string, string | undefined>> | undefined
  /** Default: this process's. Only `darwin` and `linux` have roots. */
  platform?: NodeJS.Platform | undefined
  /** Folders whose entries are looked at as installs. Default: the platform's application folders. */
  apps?: readonly string[] | undefined
  /** Folders whose `jetbrains-*.desktop` entries point at installs. Default: the Linux applications folders. */
  desktop?: readonly string[] | undefined
}

/** Where the plugin looks, for one home and platform. */
interface Layout {
  /** The home `$USER_HOME$` in recent projects stands for. */
  home: string
  /** The roots: cache and log folders holding version folders. */
  roots: string[]
  /** The root of log folders, which nothing rebuilds. */
  logs?: string
  /** The folder holding each version's config, with its recent projects. */
  config: string
  /** The Toolbox's `state.json`. */
  toolbox: string
  apps: readonly string[]
  desktop: readonly string[]
}

/** The layout for the home the core checks roots against: `ctx.home`, else `HOME`. */
function layoutOf(opts: JetbrainsOptions, ctx: Pick<Ctx, 'home'>): Layout {
  const env = opts.env ?? process.env
  const home = homeFrom(ctx.home ?? env.HOME)
  const platform = opts.platform ?? process.platform
  if (platform === 'darwin') {
    const lib = join(home, 'Library')
    const config = join(lib, 'Application Support', 'JetBrains')
    const logs = join(lib, 'Logs', 'JetBrains')
    return {
      home,
      roots: [join(lib, 'Caches', 'JetBrains'), logs],
      logs,
      config,
      toolbox: join(config, 'Toolbox', 'state.json'),
      apps: opts.apps ?? ['/Applications', join(home, 'Applications')],
      desktop: opts.desktop ?? [],
    }
  }
  if (platform === 'linux') {
    const xdg = (name: string, rel: string): string => {
      const v = env[name]
      return v !== undefined && isAbsolute(v) ? v : join(home, rel)
    }
    const share = xdg('XDG_DATA_HOME', '.local/share')
    const data = join(share, 'JetBrains', 'Toolbox')
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
        // A tarball unpacked straight into the home, such as `~/idea-IU-251.23774.435`, or beside it.
        home,
        join(home, 'bin'),
        join(home, 'tools'),
        join(home, 'Downloads'),
      ],
      // An install unpacked anywhere else is found through the desktop entry made for it.
      desktop: opts.desktop ?? [
        join(share, 'applications'),
        '/usr/local/share/applications',
        '/usr/share/applications',
      ],
    }
  }
  return { home, roots: [], config: '', toolbox: '', apps: [], desktop: [] }
}

/** Whether `path` exists as itself or may: one that cannot be checked counts as present, so it is never taken as gone. */
function mayExist(path: string): boolean {
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
 * `product-info.json` names no data folder, or that has none beside an
 * `idea.properties` (an IntelliJ-platform IDE), is a problem, since an install
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
      // A tool with neither file is no IntelliJ-platform IDE, such as Fleet, and uses no version folder.
      if (
        toolbox &&
        ['bin', join('Contents', 'bin')].some(
          (b) => exists(join(dir, b, 'idea.properties')) !== false,
        )
      ) {
        found.problems.push(`the Toolbox installed ${dir}, which has no product-info.json`)
      }
      return
    }
    let info: unknown
    try {
      info = JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
      found.problems.push(`${file} could not be read: ${errorText(err)}`)
      return
    }
    const name = isObject(info) ? info.dataDirectoryName : undefined
    const m = typeof name === 'string' ? VERSION_DIR.exec(name) : null
    if (!isObject(info) || m === null) {
      // A name that is no `<Product><year>.<n>`, as `AndroidStudio2024.1.2`, is a folder never looked into.
      if (toolbox && typeof name !== 'string') found.problems.push(`${file} names no data folder`)
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
  if (mayExist(layout.toolbox)) {
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
        if (typeof where !== 'string' || !isAbsolute(where) || !mayExist(where)) continue
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
  for (const dir of layout.desktop) {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.startsWith('jetbrains-') || !name.endsWith('.desktop')) continue
      const install = desktopInstall(join(dir, name))
      if (install !== undefined) read(install, false)
    }
  }
  return found
}

/** The install folder a desktop entry's `Exec=<install>/bin/<launcher>` starts; undefined when it names none. */
function desktopInstall(file: string): string | undefined {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  const exec = /^Exec=\s*(?:"([^"]+)"|(\S+))/m.exec(text)
  const program = exec?.[1] ?? exec?.[2]
  if (program === undefined || !isAbsolute(program)) return undefined
  const bin = dirname(program)
  return basename(bin) === 'bin' ? dirname(bin) : undefined
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
      .replace(/^\$USER_HOME\$/, () => home)
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

const DISK: DiskProbe = { present: mayExist, device: deviceOf }

/**
 * Whether `path` is gone from a volume that is there. A missing one under a
 * mount folder ({@link MOUNT_PARENTS}) is gone only when
 * its nearest existing folder there is on a device of its own, a volume that
 * is mounted: an unmounted volume may leave its empty mount point behind.
 */
export function gone(path: string, disk: DiskProbe = DISK): boolean {
  if (disk.present(path)) return false
  let dir = dirname(path)
  while (dir !== dirname(dir) && !disk.present(dir)) dir = dirname(dir)
  if (dir === dirname(dir)) return false
  const under = (p: string, m: string): boolean => p === m || p.startsWith(m + '/')
  const mounts = MOUNT_PARENTS.find((m) => under(path, m))
  if (mounts === undefined) return true
  // The mount folder missing, or there with nothing found in it: the volume may just be away.
  if (dir === mounts || !under(dir, mounts)) return false
  const here = disk.device(dir)
  const parent = disk.device(mounts)
  return here !== undefined && parent !== undefined && here !== parent
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
  /** Under the log root: nothing rebuilds it. */
  log: boolean
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
        out.push({ kind: 'ide-version', path, version, product, log: root === layout.logs })
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
        if (paths === undefined || !paths.every((p) => gone(p))) continue
        out.push({
          kind: 'project-cache',
          path: join(projects, name),
          version,
          product,
          project: paths[0]!,
          log: false,
        })
      }
    }
  }
  return out
}

/** What one hook call works with. */
interface Env {
  kit: Kit
  idleHours: number
  ctx: Ctx
  layout: Layout
  installs: Installs
  /** What {@link runningOf} found for each product this hook call. */
  running: Map<string, Row['blockers']>
}

/** The refusals `product`'s running processes add, looked up once per hook call. */
function runningOf(env: Env, product: string): Row['blockers'] {
  const cached = env.running.get(product)
  if (cached !== undefined) return cached
  const blockers: Row['blockers'] = []
  const names = new Set(env.installs.launchers.get(product))
  for (const l of LAUNCHERS[product] ?? []) names.add(l)
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

  if (f.kind === 'ide-version') {
    for (const p of installs.problems) blockers.push({ code: 'installs-unreadable', reason: p })
  }
  // Held while in use: a project missing for a moment, on a share that is down or while re-cloned, still uses its cache.
  const what =
    f.kind === 'ide-version'
      ? `no installed IDE uses ${f.version}`
      : `${f.version}'s cache for ${f.project}, which is gone`
  let why: string
  let held = false
  let unmeasured = false
  let since
  try {
    since = kit.idle(f.path)
  } catch {
    // A folder that cannot be read may hide recent use.
    return null
  }
  if (since.unmeasured) {
    unmeasured = true
    why = `${what}; when it was last used could not be measured in the time budget`
  } else {
    held = since.hours !== null && since.hours < idleHours
    why =
      since.hours === null
        ? `${what}, and it holds no file`
        : `${what}; unchanged for ${hoursText(since.hours)} hours (threshold ${idleHours})`
  }
  const bytes = unmeasured || !sized ? null : kit.size(f.path)
  return {
    blockers,
    candidate: kit.candidate({
      kind: f.kind,
      path: f.path,
      name: basename(f.path),
      why,
      costDescription: f.log ? 'lost' : 'rebuild',
      ...(bytes === null ? {} : { bytes }),
      ...(held ? { held: true } : {}),
      ...(unmeasured ? { unmeasured: true } : {}),
      evidence: {
        kind: f.kind,
        path: f.path,
        version: f.version,
        ...(f.project === undefined ? {} : { project: f.project }),
      },
    }),
  }
}

/** The `jetbrains` plugin on `kit`: caches of uninstalled IDE versions and of gone projects. */
export function jetbrainsPlugin(opts: JetbrainsOptions, kit: Kit): Plugin {
  const idleHours = idleHoursOr(opts.idleHours)
  const envOf = (ctx: Ctx): Env => {
    const layout = layoutOf(opts, ctx)
    return { kit, ctx, idleHours, layout, installs: installsOf(layout), running: new Map() }
  }
  let rows = new Map<string, Row>()
  const plugin: Plugin = builtIn({
    name: JETBRAINS_PLUGIN,
    limits: { discover: DISCOVER_LIMIT_MS },
    detect: (ctx) => layoutOf(opts, ctx).roots.some(isDir),
    roots: (ctx) => layoutOf(opts, ctx).roots,
    async discover(ctx) {
      const env = envOf(ctx)
      const found: Row[] = []
      for (const f of scan(env.layout, env.installs)) {
        await yieldToLimit(ctx)
        const row = rowOf(env, f)
        if (row !== null) found.push(row)
      }
      rows = new Map(found.map((r) => [r.candidate.id, r]))
      return found.map((r) => r.candidate)
    },
    object: (all) =>
      all.flatMap((c) => {
        const row = rows.get(c.id)
        return c.owner === JETBRAINS_PLUGIN && row !== undefined
          ? objectionsTo(JETBRAINS_PLUGIN, row)
          : []
      }),
    async delete(c, ctx) {
      if (c.path === undefined) throw new Error(`${c.id} is not a folder`)
      if (!present(c.path)) return `already gone: ${c.path}`
      // Found and measured again, so an install, a project or a process that came back since the plan is seen.
      const env = envOf(ctx)
      const f = scan(env.layout, env.installs, c.path).find(
        (x) => x.path === c.path && x.kind === c.kind,
      )
      checkAgain(c, f === undefined ? undefined : (rowOf(env, f, false) ?? undefined))
      await yieldToLimit(ctx)
      return kit.remove(c.path, ctx)
    },
  })
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
