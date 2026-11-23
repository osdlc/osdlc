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
 * When any of that cannot be read (a pin such as `lts/*` with no nvm alias
 * for it, a checkout git cannot list, rustup failing to answer), every
 * candidate of that tool is refused, since what is unused cannot be told.
 * With no targets nothing is proposed. A toolchain that is a symlink (one
 * `rustup toolchain link` made) or whose name is not a release channel is
 * never proposed.
 *
 * Deleted with `rustup toolchain uninstall`; an nvm or Volta version folder
 * through `kit.remove`. Locations come from `RUSTUP_HOME`, `NVM_DIR` and
 * `VOLTA_HOME`, else their folders in `HOME`. No settings of its own.
 */

import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { Git, checkoutRoot, scanForCheckouts } from '@osdlc/typed-git'
import { z } from 'zod'

import type { Kit } from './kit.ts'
import { containedIn } from './roots.ts'
import {
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type Ctx,
  type Objection,
  type Plugin,
} from './types.ts'

export const TOOLCHAINS_PLUGIN = 'toolchains'

/** The files a checkout names its toolchain in, wherever they sit in it. */
const PIN_FILES = [
  'rust-toolchain',
  'rust-toolchain.toml',
  '.nvmrc',
  '.node-version',
  'package.json',
]

/** nvm's names for the newest version it has installed. */
const NEWEST = new Set(['node', 'stable', 'latest', 'current'])

/** A rustup release channel, then a date or a host triple: a name rustup installed, not one it was given by `link`. */
const RUST_RELEASE = /^(stable|beta|nightly|\d+\.\d+(\.\d+)?)(-|$)/
const NODE_VERSION = /^v?\d+\.\d+\.\d+$/

/** The longest a survey may take: it reads every checkout under the targets. */
const DISCOVER_LIMIT_MS = 10 * 60_000

/** The longest `rustup toolchain uninstall` may take. */
const UNINSTALL_LIMIT_MS = 5 * 60_000

type Tool = 'rustup' | 'nvm' | 'volta'

/** Where each tool keeps its versions. */
interface Homes {
  rustup: string
  nvm: string
  volta: string
}

const homesOf = (env: Readonly<Record<string, string | undefined>>): Homes => {
  const home = env.HOME ?? homedir()
  return {
    rustup: env.RUSTUP_HOME ?? join(home, '.rustup'),
    nvm: env.NVM_DIR ?? join(home, '.nvm'),
    volta: env.VOLTA_HOME ?? join(home, '.volta'),
  }
}

/** The folder each tool's versions sit in, one per version. */
const versionsDir = (tool: Tool, homes: Homes): string =>
  tool === 'rustup'
    ? join(homes.rustup, 'toolchains')
    : tool === 'nvm'
      ? join(homes.nvm, 'versions', 'node')
      : join(homes.volta, 'tools', 'image', 'node')

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
    if (name === 'rust-toolchain' || name === 'rust-toolchain.toml') {
      const pin = rustPin(text)
      if (pin !== null) pins.rust.add(pin)
      return
    }
    const pin = name === 'package.json' ? voltaPin(text) : firstLine(text) || null
    if (pin !== null) pins.node.add(pin.replace(/^v/, ''))
  }
  const read = (file: string): void => {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      const why = `${file} could not be read`
      ;(basename(file).startsWith('rust-') ? pins.rustUnknown : pins.nodeUnknown).push(why)
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
    for (const f of ['rust-toolchain', 'rust-toolchain.toml', '.nvmrc', '.node-version']) {
      read(join(dir, f))
    }
    if (dirname(dir) === dir) break
  }
  return pins
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Whether the pin `pin` keeps the version `name`: the same, or `name` is `pin` with more after a `-` or a `.`. */
export const keeps = (pin: string, name: string): boolean =>
  name === pin || name.startsWith(`${pin}-`) || name.startsWith(`${pin}.`)

/** A candidate and the refusals it rests on. */
interface Row {
  candidate: Candidate
  blockers: Array<{ code: string; reason: string }>
}

/** The `toolchains` plugin on `kit`; `env` is where each tool keeps its versions (`HOME`, `RUSTUP_HOME`, `NVM_DIR`, `VOLTA_HOME`). */
function toolchainsPlugin(kit: Kit, env: Readonly<Record<string, string | undefined>>): Plugin {
  const homes = homesOf(env)
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
    const overrides = (await rustup(['override', 'list'], ctx)).filter((l) => l !== 'no overrides')
    const fromEnv = env.RUSTUP_TOOLCHAIN?.trim()
    return [
      ...(await rustup(['default'], ctx)).slice(0, 1).map((l) => l.split(/\s+/)[0]!),
      ...overrides.map(lastWord),
      ...(fromEnv ? [fromEnv] : []),
    ]
  }

  /** `spec` as the versions it keeps, through nvm's aliases; null when it cannot be told. */
  const nodeSpec = (spec: string, newest: string | undefined, hops = 0): string[] | null => {
    const s = spec.replace(/^v/, '')
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
    if (lstatSync(nvmDefault, { throwIfNoEntry: false }) !== undefined) {
      const found = nodeSpec('default', newest)
      if (found === null) unknown.push(`nvm's default alias names no version it has`)
      else keep.push(...found)
    }
    const platform = join(homes.volta, 'tools', 'user', 'platform.json')
    if (lstatSync(platform, { throwIfNoEntry: false }) !== undefined) {
      try {
        const json = JSON.parse(readFileSync(platform, 'utf8')) as { node?: { runtime?: unknown } }
        const runtime = json?.node?.runtime
        if (typeof runtime === 'string') keep.push(runtime.replace(/^v/, ''))
      } catch (err) {
        unknown.push(`Volta's default could not be read from ${platform}: ${message(err)}`)
      }
    }
    if (kit.onPath('node')) {
      const r = await kit.run(['node', '--version'], { cwd: ctx.cwd, signal: ctx.signal })
      const version = r.stdout.trim()
      if (r.ok && NODE_VERSION.test(version)) keep.push(version.replace(/^v/, ''))
      else unknown.push(`the node on PATH did not say its version`)
    }
    return { keep, unknown }
  }

  const row = (tool: Tool, name: string, unknown: readonly string[]): Row => {
    const path = join(versionsDir(tool, homes), name)
    const bytes = kit.size(path)
    return {
      candidate: kit.candidate({
        kind: tool === 'rustup' ? 'rust-toolchain' : 'node-version',
        path,
        name,
        why: `no checkout in the targets asks for ${tool === 'rustup' ? 'this toolchain' : 'this Node version'}, and it is not the default or in use`,
        costDescription: 're-download',
        ...(bytes === null ? {} : { bytes }),
        evidence: { kind: 'toolchain', tool, name, path },
      }),
      blockers: unknown.map((reason) => ({ code: 'unused-unknown', reason })),
    }
  }

  /** Every toolchain no checkout asks for, refused when what is asked for could not be read. */
  const scan = async (ctx: Ctx): Promise<Row[]> => {
    if (ctx.targets.length === 0) return []
    const pins = readPins(ctx.targets, ctx.cwd)
    const rows: Row[] = []

    const rust = kit.onPath('rustup') ? installed(versionsDir('rustup', homes), RUST_RELEASE) : []
    if (rust.length > 0) {
      const unknown = [...pins.rustUnknown]
      const keep = [...pins.rust]
      try {
        keep.push(...(await rustInUse(ctx)))
      } catch (err) {
        unknown.push(`what rustup has in use could not be read: ${message(err)}`)
      }
      for (const name of rust) {
        if (!keep.some((pin) => keeps(pin, name))) rows.push(row('rustup', name, unknown))
      }
    }

    const node = {
      nvm: installed(versionsDir('nvm', homes), NODE_VERSION),
      volta: installed(versionsDir('volta', homes), NODE_VERSION),
    }
    if (node.nvm.length + node.volta.length > 0) {
      const plain = (v: string): string => v.replace(/^v/, '')
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
        for (const name of node[tool]) {
          if (!keep.some((pin) => keeps(pin, plain(name)))) rows.push(row(tool, name, unknown))
        }
      }
    }
    return rows
  }

  /** The tool a candidate's folder belongs to, from where it sits; null when it sits in none of them. */
  const toolOf = (path: string): Tool | null =>
    (['rustup', 'nvm', 'volta'] as const).find((t) => dirname(path) === versionsDir(t, homes)) ??
    null

  let rows = new Map<string, Row>()

  return {
    name: TOOLCHAINS_PLUGIN,
    limits: { discover: DISCOVER_LIMIT_MS },
    detect: () =>
      (kit.onPath('rustup') && isDir(versionsDir('rustup', homes))) ||
      isDir(versionsDir('nvm', homes)) ||
      isDir(versionsDir('volta', homes)),
    roots: () => (['rustup', 'nvm', 'volta'] as const).map((t) => versionsDir(t, homes)),
    async discover(ctx) {
      const found = await scan(ctx)
      rows = new Map(found.map((r) => [r.candidate.id, r]))
      return found.map((r) => r.candidate)
    },
    object: (all) =>
      all.flatMap((c): Objection[] => {
        const r = c.owner === TOOLCHAINS_PLUGIN ? rows.get(c.id) : undefined
        return (r?.blockers ?? []).map((b) => ({
          by: TOOLCHAINS_PLUGIN,
          candidate: c.id,
          level: 'refuse',
          code: b.code,
          reason: b.reason,
        }))
      }),
    async delete(c, ctx) {
      const path = c.path
      if (path === undefined) throw new Error(`${c.id} is not a toolchain folder`)
      const tool = toolOf(path)
      if (tool === null || containedIn([versionsDir(tool, homes)], path) === null) {
        throw new Error(`${path} is not a version folder of rustup, nvm or Volta`)
      }
      const stat = lstatSync(path, { throwIfNoEntry: false })
      if (stat === undefined) return `already gone: ${path}`
      // `rustup toolchain uninstall` would remove what a link leads to.
      if (!stat.isDirectory()) throw new Error(`${path} is no longer a folder`)
      // A checkout may have pinned it, or it may have become the default, since the survey.
      const now = (await scan(ctx)).find((r) => r.candidate.id === c.id)
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
      if (lstatSync(path, { throwIfNoEntry: false }) !== undefined) {
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

/** The `toolchains` plugin as the command line builds it: no settings of its own. */
export const toolchainsDefinition = definePlugin({
  name: TOOLCHAINS_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({}),
  create: ({ kit, env }) => toolchainsPlugin(kit, env),
})
