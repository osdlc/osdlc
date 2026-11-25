/**
 * The `toolchains` plugin: rustup toolchains, and Node versions installed
 * by nvm or Volta, that no checkout in the targets asks for.
 *
 * Every checkout under the targets (a checkout, or a directory of them, with
 * each repository's linked worktrees) is read for `rust-toolchain`,
 * `rust-toolchain.toml`, `.nvmrc`, `.node-version` and `package.json`'s
 * `volta.node`, at its root and wherever git lists one below it. What they
 * name is kept, and so are the default and the one in use: rustup's
 * default, its directory overrides, `RUSTUP_TOOLCHAIN` and the toolchain
 * files in the run's folder and above it; nvm's `default` alias, Volta's
 * default and the `node` on `PATH`. rustup is not asked for its active
 * toolchain, since an older rustup installs it when it is missing.
 * A pin is kept by prefix, so `1.80` keeps `1.80-<host>` and `1.80.1-<host>`,
 * and `18` keeps every `18.x.y`.
 *
 * A version used in the last `idleHours` is kept too, so `cargo +nightly`
 * with no pin file keeps nightly while it is in use. Used means the newest
 * access or modification time of the files in the version's `bin` folder,
 * links followed: every use runs one of them, and running a file updates its
 * access time. On a volume mounted `noatime` running a file leaves no trace,
 * so a versions folder on one proposes nothing, and `detect` says so in its
 * note. Its mount is the one `df` names for it, and its options come from
 * `mount` on macOS and `/proc/self/mounts` on Linux; when they cannot be read,
 * the access times are trusted.
 *
 * When any of that cannot be read (a pin such as `lts/*` with no nvm alias
 * for it, a checkout git cannot list, rustup failing to answer, a `bin`
 * folder that is missing), the candidate is refused, every candidate of that
 * tool when it is a pin or what is in use, since what is unused cannot be
 * told. Nothing is proposed unless the targets were given (`ctx.targetsGiven`),
 * not the run's folder taken in their place. A toolchain that is a symlink
 * (one `rustup toolchain link` made) or whose name is not a release channel
 * is never proposed.
 *
 * Deleted with `rustup toolchain uninstall`; an nvm or Volta version folder
 * through `kit.remove`. Locations come from `RUSTUP_HOME`, `NVM_DIR` and
 * `VOLTA_HOME`, else their folders in `HOME`.
 * Settings: `plugins.toolchains.idleHours` (default {@link DEFAULT_IDLE_HOURS}).
 */

import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { Git, checkoutRoot, scanForCheckouts } from '@osdlc/typed-git'
import { z } from 'zod'

import { hoursText, objectionsTo, present, type Row } from './artifacts.ts'
import { DEFAULT_IDLE_HOURS, idleHoursSetting, type Kit } from './kit.ts'
import { containedIn } from './roots.ts'
import { PLUGIN_API, definePlugin, type Ctx, type Plugin } from './types.ts'

export const TOOLCHAINS_PLUGIN = 'toolchains'

const RUST_PIN_FILES = ['rust-toolchain', 'rust-toolchain.toml']
/** The pin files rustup and nvm look for in the folder they run in and above it. */
const DIR_PIN_FILES = [...RUST_PIN_FILES, '.nvmrc', '.node-version']
/** The files a checkout names its toolchain in, wherever they sit in it. */
const PIN_FILES = [...DIR_PIN_FILES, 'package.json']

/** nvm's names for the newest version it has installed. */
const NEWEST = new Set(['node', 'stable', 'latest', 'current'])

/** A rustup release channel, then a date or a host triple: a name rustup installed, not one it was given by `link`. */
const RUST_RELEASE = /^(stable|beta|nightly|\d+\.\d+(\.\d+)?)(-|$)/
const NODE_VERSION = /^v?\d+\.\d+\.\d+$/

/** The longest a survey may take: it reads every checkout under the targets. */
const DISCOVER_LIMIT_MS = 10 * 60_000

/** The longest `rustup toolchain uninstall` may take. */
const UNINSTALL_LIMIT_MS = 5 * 60_000

const HOUR_MS = 3_600_000

/** What {@link Detection.note} says when the targets are the run's folder, taken because none were given. */
export const NO_TARGETS_NOTE =
  'no targets were given (the folder it runs from is not enough), so it proposes nothing'

/** What {@link Detection.note} says when the versions folder `dir` is on a volume mounted `noatime`. */
export const noatimeNote = (dir: string): string =>
  `${dir} is on a volume mounted noatime, so last use can't be measured and every version in it is kept`

const TOOLS = ['rustup', 'nvm', 'volta'] as const
type Tool = (typeof TOOLS)[number]

/** Where each tool keeps its versions. */
type Homes = Record<Tool, string>

const homesOf = (env: Readonly<Record<string, string | undefined>>): Homes => {
  const home = env.HOME ?? homedir()
  return {
    rustup: env.RUSTUP_HOME ?? join(home, '.rustup'),
    nvm: env.NVM_DIR ?? join(home, '.nvm'),
    volta: env.VOLTA_HOME ?? join(home, '.volta'),
  }
}

/** The folder each tool's versions sit in, one per version. */
const versionsDirs = (homes: Homes): Record<Tool, string> => ({
  rustup: join(homes.rustup, 'toolchains'),
  nvm: join(homes.nvm, 'versions', 'node'),
  volta: join(homes.volta, 'tools', 'image', 'node'),
})

/** A Node version or pin without its leading `v`. */
const plain = (v: string): string => v.replace(/^v/, '')

const isDir = (path: string): boolean =>
  lstatSync(path, { throwIfNoEntry: false })?.isDirectory() === true

/** The version folders in `dir` whose names `pattern` matches; symlinks are left out. */
const installed = (dir: string, pattern: RegExp): string[] => {
  if (!isDir(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && pattern.test(e.name))
    .map((e) => e.name)
    .sort()
}

/** What the checkouts under the targets ask for, and what could not be read. */
interface Pins {
  rust: Set<string>
  /** Node versions, without a leading `v`, or a name nvm resolves (`lts/*`, `node`). */
  node: Set<string>
  /** Why the rust pins are not known; empty when they are. */
  rustUnknown: string[]
  nodeUnknown: string[]
}

const firstLine = (text: string): string =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .find((l) => l !== '') ?? ''

/** The channel a `rust-toolchain` or `rust-toolchain.toml` names; null when it names none (a `path`, or components only). */
export function rustPin(text: string): string | null {
  if (!/^\s*\[toolchain\]/m.test(text)) return firstLine(text) || null
  const channel = /^\s*channel\s*=\s*["']([^"']+)["']/m.exec(text)
  return channel === null ? null : channel[1]!.trim()
}

/** The version `package.json` pins for Volta, or null. */
const voltaPin = (text: string): string | null => {
  const json = JSON.parse(text) as { volta?: { node?: unknown } }
  const node = json?.volta?.node
  return typeof node === 'string' ? node.trim() : null
}

/** Every checkout under `targets`: each repository found, at a target or below one, with its linked worktrees. */
function checkoutsUnder(targets: readonly string[]): string[] {
  const mains = new Set<string>()
  for (const target of targets) {
    if (!isDir(target)) continue
    const found =
      checkoutRoot(target) === resolve(target)
        ? [target]
        : scanForCheckouts(target, { onWarn: () => {} }).checkouts
    for (const checkout of found) {
      const main = new Git(checkout).mainCheckout()
      if (main !== null) mains.add(main)
    }
  }
  const out = new Set<string>()
  for (const main of mains) {
    for (const tree of new Git(main).worktrees()) {
      if (!tree.bare && isDir(tree.path)) out.add(tree.path)
    }
  }
  return [...out].sort()
}

/** The pin files in `checkout`: at its root, and wherever git lists one below it, ignored ones aside. */
function pinFiles(checkout: string): string[] {
  const listed = new Git(checkout).lsFiles({
    cached: true,
    others: true,
    excludeStandard: true,
    paths: PIN_FILES.map((f) => `:(glob)**/${f}`),
  })
  const files = new Set(PIN_FILES.map((f) => join(checkout, f)))
  for (const rel of listed) files.add(join(checkout, rel))
  return [...files].sort()
}

/** What every checkout under `targets` and the run's folder ask for. */
function readPins(targets: readonly string[], cwd: string): Pins {
  const pins: Pins = { rust: new Set(), node: new Set(), rustUnknown: [], nodeUnknown: [] }
  const add = (file: string, text: string): void => {
    const name = basename(file)
    if (RUST_PIN_FILES.includes(name)) {
      const pin = rustPin(text)
      if (pin !== null) pins.rust.add(pin)
      return
    }
    const pin = name === 'package.json' ? voltaPin(text) : firstLine(text) || null
    if (pin !== null) pins.node.add(plain(pin))
  }
  const read = (file: string): void => {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      const why = `${file} could not be read`
      ;(RUST_PIN_FILES.includes(basename(file)) ? pins.rustUnknown : pins.nodeUnknown).push(why)
      return
    }
    try {
      add(file, text)
    } catch {
      // Only package.json is parsed; one that is not JSON may hide a Volta pin.
      pins.nodeUnknown.push(`${file} is not JSON`)
    }
  }

  let checkouts: string[]
  try {
    checkouts = checkoutsUnder(targets)
  } catch (err) {
    const why = `the checkouts under the targets could not be listed: ${message(err)}`
    return { ...pins, rustUnknown: [why], nodeUnknown: [why] }
  }
  for (const checkout of checkouts) {
    let files: string[]
    try {
      files = pinFiles(checkout)
    } catch (err) {
      const why = `${checkout} could not be listed: ${message(err)}`
      pins.rustUnknown.push(why)
      pins.nodeUnknown.push(why)
      continue
    }
    for (const file of files) read(file)
  }
  // The run's folder and those above it decide what is in use there, as rustup and nvm look up.
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    for (const f of DIR_PIN_FILES) read(join(dir, f))
    if (dirname(dir) === dir) break
  }
  return pins
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * When the version in `dir` was last used: the newest access or modification
 * time of the files in its `bin` folder, links followed. Every use runs one of
 * them (rustup's proxies, nvm's `PATH`, Volta's shims), and running a file
 * updates its access time. Null when `bin` or a file in it cannot be read, or it holds no file.
 */
export function lastUsedMs(dir: string): number | null {
  const bin = join(dir, 'bin')
  let newest: number | null = null
  try {
    for (const name of readdirSync(bin)) {
      const stat = statSync(join(bin, name), { throwIfNoEntry: false })
      if (stat === undefined || !stat.isFile()) continue
      const t = Math.max(stat.atimeMs, stat.mtimeMs)
      if (newest === null || t > newest) newest = t
    }
  } catch {
    // A file that cannot be read may be the one in use.
    return null
  }
  return newest
}

/** Whether the pin `pin` keeps the version `name`: the same, or `name` is `pin` with more after a `-` or a `.`. */
export const keeps = (pin: string, name: string): boolean =>
  name === pin || name.startsWith(`${pin}-`) || name.startsWith(`${pin}.`)

/**
 * The options of the mount that holds the folder `path` (`noatime`,
 * `relatime`, ...); null when they cannot be read.
 */
export type MountOptions = (path: string, ctx: Ctx) => Promise<readonly string[] | null>

/** A mount in a mount table: where it is mounted and its options. */
export interface Mount {
  on: string
  options: string[]
}

/** The mount point `df -P` prints for the one path it was given; null when it prints none. */
export function dfMountPoint(stdout: string): string | null {
  const last = stdout.trimEnd().split(/\r?\n/).at(-1) ?? ''
  return /\s(?:\d+%|-)\s+(\/.*)$/.exec(last)?.[1] ?? null
}

/** macOS's `mount` output: `<device> on <mount point> (<type>, <option>, ...)`, the type left out. */
export function parseMountOutput(stdout: string): Mount[] {
  const mounts: Mount[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^(.+?) on (.+) \(([^()]*)\)$/.exec(line)
    if (m !== null) mounts.push({ on: m[2]!, options: m[3]!.split(/,\s*/).slice(1) })
  }
  return mounts
}

/** Linux's `/proc/self/mounts`: `<device> <mount point> <type> <options> ...`, with `\040` and the like for a space. */
export function parseProcMounts(text: string): Mount[] {
  const unescape = (s: string): string =>
    s.replace(/\\([0-7]{3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)))
  const mounts: Mount[] = []
  for (const line of text.split('\n')) {
    const fields = line.split(' ')
    if (fields.length >= 4)
      mounts.push({ on: unescape(fields[1]!), options: fields[3]!.split(',') })
  }
  return mounts
}

/**
 * The {@link MountOptions} the command line uses: the mount `df -P` names for
 * the folder, the last of that name in the mount table (`mount` on macOS,
 * `/proc/self/mounts` on Linux), since a later mount hides an earlier one.
 * Null on any other platform, or when either cannot be read.
 */
export function mountOptionsBy(
  kit: Kit,
  platform: NodeJS.Platform = process.platform,
): MountOptions {
  return async (path, ctx) => {
    if (platform !== 'darwin' && platform !== 'linux') return null
    const run = (argv: string[]) => kit.run(argv, { env: { LC_ALL: 'C' }, signal: ctx.signal })
    const df = await run(['df', '-P', path])
    const on = df.ok ? dfMountPoint(df.stdout) : null
    if (on === null) return null
    let table: Mount[]
    if (platform === 'darwin') {
      const r = await run(['mount'])
      if (!r.ok) return null
      table = parseMountOutput(r.stdout)
    } else {
      try {
        table = parseProcMounts(readFileSync('/proc/self/mounts', 'utf8'))
      } catch {
        return null
      }
    }
    return table.filter((m) => m.on === on).at(-1)?.options ?? null
  }
}

export interface ToolchainsOptions {
  /** Not a finite number of zero or more: {@link DEFAULT_IDLE_HOURS}. */
  idleHours?: number | undefined
  /** Default: {@link mountOptionsBy} on the plugin's kit. */
  mountOptions?: MountOptions | undefined
}

/**
 * The `toolchains` plugin on `kit`; `env` is where each tool keeps its
 * versions (`HOME`, `RUSTUP_HOME`, `NVM_DIR`, `VOLTA_HOME`).
 */
export function toolchainsPlugin(
  kit: Kit,
  env: Readonly<Record<string, string | undefined>>,
  opts: ToolchainsOptions = {},
): Plugin {
  const { idleHours } = opts
  const mountOptions = opts.mountOptions ?? mountOptionsBy(kit)
  const homes = homesOf(env)
  const versions = versionsDirs(homes)
  const threshold =
    idleHours !== undefined && Number.isFinite(idleHours) && idleHours >= 0
      ? idleHours
      : DEFAULT_IDLE_HOURS
  const rustupEnv = { RUSTUP_HOME: homes.rustup, RUSTUP_AUTO_INSTALL: '0' }

  /** The lines rustup prints for `args`, blank ones left out; throws when it does not answer. */
  const rustup = async (args: string[], ctx: Ctx): Promise<string[]> => {
    const r = await kit.run(['rustup', ...args], {
      cwd: ctx.cwd,
      env: rustupEnv,
      signal: ctx.signal,
    })
    if (!r.ok)
      throw new Error(
        `rustup ${args.join(' ')} failed: ${r.stderr.trim() || r.error || `exit ${r.exitCode}`}`,
      )
    return r.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '')
  }

  /** The rustup toolchains to keep beyond the pins: the default, the directory overrides and `RUSTUP_TOOLCHAIN`. */
  const rustInUse = async (ctx: Ctx): Promise<string[]> => {
    const lastWord = (l: string): string => l.split(/\s+/).at(-1)!
    const [defaults, overrides] = await Promise.all([
      rustup(['default'], ctx),
      rustup(['override', 'list'], ctx),
    ])
    const fromEnv = env.RUSTUP_TOOLCHAIN?.trim()
    return [
      ...defaults.slice(0, 1).map((l) => l.split(/\s+/)[0]!),
      ...overrides.filter((l) => l !== 'no overrides').map(lastWord),
      ...(fromEnv ? [fromEnv] : []),
    ]
  }

  /** `spec` as the versions it keeps, through nvm's aliases; null when it cannot be told. */
  const nodeSpec = (spec: string, newest: string | undefined, hops = 0): string[] | null => {
    const s = plain(spec)
    if (/^\d+(\.\d+){0,2}$/.test(s)) return [s]
    if (s === 'system') return []
    if (NEWEST.has(s)) return newest === undefined ? [] : [newest]
    if (hops > 5 || !/^[\w.*/-]+$/.test(s) || s.split('/').includes('..')) return null
    let text: string
    try {
      text = readFileSync(join(homes.nvm, 'alias', ...s.split('/')), 'utf8')
    } catch {
      return null
    }
    const next = firstLine(text)
    return next === '' ? null : nodeSpec(next, newest, hops + 1)
  }

  /** The Node versions to keep beyond the pins: nvm's default, Volta's and the `node` on `PATH`, plus why any could not be read. */
  const nodeInUse = async (ctx: Ctx, newest: string | undefined) => {
    const keep: string[] = []
    const unknown: string[] = []
    const nvmDefault = join(homes.nvm, 'alias', 'default')
    if (present(nvmDefault)) {
      const found = nodeSpec('default', newest)
      if (found === null) unknown.push(`nvm's default alias names no version it has`)
      else keep.push(...found)
    }
    const platform = join(homes.volta, 'tools', 'user', 'platform.json')
    if (present(platform)) {
      try {
        const json = JSON.parse(readFileSync(platform, 'utf8')) as { node?: { runtime?: unknown } }
        const runtime = json?.node?.runtime
        if (typeof runtime === 'string') keep.push(plain(runtime))
      } catch (err) {
        unknown.push(`Volta's default could not be read from ${platform}: ${message(err)}`)
      }
    }
    if (kit.onPath('node')) {
      const r = await kit.run(['node', '--version'], { cwd: ctx.cwd, signal: ctx.signal })
      const version = r.stdout.trim()
      if (r.ok && NODE_VERSION.test(version)) keep.push(plain(version))
      else unknown.push(`the node on PATH did not say its version`)
    }
    return { keep, unknown }
  }

  /**
   * The row for a version no pin or default keeps; null when it was used in the
   * last {@link threshold} hours. Sized only when `measure` is set.
   */
  const row = (
    tool: Tool,
    name: string,
    unknown: readonly string[],
    measure: boolean,
  ): Row | null => {
    const path = join(versions[tool], name)
    const used = lastUsedMs(path)
    const hours = used === null ? null : Math.max(0, (Date.now() - used) / HOUR_MS)
    if (hours !== null && hours < threshold) return null
    const bytes = measure ? kit.size(path) : null
    const what = tool === 'rustup' ? 'this toolchain' : 'this Node version'
    const blockers = unknown.map((reason) => ({ code: 'unused-unknown', reason }))
    if (hours === null) {
      blockers.push({
        code: 'unused-unknown',
        reason: `when ${path} was last used could not be told: its bin folder could not be read or holds no file`,
      })
    }
    return {
      candidate: kit.candidate({
        kind: tool === 'rustup' ? 'rust-toolchain' : 'node-version',
        path,
        name,
        why:
          `no checkout in the targets asks for ${what}, and it is not the default or in use` +
          (hours === null
            ? ''
            : `; last used ${hoursText(hours)} hours ago (threshold ${threshold})`),
        costDescription: 're-download',
        ...(bytes === null ? {} : { bytes }),
        evidence: { kind: 'toolchain', tool, name, path },
      }),
      blockers,
    }
  }

  /** The tools whose versions folder is there: rustup's only when rustup is on PATH. */
  const presentTools = (): Tool[] =>
    TOOLS.filter((t) => (t !== 'rustup' || kit.onPath('rustup')) && isDir(versions[t]))

  /** The tools among `tools` whose versions folder is on a volume mounted `noatime`; one whose options cannot be read is not. */
  const noatime = async (tools: readonly Tool[], ctx: Ctx): Promise<Set<Tool>> => {
    const flags = await Promise.all(
      tools.map(async (tool) => {
        try {
          return (await mountOptions(versions[tool], ctx))?.includes('noatime') === true
        } catch {
          return false
        }
      }),
    )
    return new Set(tools.filter((_, i) => flags[i]))
  }

  /**
   * Every toolchain no checkout asks for and nobody used lately, refused when
   * what is asked for could not be read; sized only when `measure` is set.
   */
  const scan = async (ctx: Ctx, measure: boolean): Promise<Row[]> => {
    if (!ctx.targetsGiven || ctx.targets.length === 0) return []
    // A version run daily on a noatime volume would read as unused, so none there is proposed.
    const tools = presentTools()
    const skip = await noatime(tools, ctx)
    if (tools.every((t) => skip.has(t))) return []
    const pins = readPins(ctx.targets, ctx.cwd)
    const rows: Row[] = []
    const add = (tool: Tool, name: string, unknown: readonly string[]): void => {
      const r = row(tool, name, unknown, measure)
      if (r !== null) rows.push(r)
    }

    const rust =
      tools.includes('rustup') && !skip.has('rustup')
        ? installed(versions.rustup, RUST_RELEASE)
        : []
    if (rust.length > 0) {
      const unknown = [...pins.rustUnknown]
      const keep = [...pins.rust]
      try {
        keep.push(...(await rustInUse(ctx)))
      } catch (err) {
        unknown.push(`what rustup has in use could not be read: ${message(err)}`)
      }
      for (const name of rust) {
        if (!keep.some((pin) => keeps(pin, name))) add('rustup', name, unknown)
      }
    }

    const node = {
      nvm: installed(versions.nvm, NODE_VERSION),
      volta: installed(versions.volta, NODE_VERSION),
    }
    if (node.nvm.length + node.volta.length > 0) {
      const newest = [...node.nvm, ...node.volta].map(plain).sort(byVersion).at(-1)
      const inUse = await nodeInUse(ctx, newest)
      const unknown = [...pins.nodeUnknown, ...inUse.unknown]
      const keep = [...inUse.keep]
      for (const pin of pins.node) {
        const found = nodeSpec(pin, newest)
        if (found === null) {
          unknown.push(`a checkout asks for node ${JSON.stringify(pin)}, which names no version`)
        } else keep.push(...found)
      }
      for (const tool of ['nvm', 'volta'] as const) {
        if (skip.has(tool)) continue
        for (const name of node[tool]) {
          if (!keep.some((pin) => keeps(pin, plain(name)))) add(tool, name, unknown)
        }
      }
    }
    return rows
  }

  /** The tool a candidate's folder belongs to, from where it sits; null when it sits in none of them. */
  const toolOf = (path: string): Tool | null =>
    TOOLS.find((t) => dirname(path) === versions[t]) ?? null

  let rows = new Map<string, Row>()

  return {
    name: TOOLCHAINS_PLUGIN,
    limits: { discover: DISCOVER_LIMIT_MS },
    async detect(ctx) {
      const tools = presentTools()
      if (tools.length === 0) return false
      if (!ctx.targetsGiven) return { active: true, note: NO_TARGETS_NOTE }
      const skip = await noatime(tools, ctx)
      if (skip.size === 0) return true
      const note = tools.filter((t) => skip.has(t)).map((t) => noatimeNote(versions[t]))
      return { active: true, note: note.join('; ') }
    },
    roots: () => TOOLS.map((t) => versions[t]),
    async discover(ctx) {
      const found = await scan(ctx, true)
      rows = new Map(found.map((r) => [r.candidate.id, r]))
      return found.map((r) => r.candidate)
    },
    object: (all) =>
      all.flatMap((c) => {
        const r = c.owner === TOOLCHAINS_PLUGIN ? rows.get(c.id) : undefined
        return r === undefined ? [] : objectionsTo(TOOLCHAINS_PLUGIN, r)
      }),
    async delete(c, ctx) {
      const path = c.path
      if (path === undefined) throw new Error(`${c.id} is not a toolchain folder`)
      const tool = toolOf(path)
      if (tool === null || containedIn([versions[tool]], path) === null) {
        throw new Error(`${path} is not a version folder of rustup, nvm or Volta`)
      }
      const stat = lstatSync(path, { throwIfNoEntry: false })
      if (stat === undefined) return `already gone: ${path}`
      // `rustup toolchain uninstall` would remove what a link leads to.
      if (!stat.isDirectory()) throw new Error(`${path} is no longer a folder`)
      // A checkout may have pinned it, or it may have become the default, since the survey.
      const now = (await scan(ctx, false)).find((r) => r.candidate.id === c.id)
      if (now === undefined) throw new Error(`${path} is no longer a candidate`)
      if (now.blockers.length > 0) {
        throw new Error(`${path} is refused: ${now.blockers.map((b) => b.reason).join(', ')}`)
      }
      if (tool !== 'rustup') return kit.remove(path, ctx)
      const name = basename(path)
      await kit.run(['rustup', 'toolchain', 'uninstall', name], {
        env: rustupEnv,
        signal: ctx.signal,
        timeoutMs: UNINSTALL_LIMIT_MS,
        check: true,
      })
      if (present(path)) {
        throw new Error(`${path} is still there after rustup toolchain uninstall ${name}`)
      }
      return `rustup toolchain uninstall ${name} removed ${path}`
    },
  }
}

/** Compares two `x.y.z` versions by number. */
const byVersion = (a: string, b: string): number => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** The `toolchains` plugin as the command line builds it. Settings: `idleHours`. */
export const toolchainsDefinition = definePlugin({
  name: TOOLCHAINS_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({ idleHours: idleHoursSetting }),
  create: ({ settings, kit, env }) => toolchainsPlugin(kit, env, { idleHours: settings.idleHours }),
})
