/**
 * The `toolchains` plugin: rustup toolchains, and Node versions installed
 * by nvm or Volta, that no checkout in the targets asks for, that are not the
 * default or in use, and that nobody ran in the last `idleHours`. What is read,
 * what is kept and what refuses a candidate: "The `toolchains` plugin" in this
 * package's README.md.
 * Settings: `plugins.toolchains.idleHours` (default {@link DEFAULT_IDLE_HOURS}).
 */

import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'

import { Git, checkoutRoot, scanForCheckouts } from '@osdlc/typed-git'
import { z } from 'zod'

import {
  DISCOVER_LIMIT_MS,
  checkAgain,
  errorText,
  failureReason,
  hoursText,
  objectionsTo,
  objector,
  realOr,
  yieldToLimit,
  type Row,
} from './helpers.ts'
import { idleHoursOr, idleHoursSetting, present, type Kit } from './kit.ts'
import { containedIn } from './roots.ts'
import { PLUGIN_API, definePlugin, type Ctx, type Plugin } from './types.ts'

export const TOOLCHAINS_PLUGIN = 'toolchains'

const RUST_PIN_FILES = ['rust-toolchain', 'rust-toolchain.toml']
/**
 * The files a toolchain is named in: wherever they sit in a checkout, and in
 * the run's folder and every folder above it.
 */
const PIN_FILES = [...RUST_PIN_FILES, '.nvmrc', '.node-version', 'package.json']

/** nvm's names for the newest version it has installed. */
const NEWEST = new Set(['node', 'stable', 'latest', 'current'])

/** A rustup release channel, then a date or a host triple: a name rustup installed, not one it was given by `link`. */
const RUST_RELEASE = /^(stable|beta|nightly|\d+\.\d+(\.\d+)?)(-|$)/
const NODE_VERSION = /^v?\d+\.\d+\.\d+$/

/** The longest `rustup toolchain uninstall` may take. */
const UNINSTALL_LIMIT_MS = 5 * 60_000

const HOUR_MS = 3_600_000

/** How late a `relatime` mount may record a use: it updates an access time at most once a day. */
const RELATIME_LAG_HOURS = 24

/** How far a versions folder's access times can be trusted, by its mount's options. */
type AtimeMode = 'noatime' | 'relatime' | 'exact'

/** What {@link Detection.note} says when the targets are the run's folder, taken because none were given. */
export const NO_TARGETS_NOTE =
  'no targets were given (the folder it runs from is not enough), so it proposes nothing'

/** The note on every candidate: where the search for pins does not look. */
export const UNSEARCHED_NOTE =
  "checkouts in folders whose names start with a dot, and in folders a checkout's git ignores, are not searched for pins"

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
  /** Why Volta's pins in package.json are not known: they refuse Volta's versions only, since nvm does not read them. */
  voltaUnknown: string[]
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
  const json = JSON.parse(text.replace(/^﻿/, '')) as { volta?: { node?: unknown } }
  const node = json?.volta?.node
  return typeof node === 'string' ? node.trim() : null
}

/**
 * How many levels below a target are searched for checkouts: deep enough for
 * a bare repository's own folders, bounded against a symlink loop.
 */
const SEARCH_DEPTH = 8

/** The checkouts under the target `dir`, and why the walk may have missed one. */
function scanUnder(dir: string, unknown: string[]): string[] {
  const scan = scanForCheckouts(dir, { maxDepth: SEARCH_DEPTH, onWarn: () => {} })
  if (scan.depthLimited > 0) {
    unknown.push(
      `${dir} has folders more than ${SEARCH_DEPTH} levels down, which were not searched for checkouts`,
    )
  }
  return scan.checkouts
}

/** Whether `checkout`'s `.git` is a file naming a git folder that is gone: a worktree its repository pruned. */
function orphaned(checkout: string): boolean {
  let text: string
  try {
    text = readFileSync(join(checkout, '.git'), 'utf8')
  } catch {
    return false
  }
  const gitdir = /^gitdir:\s*(.+?)\s*$/m.exec(text)?.[1]
  return gitdir !== undefined && !present(resolve(checkout, gitdir))
}

/**
 * Every checkout under `targets`, with each repository's worktrees: the
 * repository a target is in (the whole of it, as the cargo and node plugins
 * read it) and those found below a target; the `loose` folders whose `.git`
 * names a git folder that is gone, read at their root only; plus why one may
 * have been missed.
 */
function checkoutsUnder(targets: readonly string[]): {
  checkouts: string[]
  loose: string[]
  unknown: string[]
} {
  const found = new Set<string>()
  const unknown: string[] = []
  for (const target of targets) {
    // A target that is a link is followed.
    const stat = statSync(target, { throwIfNoEntry: false })
    if (stat === undefined && lstatSync(target, { throwIfNoEntry: false }) !== undefined) {
      unknown.push(`${target} is a link that leads nowhere, so its checkouts could not be read`)
    }
    if (stat?.isDirectory() !== true) continue
    const root = checkoutRoot(target)
    if (root !== null) found.add(root)
    for (const checkout of scanUnder(target, unknown)) found.add(checkout)
  }
  // A worktree lists every worktree of its repository, a bare one's too.
  const out = new Set<string>()
  const loose: string[] = []
  for (const checkout of found) {
    if (out.has(checkout)) continue
    let trees: ReturnType<Git['worktrees']>
    try {
      trees = new Git(checkout).worktrees()
    } catch (err) {
      if (orphaned(checkout)) loose.push(checkout)
      else unknown.push(`the worktrees of ${checkout} could not be listed: ${errorText(err)}`)
      continue
    }
    for (const tree of trees) {
      if (!tree.bare && isDir(tree.path)) out.add(tree.path)
    }
  }
  return { checkouts: [...out].sort(), loose: loose.sort(), unknown }
}

/**
 * The repositories inside `checkout` that git does not list the files of:
 * its submodules, and the repositories in folders it does not track.
 */
function nestedCheckouts(checkout: string): string[] {
  const git = new Git(checkout)
  const out = git
    .submodules()
    .map((s) => join(checkout, s.path))
    .filter((dir) => present(join(dir, '.git')))
  const untracked = git.lsFiles({ others: true, excludeStandard: true, directory: true })
  // The walk's depth limit is not a reason to refuse here: an untracked folder is more often data than repositories.
  for (const rel of untracked.filter((r) => r.endsWith('/'))) {
    out.push(...scanForCheckouts(join(checkout, rel), { onWarn: () => {} }).checkouts)
  }
  return out
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
async function readPins(targets: readonly string[], ctx: Ctx): Promise<Pins> {
  const pins: Pins = {
    rust: new Set(),
    node: new Set(),
    rustUnknown: [],
    nodeUnknown: [],
    voltaUnknown: [],
  }
  const unknownOf = (file: string): string[] => {
    const name = basename(file)
    if (RUST_PIN_FILES.includes(name)) return pins.rustUnknown
    return name === 'package.json' ? pins.voltaUnknown : pins.nodeUnknown
  }
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
      unknownOf(file).push(`${file} could not be read`)
      return
    }
    try {
      add(file, text)
    } catch {
      // Only package.json is parsed; one that is not JSON may hide a Volta pin.
      pins.voltaUnknown.push(`${file} is not JSON`)
    }
  }

  const unknown = (why: string): void => {
    pins.rustUnknown.push(why)
    pins.nodeUnknown.push(why)
  }
  let found: ReturnType<typeof checkoutsUnder>
  try {
    found = checkoutsUnder(targets)
  } catch (err) {
    unknown(`the checkouts under the targets could not be listed: ${errorText(err)}`)
    return pins
  }
  for (const dir of found.loose) for (const f of PIN_FILES) read(join(dir, f))
  const queue = [...found.checkouts]
  const seen = new Set(queue)
  for (let checkout = queue.shift(); checkout !== undefined; checkout = queue.shift()) {
    // Each checkout is listed synchronously, so the survey's time limit can fire only between them.
    await yieldToLimit(ctx)
    let files: string[]
    try {
      files = pinFiles(checkout)
      for (const nested of nestedCheckouts(checkout)) {
        if (!seen.has(nested)) {
          seen.add(nested)
          queue.push(nested)
        }
      }
    } catch (err) {
      unknown(`${checkout} could not be listed: ${errorText(err)}`)
      continue
    }
    for (const file of files) read(file)
  }
  for (const why of found.unknown) unknown(why)
  // The run's folder and those above it decide what is in use there, as rustup and nvm look up.
  for (let dir = resolve(ctx.cwd); ; dir = dirname(dir)) {
    for (const f of PIN_FILES) read(join(dir, f))
    if (dirname(dir) === dir) break
  }
  return pins
}

/** The packages that come with every Node version, which a re-download brings back. */
const BUNDLED_PACKAGES = new Set(['npm', 'corepack'])

/**
 * The global packages installed into the nvm version folder `dir`, those that
 * come with Node aside; null when they cannot be listed.
 */
export function globalPackages(dir: string): string[] | null {
  const modules = join(dir, 'lib', 'node_modules')
  if (lstatSync(modules, { throwIfNoEntry: false }) === undefined) return []
  try {
    return readdirSync(modules)
      .filter((n) => !n.startsWith('.') && !BUNDLED_PACKAGES.has(n))
      .sort()
  } catch {
    return null
  }
}

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
  /**
   * Hours a version must go unused before it is proposed; {@link DEFAULT_IDLE_HOURS}
   * when not a finite number of zero or more.
   */
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
  const threshold = idleHoursOr(idleHours)
  const rustupEnv = { RUSTUP_HOME: homes.rustup, RUSTUP_AUTO_INSTALL: '0' }

  /** The lines rustup prints for `args`, blank ones left out; throws when it does not answer. */
  const rustup = async (args: string[], ctx: Ctx): Promise<string[]> => {
    const r = await kit.run(['rustup', ...args], {
      cwd: ctx.cwd,
      env: rustupEnv,
      signal: ctx.signal,
    })
    if (!r.ok) throw new Error(`rustup ${args.join(' ')} failed: ${failureReason(r)}`)
    return r.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '')
  }

  /**
   * The rustup toolchains to keep beyond the pins: the default, the directory
   * overrides and `RUSTUP_TOOLCHAIN`. rustup is not asked for its active
   * toolchain, since an older rustup installs it when it is missing.
   */
  const rustInUse = async (ctx: Ctx): Promise<string[]> => {
    const lastWord = (l: string): string => l.split(/\s+/).at(-1)!
    const [defaults, overrides] = await Promise.all([
      rustup(['default'], ctx).catch((err: unknown) => {
        // With no default set there is none to keep.
        if (/no default toolchain/i.test(errorText(err))) return []
        throw err
      }),
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

  /** Whether the first `node` on `PATH` is Volta's shim. */
  const voltaShimFirst = (): boolean => {
    const node = (env.PATH ?? '')
      .split(delimiter)
      .filter((d) => d !== '')
      .map((d) => join(d, 'node'))
      .find((p) => present(p))
    if (node === undefined) return false
    return (
      dirname(node) === join(homes.volta, 'bin') || basename(realOr(node)).startsWith('volta-shim')
    )
  }

  /**
   * The Node versions to keep beyond the pins: nvm's default, Volta's and the
   * `node` on `PATH`, plus why any could not be read, by the tool it refuses.
   */
  const nodeInUse = async (ctx: Ctx, newest: string | undefined) => {
    const keep: string[] = []
    const unknown: Record<'nvm' | 'volta', string[]> = { nvm: [], volta: [] }
    const nvmDefault = join(homes.nvm, 'alias', 'default')
    if (present(nvmDefault)) {
      const found = nodeSpec('default', newest)
      if (found === null) unknown.nvm.push(`nvm's default alias names no version it has`)
      else keep.push(...found)
    }
    const platform = join(homes.volta, 'tools', 'user', 'platform.json')
    if (present(platform)) {
      try {
        const json = JSON.parse(readFileSync(platform, 'utf8')) as { node?: { runtime?: unknown } }
        const runtime = json?.node?.runtime
        if (typeof runtime === 'string') keep.push(plain(runtime))
      } catch (err) {
        unknown.volta.push(`Volta's default could not be read from ${platform}: ${errorText(err)}`)
      }
    }
    // Volta's shim installs a pinned version it lacks, so it is not run: the version
    // it runs is Volta's default or a package.json pin, which are read already.
    if (kit.onPath('node') && !voltaShimFirst()) {
      const r = await kit.run(['node', '--version'], { cwd: ctx.cwd, signal: ctx.signal })
      const version = r.stdout.trim()
      if (r.ok && NODE_VERSION.test(version)) keep.push(plain(version))
      else {
        const why = `the node on PATH did not say its version`
        unknown.nvm.push(why)
        unknown.volta.push(why)
      }
    }
    return { keep, unknown }
  }

  /**
   * The row for a version no pin or default keeps; null when it was used in the
   * last {@link threshold} hours, {@link RELATIME_LAG_HOURS} more when its
   * folder is mounted `relatime`. Sized only when `measure` is set.
   */
  const row = (
    tool: Tool,
    name: string,
    unknown: readonly string[],
    relatime: boolean,
    measure: boolean,
  ): Row | null => {
    const path = join(versions[tool], name)
    const used = lastUsedMs(path)
    const hours = used === null ? null : Math.max(0, (Date.now() - used) / HOUR_MS)
    const limit = threshold + (relatime ? RELATIME_LAG_HOURS : 0)
    if (hours !== null && hours < limit) return null
    const bytes = measure ? kit.size(path) : null
    const what = tool === 'rustup' ? 'this toolchain' : 'this Node version'
    // The global packages npm installed into an nvm version go with it, and a re-download does not bring them back.
    const globals = tool === 'nvm' ? globalPackages(path) : []
    const lost =
      globals === null
        ? '; its global packages could not be listed'
        : globals.length > 0
          ? `; it holds global packages a re-download does not bring back: ${globals.join(', ')}`
          : ''
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
            : `; last used ${hoursText(hours)} hours ago (threshold ${threshold}` +
              (relatime ? `, plus ${RELATIME_LAG_HOURS} for a relatime mount)` : ')')) +
          lost,
        costDescription: lost === '' ? 're-download' : 'lost',
        ...(bytes === null ? {} : { bytes }),
        evidence: { kind: 'toolchain', tool, name, path },
      }),
      blockers,
    }
  }

  /** The tools whose versions folder is there: rustup's only when rustup is on PATH. */
  const presentTools = (): Tool[] =>
    TOOLS.filter((t) => (t !== 'rustup' || kit.onPath('rustup')) && isDir(versions[t]))

  /**
   * How far each tool's versions folder can be trusted for last use, by its
   * mount: `noatime` not at all, `relatime` up to {@link RELATIME_LAG_HOURS}
   * late, else exactly; a mount whose options cannot be read is trusted.
   */
  const atimeModes = async (tools: readonly Tool[], ctx: Ctx): Promise<Map<Tool, AtimeMode>> => {
    const modes = await Promise.all(
      tools.map(async (tool): Promise<AtimeMode> => {
        let options: readonly string[] | null
        try {
          options = await mountOptions(versions[tool], ctx)
        } catch {
          options = null
        }
        if (options?.includes('noatime')) return 'noatime'
        if (options?.includes('relatime') && !options.includes('strictatime')) return 'relatime'
        return 'exact'
      }),
    )
    return new Map(tools.map((t, i) => [t, modes[i]!]))
  }

  /** The present tools, their mounts' {@link AtimeMode}, and those on a `noatime` mount. */
  const survey = async (ctx: Ctx) => {
    const tools = presentTools()
    const modes = await atimeModes(tools, ctx)
    return { tools, modes, noatime: tools.filter((t) => modes.get(t) === 'noatime') }
  }

  /**
   * Every toolchain no checkout asks for and nobody used lately, refused when
   * what is asked for could not be read; sized only when `measure` is set.
   * Only the versions of `only` when it is given.
   */
  const scan = async (ctx: Ctx, measure: boolean, only?: Tool): Promise<Row[]> => {
    if (!ctx.targetsGiven || ctx.targets.length === 0) return []
    // A version run daily on a noatime volume would read as unused, so none there is proposed.
    const { tools, modes, noatime } = await survey(ctx)
    const wanted = (t: Tool): boolean =>
      tools.includes(t) && !noatime.includes(t) && (only === undefined || only === t)
    if (!TOOLS.some(wanted)) return []
    const pins = await readPins(ctx.targets, ctx)
    const rows: Row[] = []
    const add = (tool: Tool, name: string, unknown: readonly string[]): void => {
      const r = row(tool, name, unknown, modes.get(tool) === 'relatime', measure)
      if (r !== null) rows.push(r)
    }

    const rust = wanted('rustup') ? installed(versions.rustup, RUST_RELEASE) : []
    const node = {
      nvm: installed(versions.nvm, NODE_VERSION),
      volta: installed(versions.volta, NODE_VERSION),
    }
    const nodeTools = (['nvm', 'volta'] as const).filter((t) => wanted(t) && node[t].length > 0)
    // nvm's `node` and `latest` name the newest version nvm has, not Volta's.
    const newest = node.nvm.map(plain).sort(byVersion).at(-1)
    const [rustKeep, inUse] = await Promise.all([
      // Why what rustup has in use could not be read, in place of the list.
      rust.length > 0 ? rustInUse(ctx).catch(errorText) : [],
      nodeTools.length > 0 ? nodeInUse(ctx, newest) : null,
    ])

    if (rust.length > 0) {
      const unknown = [...pins.rustUnknown]
      const keep = [...pins.rust]
      if (typeof rustKeep === 'string') {
        unknown.push(`what rustup has in use could not be read: ${rustKeep}`)
      } else keep.push(...rustKeep)
      for (const name of rust) {
        if (!keep.some((pin) => keeps(pin, name))) add('rustup', name, unknown)
      }
    }

    if (inUse !== null) {
      const unknown = [...pins.nodeUnknown]
      const keep = [...inUse.keep]
      for (const pin of pins.node) {
        const found = nodeSpec(pin, newest)
        if (found === null) {
          unknown.push(`a checkout asks for node ${JSON.stringify(pin)}, which names no version`)
        } else keep.push(...found)
      }
      for (const tool of nodeTools) {
        const refused = [
          ...unknown,
          ...(tool === 'volta' ? pins.voltaUnknown : []),
          ...inUse.unknown[tool],
        ]
        for (const name of node[tool]) {
          if (!keep.some((pin) => keeps(pin, plain(name)))) add(tool, name, refused)
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
    // A delete surveys again before it removes, so it may take a survey and an uninstall.
    limits: { discover: DISCOVER_LIMIT_MS, delete: DISCOVER_LIMIT_MS + UNINSTALL_LIMIT_MS },
    async detect(ctx) {
      if (presentTools().length === 0) return false
      if (!ctx.targetsGiven) return { active: true, note: NO_TARGETS_NOTE }
      const { noatime } = await survey(ctx)
      if (noatime.length === 0) return true
      return { active: true, note: noatime.map((t) => noatimeNote(versions[t])).join('; ') }
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
        if (r === undefined) return []
        return [
          ...objectionsTo(TOOLCHAINS_PLUGIN, r),
          objector(TOOLCHAINS_PLUGIN)(c, 'note', 'unsearched-folders', UNSEARCHED_NOTE),
        ]
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
      checkAgain(c, (await scan(ctx, false, tool)).find((r) => r.candidate.id === c.id))
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

/** The `toolchains` plugin as the command line builds it. */
export const toolchainsDefinition = definePlugin({
  name: TOOLCHAINS_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({ idleHours: idleHoursSetting }),
  create: ({ settings, kit, env }) => toolchainsPlugin(kit, env, { idleHours: settings.idleHours }),
})
