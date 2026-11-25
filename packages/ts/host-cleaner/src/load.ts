/**
 * Code plugins loaded from packages (tier 3). Only a package the config names
 * in `plugins.<name>.package` is loaded, and only by its npm name: never a
 * path, and never from a checkout. It is looked for in each folder of
 * {@link packageRoots}, in order.
 *
 * A package is checked as it loads ({@link loadPackage}) and when it creates
 * its plugin ({@link checked}). Only this host-cleaner's `definePlugin` ties a
 * plugin to the kit it was given. A failed check is a {@link PackageFailure}:
 * the CLI warns for it in `status`, and refuses `clean` unless the plugin is
 * skipped.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { z } from 'zod'

import { byName } from './helpers.ts'
import { builtOn } from './kit.ts'
import { HOOKS, PLUGIN_API, type Plugin, type PluginDefinition } from './types.ts'

/** An npm package name: lowercase, optionally scoped, with no path in it. */
const PACKAGE_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/

/** host-cleaner's own package folder, by real path: the parent of `src/` and `dist/`. */
const HOST_CLEANER_DIR = realpathSync(fileURLToPath(new URL('../', import.meta.url)))

/** A `plugins.<name>.package` that can't name a package: exit 2 for every phase, skipped or not. */
export class PackageError extends Error {
  override name = 'PackageError'
}

/** One `plugins.<name>` entry that has a `package`. */
export interface PackageEntry {
  /** The config key, which the plugin's `name` must equal. */
  name: string
  /** The npm package name. */
  package: string
}

/** A plugin loaded from a package. */
export interface LoadedPackage extends PackageEntry {
  /** The package's `version`, or undefined when its `package.json` has none. */
  version: string | undefined
  /** The package's folder. */
  path: string
  /** Its default export, with `create` checking the plugin it returns. */
  definition: PluginDefinition
}

/** A package that did not load; `reason` starts `plugins.<name>.package`. */
export interface PackageFailure extends PackageEntry {
  reason: string
}

/** A package plugin's `create` gave a plugin the core can't use. */
export class PackageLoadError extends Error {
  override name = 'PackageLoadError'
  readonly failure: PackageFailure
  constructor(failure: PackageFailure) {
    super(failure.reason)
    this.failure = failure
  }
}

/** The definitions {@link loadPackages} made, so the core can tell a package's plugin from a built-in. */
const fromPackage = new WeakSet<PluginDefinition>()

/** Whether `def` was loaded from a package. */
export const isPackaged = (def: PluginDefinition): boolean => fromPackage.has(def)

/**
 * The `node_modules` folders a package is looked for in, in order: those
 * above host-cleaner's own folder (`from`), as Node resolves host-cleaner's
 * own imports, then the global prefix's. The prefix is `npm_config_prefix`
 * when set and not empty, else npm's default: `%APPDATA%\npm` on Windows, and the one Node
 * is installed under elsewhere or without `APPDATA`.
 */
export function packageRoots(
  env: Readonly<Record<string, string | undefined>>,
  from: string = HOST_CLEANER_DIR,
): string[] {
  const roots: string[] = []
  for (let dir = from; ; dir = dirname(dir)) {
    if (basename(dir) !== 'node_modules') roots.push(join(dir, 'node_modules'))
    if (dirname(dir) === dir) break
  }
  const windows = process.platform === 'win32'
  // An empty prefix is unset, as npm reads it: it would make the root relative to the cwd.
  const prefix =
    (env.npm_config_prefix === '' ? undefined : env.npm_config_prefix) ??
    (!windows
      ? dirname(dirname(process.execPath))
      : env.APPDATA !== undefined
        ? join(env.APPDATA, 'npm')
        : dirname(process.execPath))
  const global = windows ? join(prefix, 'node_modules') : join(prefix, 'lib', 'node_modules')
  return roots.includes(global) ? roots : [...roots, global]
}

/**
 * The entries of the config's `plugins` that have a `package`, by name.
 * `taken` says which plugin already has a name, a built-in or a descriptor.
 *
 * @throws PackageError for a `package` that is not an npm package name, or a name another plugin has
 */
export function packageEntries(
  plugins: Readonly<Record<string, Record<string, unknown>>>,
  taken: (name: string) => string | undefined,
): PackageEntry[] {
  const entries: PackageEntry[] = []
  for (const [name, entry] of Object.entries(plugins)) {
    if (!Object.hasOwn(entry, 'package')) continue
    const pkg = entry.package
    if (typeof pkg !== 'string' || !PACKAGE_NAME.test(pkg)) {
      throw new PackageError(
        `plugins.${name}.package: ${JSON.stringify(pkg)} is not an npm package name; host-cleaner loads a plugin only by the name it is installed under, never from a path`,
      )
    }
    const other = taken(name)
    if (other !== undefined) {
      throw new PackageError(
        `plugins.${name}.package: ${name} is ${other}; every plugin has its own name, so a package plugin needs another`,
      )
    }
    entries.push({ name, package: pkg })
  }
  return entries.sort(byName)
}

/** The `exports` conditions Node matches for an `import`. */
const IMPORT_CONDITIONS = ['node', 'import', 'module-sync', 'default']

type Manifest = { version?: unknown; exports?: unknown; main?: unknown }

/** The file `exports` gives for `.`, as `import` resolves it under Node. */
function exported(exports: unknown): string | undefined {
  if (typeof exports === 'string') return exports
  if (Array.isArray(exports)) {
    for (const e of exports) {
      const file = exported(e)
      if (file !== undefined) return file
    }
    return undefined
  }
  if (exports === null || typeof exports !== 'object') return undefined
  const map = exports as Record<string, unknown>
  if (Object.keys(map).some((k) => k.startsWith('.'))) return exported(map['.'])
  // As Node does: the first key, in the package's order, that is a condition it matches.
  for (const [condition, target] of Object.entries(map)) {
    if (!IMPORT_CONDITIONS.includes(condition)) continue
    const file = exported(target)
    if (file !== undefined) return file
  }
  return undefined
}

/** The file `import '<package>'` loads from the package folder `dir`. */
function entryOf(dir: string, manifest: Manifest): string | undefined {
  if (manifest.exports !== undefined) {
    const file = exported(manifest.exports)
    return file === undefined ? undefined : join(dir, file)
  }
  if (typeof manifest.main === 'string') {
    const main = join(dir, manifest.main)
    const file = LEGACY_MAIN_SUFFIXES.map((s) => main + s).find(isFile)
    if (file !== undefined) return file
  }
  return join(dir, 'index.js')
}

/** What Node tries after a legacy `main`, in its order: the file, with an extension, then the folder's index. */
const LEGACY_MAIN_SUFFIXES = [
  '',
  '.js',
  '.json',
  '.node',
  '/index.js',
  '/index.json',
  '/index.node',
]

const isFile = (path: string): boolean =>
  statSync(path, { throwIfNoEntry: false })?.isFile() === true

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

/** Why `x` is not a `definePlugin` definition, or undefined when it is one. */
function notADefinition(x: unknown): string | undefined {
  if (!isObject(x)) return 'has no default export'
  if (typeof x.name !== 'string') return 'default export has no string name'
  if (typeof x.create !== 'function') return 'default export has no create function'
  if (
    !isObject(x.settings) ||
    typeof (x.settings as { safeExtend?: unknown }).safeExtend !== 'function'
  )
    return 'default export has no zod object settings'
  return undefined
}

/**
 * What is wrong with the hooks or `limits` of `plugin`, or undefined when
 * nothing is. Checked up front because a broken hook would otherwise fail only
 * when the core calls it, and `clean` would go on without its objections.
 */
function misshapenHooks(plugin: Record<string, unknown>): string | undefined {
  for (const hook of HOOKS) {
    const f = plugin[hook]
    if (hook === 'detect' ? typeof f !== 'function' : f !== undefined && typeof f !== 'function') {
      return `${hook} is ${f === undefined ? 'missing' : 'not a function'}`
    }
  }
  const limits = plugin.limits
  if (limits === undefined) return undefined
  if (!isObject(limits)) return 'limits is not an object'
  for (const [hook, ms] of Object.entries(limits)) {
    if (!(HOOKS as readonly string[]).includes(hook)) return `limits names ${hook}, not a hook`
    if (typeof ms !== 'number' || !(ms > 0)) {
      return `limits.${hook} is not a positive number of milliseconds`
    }
  }
  return undefined
}

/** The `package` key a package plugin's entry holds besides its own settings. */
const packageKey = z.string().describe('The npm package this plugin is loaded from.')

/**
 * `def` with `package` added to its settings and its `create` checked: the
 * plugin it returns must be named as `def`, have the hooks the core calls, and
 * be tied to the kit it was given. The result is recorded for {@link isPackaged}.
 */
function checked(def: PluginDefinition, entry: PackageEntry, label: string): PluginDefinition {
  const fail = (why: string): PackageLoadError =>
    new PackageLoadError({ ...entry, reason: `plugins.${entry.name}.package: ${label} ${why}` })
  const out: PluginDefinition = {
    ...def,
    settings: def.settings.safeExtend({ package: packageKey }),
    create(init) {
      let plugin: Plugin
      try {
        plugin = def.create(init)
      } catch (err) {
        throw fail(`could not be created: ${(err as Error).message}`)
      }
      if (!isObject(plugin) || plugin.name !== def.name) {
        throw fail(
          `returned a plugin named ${JSON.stringify(isObject(plugin) ? plugin.name : plugin)} from create, not ${def.name}`,
        )
      }
      const hooks = misshapenHooks(plugin)
      if (hooks !== undefined) throw fail(`returned a plugin from create whose ${hooks}`)
      if (!builtOn(plugin, init.kit)) {
        throw fail(
          'was not made with the definePlugin of the host-cleaner running it; make it with definePlugin from @osdlc/host-cleaner/plugin, and have the package use that copy of @osdlc/host-cleaner rather than its own',
        )
      }
      return plugin
    },
  }
  fromPackage.add(out)
  return out
}

/**
 * The package `entry` names, from the first of `roots` that has it.
 *
 * @throws PackageLoadError when it is not there, its `package.json` can't be read, it exports no entry for `import`, its import throws, or its default export is not a plugin definition of that name for this host-cleaner's {@link PLUGIN_API}
 */
async function loadPackage(entry: PackageEntry, roots: readonly string[]): Promise<LoadedPackage> {
  const fail = (why: string): PackageLoadError =>
    new PackageLoadError({ ...entry, reason: `plugins.${entry.name}.package: ${why}` })
  const dir = roots
    .map((r) => join(r, ...entry.package.split('/')))
    .find((d) => existsSync(join(d, 'package.json')))
  if (dir === undefined) {
    throw fail(`${entry.package} is not installed; looked in ${roots.join(', ')}`)
  }
  let manifest: Manifest
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest
  } catch (err) {
    throw fail(`cannot read ${join(dir, 'package.json')}: ${(err as Error).message}`)
  }
  const version = typeof manifest.version === 'string' ? manifest.version : undefined
  const label = version === undefined ? entry.package : `${entry.package} ${version}`
  const file = entryOf(dir, manifest)
  if (file === undefined) throw fail(`${label} at ${dir} exports no entry for import`)
  let mod: { default?: unknown }
  try {
    mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { default?: unknown }
  } catch (err) {
    throw fail(`${label} at ${dir} failed to import: ${(err as Error).message}`)
  }
  const def = mod.default
  const api = isObject(def) ? def.api : undefined
  const otherApi = (): PackageLoadError =>
    fail(
      `${label} is written for plugin api ${JSON.stringify(api)}, and this host-cleaner supports plugin api ${PLUGIN_API}; install versions of the two that match`,
    )
  // An api given is checked before the shape, which another api may change.
  if (api !== undefined && api !== PLUGIN_API) throw otherApi()
  const shape = notADefinition(def)
  if (shape !== undefined) {
    throw fail(`${label} ${shape}; it must export default definePlugin({ ... })`)
  }
  if (api !== PLUGIN_API) throw otherApi()
  const { name } = def as { name: string }
  if (name !== entry.name) {
    throw fail(
      `${label} is the plugin ${name}, so its entry must be plugins.${name}, not plugins.${entry.name}`,
    )
  }
  return {
    ...entry,
    version,
    path: dir,
    definition: checked(def as PluginDefinition, entry, label),
  }
}

/** Each of `entries` loaded from `roots`, in order, or why it was not. */
export async function loadPackages(
  entries: readonly PackageEntry[],
  roots: readonly string[],
): Promise<{ loaded: LoadedPackage[]; failed: PackageFailure[] }> {
  const results = await Promise.allSettled(entries.map((e) => loadPackage(e, roots)))
  const loaded: LoadedPackage[] = []
  const failed: PackageFailure[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') loaded.push(r.value)
    else if (r.reason instanceof PackageLoadError) failed.push(r.reason.failure)
    else throw r.reason
  }
  return { loaded, failed }
}
