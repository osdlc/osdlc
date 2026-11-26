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

import { which } from '@osdlc/command-seam'
import { sameFingerprint } from '@osdlc/repo-cleaner'
import { AsyncGit, checkoutRoot, scanForCheckouts, type LsFilesOptions } from '@osdlc/typed-git'
import { z } from 'zod'

import {
  DISCOVER_LIMIT_MS,
  checkAgain,
  errorText,
  failureReason,
  hoursText,
  isObject,
  objectionsTo,
  objector,
  realOr,
  str,
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

/**
 * How long after the pin files were listed a `delete` still reads that list
 * instead of listing every checkout again. Whatever it lists is read afresh.
 */
const LISTING_MS = 60_000

/** The longest `rustup toolchain uninstall` may take. */
const UNINSTALL_LIMIT_MS = 5 * 60_000

const HOUR_MS = 3_600_000

/** How late a `relatime` mount may record a use: it updates an access time at most once a day. */
const RELATIME_LAG_HOURS = 24

/** How far a versions folder's access times can be trusted, by its mount's options. */
type AtimeMode = 'noatime' | 'capped' | 'relatime' | 'exact'

/** What {@link Detection.note} says when the targets are the run's folder, taken because none were given. */
export const NO_TARGETS_NOTE =
  'no targets were given (the folder it runs from is not enough), so it proposes nothing'

/**
 * How many levels below a target are searched for checkouts: deep enough for
 * a bare repository's own folders, bounded against a symlink loop.
 */
const SEARCH_DEPTH = 8

/** How many levels below a folder a checkout does not track are searched for repositories. */
const UNTRACKED_DEPTH = 3

/** The note on every candidate: where the search for pins does not look. */
export const UNSEARCHED_NOTE =
  "checkouts are not searched for in folders whose names start with a dot, in folders a checkout's git ignores, " +
  `more than ${UNTRACKED_DEPTH} levels down in a folder it does not track, or, when the home folder is a repository, ` +
  'in what it does not track outside the targets'

/** What {@link Detection.note} says when the versions folder `dir` is on a volume mounted `noatime`. */
export const noatimeNote = (dir: string): string =>
  `${dir} is on a volume mounted noatime, so last use can't be measured and every version in it is kept`

/**
 * What {@link Detection.note} says when the versions folder `dir` is on macOS
 * and not mounted `strictatime`: there a file's access time stops moving once
 * it is newer than its modified time, so it cannot show a recent use.
 */
export const cappedAtimeNote = (dir: string): string =>
  `${dir} is on a macOS volume, which stops updating a file's access time once it is newer than its modified time, ` +
  "so last use can't be measured and every version in it is kept"

const TOOLS = ['rustup', 'nvm', 'volta'] as const
type Tool = (typeof TOOLS)[number]

/** Where each tool keeps its versions. */
type Homes = Record<Tool, string>

/** Where each tool keeps its versions; a variable set empty counts as unset, as the tools read it. */
const homesOf = (env: Readonly<Record<string, string | undefined>>): Homes => {
  const home = env.HOME || homedir()
  return {
    rustup: env.RUSTUP_HOME || join(home, '.rustup'),
    nvm: env.NVM_DIR || join(home, '.nvm'),
    volta: env.VOLTA_HOME || join(home, '.volta'),
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

/**
 * The version a `package.json` pins for Volta and the file it extends, each
 * null when it names none. Throws when it is not JSON, unless it names no
 * `volta`: a fixture or a template, which pins nothing.
 */
function voltaPin(text: string): { node: string | null; extends: string | null } {
  let json: unknown
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (err) {
    if (text.includes('"volta"')) throw err
  }
  const volta = isObject(json) && isObject(json.volta) ? json.volta : {}
  return { node: str(volta.node).trim() || null, extends: str(volta.extends).trim() || null }
}

/** What every git call is given: the hook's signal, and a locale {@link brokenGit} can read. */
const gitCall = (ctx: Ctx) => ({ signal: ctx.signal, env: { LC_ALL: 'C' } })

/**
 * Whether git failed because a folder's `.git` is no repository: a pruned
 * worktree's, or an empty one. Of a `.git` file naming a folder that is gone,
 * git 2.56 says it "does not point to a valid repository", older git "not a git repository".
 */
const brokenGit = (err: unknown): boolean =>
  /not a git repository|invalid gitfile format|gitfile does not point to a valid repository/.test(
    errorText(err),
  )

/** Whether the folder `dir` is or holds `path`, by real path. */
const holds = (dir: string, path: string): boolean =>
  realOr(dir) === realOr(path) || containedIn([dir], path) !== null

/** The folder `target` leads to; null, with why in `unknown`, when it is not a folder that can be read. */
function targetFolder(target: string, unknown: string[]): string | null {
  try {
    readdirSync(target)
    return realOr(target)
  } catch (err) {
    unknown.push(`the target ${target} could not be read: ${errorText(err)}`)
    return null
  }
}

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

/**
 * Every checkout under the targets, with each repository's worktrees: the
 * repository a target is in (the whole of it, as the cargo and node plugins
 * read it) and those found below a target, whatever links lead to it; plus
 * why one may have been missed.
 */
async function checkoutsUnder(ctx: Ctx): Promise<{ checkouts: string[]; unknown: string[] }> {
  const found = new Set<string>()
  const unknown: string[] = []
  for (const target of ctx.targets) {
    const dir = targetFolder(target, unknown)
    if (dir === null) continue
    for (const at of [target, dir]) {
      const root = checkoutRoot(at)
      if (root !== null) found.add(root)
    }
    for (const checkout of scanUnder(dir, unknown)) found.add(checkout)
  }
  const out = new Set<string>()
  for (const checkout of found) {
    if (out.has(checkout)) continue
    await yieldToLimit(ctx)
    for (const tree of await worktreesOf(checkout, ctx, unknown)) out.add(tree)
  }
  return { checkouts: [...out].sort(), unknown }
}

/**
 * The worktrees of the repository `checkout` is in, bare ones aside: a
 * worktree lists every worktree of its repository, a bare one's too. Just
 * `checkout` when its `.git` is broken; none, with why in `unknown`, when git
 * fails otherwise.
 */
async function worktreesOf(checkout: string, ctx: Ctx, unknown: string[]): Promise<string[]> {
  try {
    return (await new AsyncGit(checkout).worktrees(gitCall(ctx)))
      .filter((tree) => !tree.bare && isDir(tree.path))
      .map((tree) => tree.path)
  } catch (err) {
    if (brokenGit(err)) return [checkout]
    unknown.push(`the worktrees of ${checkout} could not be listed: ${errorText(err)}`)
    return []
  }
}

/** The pin files named in a checkout, and the checkouts inside it that are read on their own. */
interface Found {
  files: string[]
  nested: string[]
}

/**
 * What git lists in `checkout`: the pin files at its root and wherever one
 * sits below it, ignored ones aside, and the repositories git does not list
 * the files of, its submodules and those in folders it does not track. What
 * it does not track is looked for only in the folders `within`, when given.
 */
async function listedIn(
  checkout: string,
  within: readonly string[] | null,
  ctx: Ctx,
): Promise<Found> {
  const git = new AsyncGit(checkout)
  const call = gitCall(ctx)
  const paths = PIN_FILES.map((f) => `:(glob)**/${f}`)
  const others = { ...call, others: true, excludeStandard: true }
  const files = PIN_FILES.map((f) => join(checkout, f))
  const list = async (dir: string, opts: LsFilesOptions): Promise<void> => {
    for (const rel of await git.at(dir).lsFiles({ ...call, ...opts, paths })) {
      files.push(join(dir, rel))
    }
  }
  if (within === null) await list(checkout, { ...others, cached: true })
  else {
    await list(checkout, { cached: true })
    for (const dir of within) await list(dir, others)
  }
  const nested = (await git.submodules(call))
    .map((s) => join(checkout, s.path))
    .filter((dir) => present(join(dir, '.git')))
  for (const dir of within ?? [checkout]) {
    const untracked = await git.at(dir).lsFiles({ ...others, directory: true })
    // The walk's depth limit is not a reason to refuse here: an untracked folder is more often data than repositories.
    for (const rel of untracked.filter((r) => r.endsWith('/'))) {
      const scan = scanForCheckouts(join(dir, rel), { maxDepth: UNTRACKED_DEPTH, onWarn: () => {} })
      nested.push(...scan.checkouts)
    }
  }
  return { files, nested }
}

/** How many folders {@link walked} reads between two yields to the hook's time limit. */
const WALK_YIELD_EVERY = 100

/**
 * What {@link listedIn} gives, for a folder whose `.git` is broken: git lists
 * nothing there, so everything in it is read but `.git` and `node_modules`
 * folders, links not followed; below its root, only the folders `within`,
 * when given. It yields to the hook's time limit as it goes. Throws when a
 * folder cannot be read.
 */
async function walked(
  checkout: string,
  within: readonly string[] | null,
  ctx: Ctx,
): Promise<Found> {
  const files = within === null ? [] : PIN_FILES.map((f) => join(checkout, f))
  const nested: string[] = []
  const queue = [...(within ?? [checkout])]
  for (let read = 0, dir = queue.shift(); dir !== undefined; read++, dir = queue.shift()) {
    if (read % WALK_YIELD_EVERY === 0) await yieldToLimit(ctx)
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (!entry.isDirectory()) {
        if (PIN_FILES.includes(entry.name)) files.push(path)
      } else if (entry.name === '.git' || entry.name === 'node_modules') continue
      else if (present(join(path, '.git'))) nested.push(path)
      else queue.push(path)
    }
  }
  return { files, nested }
}

/** The files every checkout under the targets may name its toolchain in, and why one may have been missed. */
interface Listing {
  files: string[]
  unknown: string[]
}

/** Lists the pin files of every checkout under the targets. A repository that is or holds `home` is searched for untracked files only in the targets. */
async function listPins(ctx: Ctx, home: string): Promise<Listing> {
  const { checkouts, unknown } = await checkoutsUnder(ctx)
  const withinOf = (checkout: string): string[] | null =>
    !holds(checkout, home) || ctx.targets.some((t) => holds(t, checkout))
      ? null
      : ctx.targets.map(realOr).filter((t) => isDir(t) && holds(checkout, t))
  const files = new Set<string>()
  const queue = [...checkouts]
  const seen = new Set(queue)
  for (let checkout = queue.shift(); checkout !== undefined; checkout = queue.shift()) {
    await yieldToLimit(ctx)
    let found: Found
    const within = withinOf(checkout)
    try {
      try {
        found = await listedIn(checkout, within, ctx)
      } catch (err) {
        if (!brokenGit(err)) throw err
        found = await walked(checkout, within, ctx)
      }
    } catch (err) {
      ctx.signal.throwIfAborted()
      unknown.push(`${checkout} could not be listed: ${errorText(err)}`)
      continue
    }
    for (const file of found.files) files.add(file)
    // A nested repository's linked worktrees may sit outside the targets, on branches with pins of their own.
    for (const nested of found.nested) {
      if (seen.has(nested)) continue
      for (const tree of [nested, ...(await worktreesOf(nested, ctx, unknown))]) {
        if (!seen.has(tree)) {
          seen.add(tree)
          queue.push(tree)
        }
      }
    }
  }
  return { files: [...files].sort(), unknown }
}

/** What the files of `listing`, and those in the run's folder and above it, ask for now. */
function readPins(listing: Listing, cwd: string): Pins {
  const pins: Pins = {
    rust: new Set(),
    node: new Set(),
    rustUnknown: [...listing.unknown],
    nodeUnknown: [...listing.unknown],
    voltaUnknown: [],
  }
  const seen = new Set<string>()
  const read = (file: string, name = basename(file)): void => {
    if (seen.has(file)) return
    seen.add(file)
    const rust = RUST_PIN_FILES.includes(name)
    const volta = name === 'package.json'
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      const unknown = rust ? pins.rustUnknown : volta ? pins.voltaUnknown : pins.nodeUnknown
      unknown.push(`${file} could not be read`)
      return
    }
    if (!volta) {
      const pin = rust ? rustPin(text) : firstLine(text) || null
      if (pin !== null) (rust ? pins.rust : pins.node).add(rust ? pin : plain(pin))
      return
    }
    try {
      const pin = voltaPin(text)
      if (pin.node !== null) pins.node.add(plain(pin.node))
      if (pin.extends !== null) read(resolve(dirname(file), pin.extends), 'package.json')
    } catch {
      // It may hide a Volta pin.
      pins.voltaUnknown.push(`${file} is not JSON`)
    }
  }

  for (const file of listing.files) read(file)
  // The run's folder and those above it decide what is in use there, as rustup, nvm and Volta look up.
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    for (const f of PIN_FILES) read(join(dir, f))
    if (dirname(dir) === dir) break
  }
  return pins
}

/** The packages that come with every Node version, which a re-download brings back. */
const BUNDLED_PACKAGES = new Set(['npm', 'corepack'])

/**
 * The global packages installed into the Node version folder `dir`, those
 * that come with Node aside; null when they cannot be listed.
 */
export function globalPackages(dir: string): string[] | null {
  const modules = join(dir, 'lib', 'node_modules')
  const names = (at: string): string[] => readdirSync(at).filter((n) => !n.startsWith('.'))
  try {
    if (!present(modules)) return []
    return names(modules)
      .filter((n) => !BUNDLED_PACKAGES.has(n))
      .flatMap((n) => {
        // A scope's own folder counts when it is empty: what was in it cannot be told.
        const scoped = n.startsWith('@') ? names(join(modules, n)) : []
        return scoped.length === 0 ? [n] : scoped.map((m) => `${n}/${m}`)
      })
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
  /**
   * The platform the versions folders are on. On `darwin` access times are
   * not trusted unless the mount is `strictatime`. Default: `process.platform`.
   */
  platform?: NodeJS.Platform | undefined
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
  const platform = opts.platform ?? process.platform
  const mountOptions = opts.mountOptions ?? mountOptionsBy(kit, platform)
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
        if (/no default toolchain (is )?configured/.test(errorText(err))) return []
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

  /** Whether `node` is Volta's shim: in its `bin`, or a link to the shim itself. */
  const isVoltaShim = (node: string): boolean =>
    present(node) &&
    (realOr(dirname(node)) === realOr(join(homes.volta, 'bin')) ||
      basename(realOr(node)).startsWith('volta-shim'))

  /**
   * The version the `node` on `PATH` says it is, Volta's shim passed over: it
   * installs a pinned version it lacks, and what it runs is Volta's default,
   * a `package.json` pin, both read from their files, or the next `node`.
   * Undefined when there is no other `node`, null when it did not say.
   */
  const nodeOnPath = async (ctx: Ctx): Promise<string | null | undefined> => {
    const dirs = (env.PATH ?? process.env.PATH ?? '').split(delimiter)
    const rest = dirs.filter((d) => !isVoltaShim(join(d, 'node')))
    const shimmed = rest.length < dirs.length
    const PATH = rest.join(delimiter)
    const found = shimmed
      ? PATH !== '' && which('node', { cwd: ctx.cwd, env: { ...env, PATH } }) !== undefined
      : kit.onPath('node')
    if (!found) return undefined
    const r = await kit.run(['node', '--version'], {
      cwd: ctx.cwd,
      signal: ctx.signal,
      ...(shimmed ? { env: { PATH } } : {}),
    })
    const version = r.stdout.trim()
    return r.ok && NODE_VERSION.test(version) ? plain(version) : null
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
    const version = await nodeOnPath(ctx)
    if (version === null) {
      const why = `the node on PATH did not say its version`
      unknown.nvm.push(why)
      unknown.volta.push(why)
    } else if (version !== undefined) keep.push(version)
    return { keep, unknown }
  }

  /** Hours since the version in `path` was last used ({@link lastUsedMs}), by the kit's clock; null when it cannot be told. */
  const hoursUnused = (path: string): number | null => {
    const used = lastUsedMs(path)
    return used === null ? null : Math.max(0, (kit.now().getTime() - used) / HOUR_MS)
  }

  /**
   * Whether `hours` unused is past {@link threshold}, {@link RELATIME_LAG_HOURS}
   * more on a `relatime` mount; true when it cannot be told, which refuses it.
   */
  const idle = (hours: number | null, relatime: boolean): boolean =>
    hours === null || hours >= threshold + (relatime ? RELATIME_LAG_HOURS : 0)

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
    const hours = hoursUnused(path)
    if (!idle(hours, relatime)) return null
    const bytes = measure ? kit.size(path) : null
    const what = tool === 'rustup' ? 'this toolchain' : 'this Node version'
    // The global packages npm installed into a Node version go with it, and a re-download does not bring them back.
    const globals = tool === 'rustup' ? [] : globalPackages(path)
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
        evidence: {
          kind: 'toolchain',
          tool,
          name,
          path,
          ...(lost === '' ? {} : { globalPackages: globals }),
        },
      }),
      blockers,
    }
  }

  /** The tools whose versions folder is there: rustup's only when rustup is on PATH. */
  const presentTools = (): Tool[] =>
    TOOLS.filter((t) => (t !== 'rustup' || kit.onPath('rustup')) && isDir(versions[t]))

  /**
   * How far each tool's versions folder can be trusted for last use, by its
   * mount: `noatime` not at all, nor on macOS unless `strictatime`, `relatime`
   * up to {@link RELATIME_LAG_HOURS} late, else exactly; elsewhere a mount whose
   * options cannot be read is trusted.
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
        if (platform === 'darwin' && !options?.includes('strictatime')) return 'capped'
        if (options?.includes('relatime') && !options.includes('strictatime')) return 'relatime'
        return 'exact'
      }),
    )
    return new Map(tools.map((t, i) => [t, modes[i]!]))
  }

  /**
   * The present tools, `only` that one when it is given, their mounts'
   * {@link AtimeMode}, and those whose last use cannot be measured
   * (`noatime`, or macOS's `capped`).
   */
  const survey = async (ctx: Ctx, only?: Tool) => {
    const tools = presentTools().filter((t) => only === undefined || only === t)
    const modes = await atimeModes(tools, ctx)
    const unmeasured = tools.filter((t) => modes.get(t) === 'noatime' || modes.get(t) === 'capped')
    return { tools, modes, unmeasured }
  }

  /** The last listing, the targets it is of, and when it was made. */
  let listed: { listing: Listing; targets: string; at: number } | undefined

  /** The pin files under the targets: those of the last listing when `again` and it is younger than {@link LISTING_MS}, else listed now. */
  const listing = async (ctx: Ctx, again: boolean): Promise<Listing> => {
    const targets = ctx.targets.join('\0')
    const age = listed === undefined ? -1 : Date.now() - listed.at
    if (again && listed?.targets === targets && age >= 0 && age < LISTING_MS) return listed.listing
    const found = await listPins(ctx, ctx.home || env.HOME || homedir())
    listed = { listing: found, targets, at: Date.now() }
    return found
  }

  /**
   * Every toolchain no checkout asks for and nobody used lately, refused when
   * what is asked for could not be read; sized only when `measure` is set.
   * With `only`, for a delete, the versions of that tool, by a recent listing
   * of the checkouts ({@link LISTING_MS}); everything else is read again.
   */
  const scan = async (ctx: Ctx, measure: boolean, only?: Tool): Promise<Row[]> => {
    if (!ctx.targetsGiven || ctx.targets.length === 0) return []
    // A version run daily where access times do not show it would read as unused, so none there is proposed.
    const { tools, modes, unmeasured } = await survey(ctx, only)
    const wanted = (t: Tool): boolean => tools.includes(t) && !unmeasured.includes(t)
    if (!TOOLS.some(wanted)) return []
    const relatime = (t: Tool): boolean => modes.get(t) === 'relatime'
    const rust = wanted('rustup') ? installed(versions.rustup, RUST_RELEASE) : []
    const node = {
      nvm: installed(versions.nvm, NODE_VERSION),
      volta: installed(versions.volta, NODE_VERSION),
    }
    const nodeTools = (['nvm', 'volta'] as const).filter((t) => wanted(t) && node[t].length > 0)
    // Listing the checkouts is the costly part: with no version idle there is nothing for it to keep.
    const anyIdle = (tool: Tool, names: readonly string[]): boolean =>
      names.some((n) => idle(hoursUnused(join(versions[tool], n)), relatime(tool)))
    if (!anyIdle('rustup', rust) && !nodeTools.some((t) => anyIdle(t, node[t]))) return []
    const pins = readPins(await listing(ctx, only !== undefined), ctx.cwd)
    const rows: Row[] = []
    const add = (tool: Tool, name: string, unknown: readonly string[]): void => {
      const r = row(tool, name, unknown, relatime(tool), measure)
      if (r !== null) rows.push(r)
    }

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
      const { modes, unmeasured } = await survey(ctx)
      if (unmeasured.length === 0) return true
      const note = (t: Tool): string =>
        (modes.get(t) === 'noatime' ? noatimeNote : cappedAtimeNote)(versions[t])
      return { active: true, note: unmeasured.map(note).join('; ') }
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
      const now = (await scan(ctx, false, tool)).find((r) => r.candidate.id === c.id)
      checkAgain(c, now)
      // A global package may have been installed into it, which its loss was not allowed for.
      if (!sameFingerprint(now.candidate.evidence, c.evidence)) {
        throw new Error(`${path} changed: ${now.candidate.why}`)
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

/** The `toolchains` plugin as the command line builds it. */
export const toolchainsDefinition = definePlugin({
  name: TOOLCHAINS_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({ idleHours: idleHoursSetting }),
  create: ({ settings, kit, env }) => toolchainsPlugin(kit, env, { idleHours: settings.idleHours }),
})
