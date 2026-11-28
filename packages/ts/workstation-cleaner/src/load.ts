/**
 * Code plugins loaded from packages (tier 3). Only a package the config names
 * in `plugins.<name>.package` is loaded, and only by its npm name: never a
 * path, and never from a checkout. It is looked for in each folder of
 * {@link packageRoots}, in order.
 *
 * A package is checked as it loads ({@link loadPackage}) and when it creates
 * its plugin ({@link checked}). Only this workstation-cleaner's `definePlugin` ties a
 * plugin to the kit it was given. A failed check is a {@link PackageFailure}:
 * the CLI warns for it in `status`, and refuses `clean` unless the plugin is
 * skipped.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, delimiter, dirname, isAbsolute, join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { z } from 'zod'

import { BUILT_IN_PLUGINS } from './builtins.ts'
import { byName, errorText, isObject } from './helpers.ts'
import { builtOn } from './kit.ts'
import { validLimit } from './run.ts'
import { HOOKS, PLUGIN_API, type Plugin, type PluginDefinition } from './types.ts'

/** An npm package name: lowercase, optionally scoped, with no path in it. */
const PACKAGE_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/

/** workstation-cleaner's own package folder, by real path: the parent of `src/` and `dist/`. */
const WORKSTATION_CLEANER_DIR = realpathSync(fileURLToPath(new URL('../', import.meta.url)))

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
 * above workstation-cleaner's own folder (`from`), as Node resolves workstation-cleaner's
 * own imports, then the global prefix's ({@link npmPrefix}).
 */
export function packageRoots(
  env: Readonly<Record<string, string | undefined>>,
  from: string = WORKSTATION_CLEANER_DIR,
): string[] {
  const roots: string[] = []
  for (let dir = from; ; dir = dirname(dir)) {
    if (basename(dir) !== 'node_modules') roots.push(join(dir, 'node_modules'))
    if (dirname(dir) === dir) break
  }
  const prefix = npmPrefix(env)
  const global =
    process.platform === 'win32'
      ? join(prefix, 'node_modules')
      : join(prefix, 'lib', 'node_modules')
  return !isAbsolute(global) || roots.includes(global) ? roots : [...roots, global]
}

/**
 * The prefix `npm i -g` installs under, as npm finds it: `npm_config_prefix`
 * in any case and not empty, else `prefix` in the user's npmrc
 * (`npm_config_userconfig`, else `~/.npmrc`), the global one
 * (`npm_config_globalconfig`, else `<prefix>/etc/npmrc`), then the one the
 * first `npm` on PATH ships with (Homebrew's sets it), else npm's default:
 * `%APPDATA%\npm` on Windows, where that npmrc is not looked for, else
 * `PREFIX`, else the one Node is installed under. npm reads no
 * project npmrc for a global install, and this reads no file named by a
 * relative path, nor an npm from a `node_modules` folder or a relative entry
 * on PATH: those would be the checkout workstation-cleaner runs in. A relative
 * prefix is returned as it is, for the caller to refuse.
 */
function npmPrefix(env: Readonly<Record<string, string | undefined>>): string {
  const windows = process.platform === 'win32'
  const home = env.HOME || env.USERPROFILE
  // As npm's `loadEnv`: `npm_config_<key>` in any case, an empty value unset.
  const fromEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === '' || !/^npm_config_/i.test(key)) continue
    const name = key.slice('npm_config_'.length).replace(/(?!^)_/g, '-')
    fromEnv[name.toLowerCase()] = value
  }
  // As npm parses a path setting: trimmed, `${VAR}` replaced, a leading `~/` against home.
  const path = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined
    const v = envReplaced(value.trim(), env)
    return home && (windows ? /^~[/\\]/ : /^~\//).test(v) ? join(home, v.slice(2)) : v
  }
  const npm = windows ? undefined : npmOnPath(env.PATH)
  const builtin = npm === undefined ? {} : npmrc(join(npm, 'npmrc'))
  const user = npmrc(path(fromEnv.userconfig ?? builtin.userconfig ?? '~/.npmrc'))
  const fallback =
    windows && env.APPDATA
      ? join(env.APPDATA, 'npm')
      : env.PREFIX ||
        (windows
          ? dirname(process.execPath)
          : join(env.DESTDIR ?? '', dirname(dirname(process.execPath))))
  const sofar = path(fromEnv.prefix ?? user.prefix ?? builtin.prefix) ?? fallback
  const global = npmrc(
    path(fromEnv.globalconfig ?? user.globalconfig ?? builtin.globalconfig) ??
      join(sofar, 'etc', 'npmrc'),
  )
  return path(fromEnv.prefix ?? user.prefix ?? global.prefix ?? builtin.prefix) ?? fallback
}

/** `value` with each `${VAR}` replaced from `env`, as npm's `env-replace` does. */
const envReplaced = (value: string, env: Readonly<Record<string, string | undefined>>): string =>
  value.replace(/(?<!\\)(\\*)\$\{([^${}?]+)(\?)?\}/g, (all, esc: string, name: string, opt) =>
    esc.length % 2
      ? all.slice((esc.length + 1) / 2)
      : esc.slice(esc.length / 2) + (env[name] ?? (opt ? '' : `\${${name}}`)),
  )

/**
 * The folder of the npm the first `npm` on `PATH` runs, when it links to npm's
 * `bin/npm-cli.js`; a PATH entry that is relative or in a `node_modules`
 * folder is passed over.
 */
function npmOnPath(PATH: string | undefined): string | undefined {
  for (const dir of (PATH ?? '').split(delimiter)) {
    if (!isAbsolute(dir) || dir.split(sep).includes('node_modules')) continue
    const bin = join(dir, 'npm')
    if (!existsSync(bin)) continue
    let cli: string
    try {
      cli = realpathSync(bin)
    } catch {
      return undefined
    }
    return basename(cli) === 'npm-cli.js' && basename(dirname(cli)) === 'bin'
      ? dirname(dirname(cli))
      : undefined
  }
  return undefined
}

/**
 * The top-level settings of the npmrc at `file`, as npm's `ini` reads them;
 * none when `file` is relative or can't be read.
 */
function npmrc(file: string | undefined): Record<string, string> {
  const settings: Record<string, string> = {}
  if (file === undefined || !isAbsolute(file)) return settings
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return settings
  }
  for (const line of text.split(/[\r\n]+/)) {
    if (/^\s*[;#]/.test(line)) continue
    if (/^\[[^\]]*\]\s*$/.test(line)) break
    const eq = line.indexOf('=')
    if (eq < 0) continue
    settings[line.slice(0, eq).trim()] = iniValue(line.slice(eq + 1))
  }
  return settings
}

/** An ini value as npm's `ini` reads it: unquoted, or cut at the first `;` or `#` not escaped. */
function iniValue(raw: string): string {
  const v = raw.trim()
  if (v.length > 1 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    const inner = v[0] === "'" ? v.slice(1, -1) : v
    try {
      return String(JSON.parse(inner))
    } catch {
      return inner
    }
  }
  let out = ''
  for (let i = 0; i < v.length; i++) {
    const c = v[i]!
    if (c === '\\' && i + 1 < v.length) {
      const next = v[++i]!
      out += '\\;#'.includes(next) ? next : c + next
    } else if (c === ';' || c === '#') break
    else out += c
  }
  return out.trim()
}

/**
 * Refuses a package plugin named as a built-in.
 *
 * @throws PackageError
 */
export function refuseBuiltInName({ name }: Pick<PackageEntry, 'name'>): void {
  if (!BUILT_IN_PLUGINS.some((d) => d.name === name)) return
  throw new PackageError(
    `plugins.${name}.package: ${name} is the built-in plugin; every plugin has its own name, so a package plugin needs another`,
  )
}

/**
 * The entries of the config's `plugins` that have a `package`, by name.
 *
 * @throws PackageError for a `package` that is not an npm package name, or a name a built-in plugin has
 */
export function packageEntries(
  plugins: Readonly<Record<string, Record<string, unknown>>>,
): PackageEntry[] {
  const entries: PackageEntry[] = []
  for (const [name, entry] of Object.entries(plugins)) {
    if (!Object.hasOwn(entry, 'package')) continue
    const pkg = entry.package
    if (typeof pkg !== 'string' || !PACKAGE_NAME.test(pkg)) {
      throw new PackageError(
        `plugins.${name}.package: ${JSON.stringify(pkg)} is not an npm package name; workstation-cleaner loads a plugin only by the name it is installed under, never from a path`,
      )
    }
    refuseBuiltInName({ name })
    entries.push({ name, package: pkg })
  }
  return entries.sort(byName)
}

/** The time limit, in milliseconds, of a package's import, its top-level await included. */
const IMPORT_LIMIT_MS = 30_000

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

/**
 * Whether Node takes `target` from `exports`: it starts with `./` and has no
 * `.`, `..` or `node_modules` segment, so it stays in the package.
 */
const inPackage = (target: string): boolean =>
  target.startsWith('./') &&
  target
    .slice(2)
    .split(/[/\\]/)
    .every((s) => s !== '.' && s !== '..' && s.toLowerCase() !== 'node_modules')

/** The file `import '<package>'` loads from the package folder `dir`. */
function entryOf(dir: string, manifest: Manifest): string | undefined {
  if (manifest.exports !== undefined) {
    const file = exported(manifest.exports)
    return file === undefined || !inPackage(file) ? undefined : join(dir, file)
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

const MUST_EXPORT = 'it must export default definePlugin({ ... })'

/** Why `x` is not a `definePlugin` definition, or undefined when it is one. */
function notADefinition(x: unknown): string | undefined {
  if (!isObject(x)) return `has no default export; ${MUST_EXPORT}`
  if (typeof x.name !== 'string') return `default export has no string name; ${MUST_EXPORT}`
  if (typeof x.create !== 'function') return `default export has no create function; ${MUST_EXPORT}`
  if (x.api === undefined) return `default export has no api; ${MUST_EXPORT}`
  const { settings } = x
  if (isObject(settings) && typeof settings.safeExtend === 'function') {
    return isObject(settings.shape) && Object.hasOwn(settings.shape, 'package')
      ? 'has settings that declare package, which host-cleaner keeps for the npm package the plugin is loaded from; rename that setting'
      : undefined
  }
  return isObject(settings) && typeof settings.parse === 'function'
    ? "has settings made with a zod this workstation-cleaner can't extend; make them with the z that @osdlc/workstation-cleaner/plugin exports"
    : `default export has no zod object settings; ${MUST_EXPORT}`
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
    // As the core reads it: undefined is the default.
    if (ms !== undefined && !validLimit(ms)) {
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
        throw fail(`could not be created: ${errorText(err)}`)
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
          'was not made with the definePlugin of the workstation-cleaner running it; make it with definePlugin from @osdlc/workstation-cleaner/plugin, and have the package use that copy of @osdlc/workstation-cleaner rather than its own',
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
 * @throws PackageLoadError when it is not there, its `package.json` can't be read, it exports no entry for `import`, its import throws or takes over {@link IMPORT_LIMIT_MS}, or its default export is not a plugin definition of that name for this host-cleaner's {@link PLUGIN_API}
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
    throw fail(`cannot read ${join(dir, 'package.json')}: ${errorText(err)}`)
  }
  const version = typeof manifest.version === 'string' ? manifest.version : undefined
  const label = version === undefined ? entry.package : `${entry.package} ${version}`
  const file = entryOf(dir, manifest)
  if (file === undefined) throw fail(`${label} at ${dir} exports no entry for import`)
  let mod: { default?: unknown }
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(fail(`${label} at ${dir} did not finish importing in ${IMPORT_LIMIT_MS / 1000} s`)),
      IMPORT_LIMIT_MS,
    )
  })
  try {
    const imported = import(/* @vite-ignore */ pathToFileURL(file).href)
    mod = (await Promise.race([imported, late])) as { default?: unknown }
  } catch (err) {
    if (err instanceof PackageLoadError) throw err
    throw fail(`${label} at ${dir} failed to import: ${errorText(err)}`)
  } finally {
    clearTimeout(timer)
  }
  const def = mod.default
  // An api given is checked before the shape, which another api may change.
  const api = isObject(def) ? def.api : undefined
  if (api !== undefined && api !== PLUGIN_API) {
    throw fail(
      `${label} is written for plugin api ${JSON.stringify(api)}, and this workstation-cleaner supports plugin api ${PLUGIN_API}; install versions of the two that match`,
    )
  }
  const shape = notADefinition(def)
  if (shape !== undefined) throw fail(`${label} ${shape}`)
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
