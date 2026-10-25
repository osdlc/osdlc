/**
 * wayfinder's configuration. It is layered, and reading it runs nothing.
 * Settings people want on every run (runners to skip, paths that are not
 * project structure, whether execution is allowed, extra tools) are set once,
 * per user and per project. Flags are for one-off changes.
 *
 * ## Layers, lowest precedence first
 *
 *   1. `DEFAULT_CONFIG` — the built-in defaults.
 *   2. USER — `$XDG_CONFIG_HOME/wayfinder/config.json`, or `~/.config/wayfinder/config.json`
 *      when `XDG_CONFIG_HOME` is unset or relative.
 *   3. PROJECT — `wayfinder.config.json` at the root `findRoot` resolves.
 *   4. CLI flags, applied by the caller. {@link collectOptionsFromConfig}
 *      returns the options a caller spreads its own flags on top of.
 *
 * `allowExec` is an exception to this order. The project layer may lower it to
 * `false`, since a repository asking not to be run is safe to honour. It can
 * never raise it to `true`. `wayfinder.config.json` lives inside the repository
 * being scanned, so honouring `allowExec: true` from it would let a repository
 * authorize running its own code. So `allowExec: true` is removed from the
 * project layer before merging, with a warning. Only the user layer and the CLI
 * flags can turn execution on. To give a repository lasting permission, run
 * `way trust`, which records the consent outside the repository.
 *
 * `tools` is gated too, because a tool module is code. User-layer entries
 * always load; project-layer entries load only when the repository is trusted
 * and execution is allowed (see `tools.ts`).
 *
 * `trust` is a stricter exception. It has no lower setting a project could
 * choose, so the whole project-layer `trust` block is dropped, with a warning
 * when it is not empty. A repository must not be able to pre-authorize itself,
 * or any group of repositories that includes it. Only the user layer's `trust`
 * reaches `@osdlc/trust-repo`'s `policyExecGate`, which combines it with the
 * marker store that `way trust` writes to. See that package's README for the
 * glob dialect, and `origin-owner.ts` for the origin-remote lookup that
 * `trust.owners` uses.
 *
 * XDG paths are used on every platform, macOS included, as `gh` does. A
 * developer with a dotfiles repository expects this file beside their other
 * tool config.
 *
 * `WAYFINDER_CONFIG=/path/to/file` changes only where the user layer is read
 * from. The named file is read instead of the XDG path. The project layer is
 * still read from the project root and still merges on top. Naming a file that
 * does not exist is an error, not an empty layer: an env var that points at
 * nothing is a typo. A relative value is ignored with a warning, and the XDG
 * path is read instead.
 *
 * ## The old waypost names
 *
 * The tool was called waypost before its first release. Each old name is still
 * read when its new one is absent, so an existing setup keeps working:
 * `WAYPOST_CONFIG` when `WAYFINDER_CONFIG` is unset, `<config>/waypost/config.json`
 * when `<config>/wayfinder/config.json` does not exist, and `waypost.config.json`
 * when `wayfinder.config.json` does not exist. A file found this way is also the
 * one `config set` edits, so a setting never lands in a file that is not read.
 * Each fallback adds a warning that names the new location. When both the old
 * and the new file exist, the new one is read and a warning says the old one
 * is ignored.
 *
 * ## Merge rule
 *
 * Objects merge key by key. Everything else, scalars and arrays alike,
 * replaces the lower value whole. Arrays replace because each array setting
 * answers "which ones, in what order". A project that says `order: ["just"]`
 * means that list, not that list appended to the user's.
 *
 *   user    { runners: { disabled: ["cargo"], order: ["moon"] } }
 *   project { runners: {                      order: ["just"] } }
 *   result  { runners: { disabled: ["cargo"], order: ["just"] } }
 *
 * ## Unknown keys and broken files
 *
 * An unknown key is a warning naming the file and the key, and the rest of the
 * file still loads. A config written for a newer version must not break an
 * older one. A malformed file, or a value of the wrong type for a known key, is
 * a {@link ConfigError} naming the file and the problem. There is no silent
 * fallback: a setting that quietly did not apply is worse than one that refused
 * to load.
 */

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { readParsedFile } from '@osdlc/config-layers'
import {
  homeDir,
  resolveTrustRoot,
  type PolicyDecisionOptions,
  type TrustPolicy,
} from '@osdlc/trust-repo'

import type { DiscoveryMode } from '@osdlc/system-model/detect'

import {
  APP,
  BIN,
  CONFIG_ENV_VAR,
  LEGACY_APP,
  LEGACY_CONFIG_ENV_VAR,
  LEGACY_PROJECT_CONFIG_FILENAME,
  PROJECT_CONFIG_FILENAME,
} from './app.ts'
import { originOwner } from './origin-owner.ts'
import { expandTilde } from './xdg.ts'
import type { WayOptions } from './catalog.ts'

export { CONFIG_ENV_VAR, PROJECT_CONFIG_FILENAME }

/** Directory under `$XDG_CONFIG_HOME` holding the USER layer. */
export const USER_CONFIG_DIR = APP

/** The `tool` key of the trust store (`$XDG_STATE_HOME/<tool>/trusted/`). */
export const TRUST_STORE_TOOL = APP

/** The old {@link USER_CONFIG_DIR}, read when the new user file does not exist. */
export const LEGACY_USER_CONFIG_DIR = LEGACY_APP

/** The old {@link TRUST_STORE_TOOL}. Its grants are still honoured; see `trust-store.ts`. */
export const LEGACY_TRUST_STORE_TOOL = LEGACY_APP

/** The USER layer's filename inside {@link USER_CONFIG_DIR}. */
export const USER_CONFIG_FILENAME = 'config.json'

export interface RunnersConfig {
  /** Built-in runner ids to skip entirely. Becomes `CollectOptions.exclude`. */
  disabled?: string[]
  /** Preferred display order. Runners not named here follow alphabetically. */
  order?: string[]
}

/**
 * The policy `@osdlc/trust-repo`'s `policyExecGate` decides trust over, on
 * top of the marker store `way trust` writes to. User layer only (see the
 * module docblock). A project-layer block is dropped before the merge.
 */
export interface TrustConfig {
  /**
   * Glob patterns (`@osdlc/trust-repo`'s dialect: `*`, `?`, `**`, a trailing
   * `/**` matching descendants only) over the repo root with symlinks resolved.
   * A leading `~` expands against `home`. There are no `{name}` tokens.
   */
  paths?: string[]
  /**
   * Origin remote owners that trust a root without a marker: `host/owner`, or
   * a bare `owner` for `github.com/owner`. Case-insensitive.
   */
  owners?: string[]
}

/**
 * The whole configuration document, schema v1.
 *
 * A type alias rather than an interface, so it has an implicit index
 * signature. That lets {@link setConfigValue} and the related functions take
 * both this and the raw record read from a file.
 */
export type TaskConfig = {
  runners?: RunnersConfig
  /** Default for the exec trust gate. A `--exec` / `--no-exec` flag still wins. */
  allowExec?: boolean
  discovery?: DiscoveryMode | 'auto'
  /**
   * Paths to leave out of discovery, on top of the built-in list. A bare name
   * matches any path segment; a value with a slash matches a path prefix from
   * the root, taking the tree beneath it.
   *
   * Use it to mark a tree as data rather than project structure, such as a
   * fixture repo or a vendored sample. `runners.disabled` turns a runner off
   * everywhere in the project. This leaves the runner on and narrows where it
   * looks.
   *
   * It usually belongs in the project layer: which trees are fixtures is a fact
   * about the repository, the same for everyone working in it. The user layer
   * may set it too, and then the project value replaces the user value whole.
   */
  excludePaths?: string[]
  /** User layer only. See {@link TrustConfig} and the module docblock. */
  trust?: TrustConfig
  /**
   * Modules that export extra `ToolDef`s, as paths. A relative path resolves
   * against the file that names it. Project entries load only when the
   * repository is trusted and execution is allowed.
   */
  tools?: string[]
}

/**
 * The built-in defaults layer.
 *
 * Every leaf is present, so {@link LoadedConfig.sources} has an entry for
 * every key. A key set in no file is attributed to this layer.
 */
export const DEFAULT_CONFIG: Required<TaskConfig> = {
  runners: { disabled: [], order: [] },
  allowExec: false,
  discovery: 'auto',
  excludePaths: [],
  trust: { paths: [], owners: [] },
  tools: [],
}

export type ConfigLayer = 'default' | 'user' | 'project'

export interface ConfigLocations {
  /** Absolute path of the user layer's file, whether or not it exists. */
  user: string
  /** True when an env var supplied that path instead of XDG. */
  userFromEnv: boolean
  /** The env var that supplied it: {@link CONFIG_ENV_VAR}, or the old one. Null when none did. */
  userEnvVar: string | null
  /** True when `user` is the old waypost file, found because the new one does not exist. */
  userLegacy: boolean
  /** The old waypost user file, when it exists beside the new one and is ignored. */
  userIgnored: string | null
  /**
   * A relative {@link CONFIG_ENV_VAR} (or old-name) value, which is ignored:
   * the variable and its value. Null when none was ignored.
   */
  userEnvIgnored: { variable: string; value: string } | null
  /**
   * Absolute path of `<root>/wayfinder.config.json`, whether or not it exists,
   * or of `<root>/waypost.config.json` when only that one exists.
   */
  project: string
  /** True when `project` is the old waypost file. */
  projectLegacy: boolean
  /** `<root>/waypost.config.json`, when it exists beside the new file and is ignored. */
  projectIgnored: string | null
}

/**
 * A configuration file that cannot be honoured — unparseable, or holding a
 * value of the wrong type.
 */
export class ConfigError extends Error {
  /**
   * The file the error is about. Empty when the error concerns a value handed
   * in directly, as {@link setConfigValue} does with a bad key or value.
   */
  readonly file: string

  constructor(message: string, file: string) {
    super(message)
    this.name = 'ConfigError'
    this.file = file
  }
}

/** The type of one settable leaf, used by validation and by `set` alike. */
type FieldType = 'boolean' | 'string-array' | 'discovery'

/**
 * Every settable key, by dotted path. Validation, {@link setConfigValue} and
 * the known-key check all read this one list, so a setting cannot be accepted
 * in one place and rejected in another.
 */
const FIELDS: Record<string, FieldType> = {
  'runners.disabled': 'string-array',
  'runners.order': 'string-array',
  allowExec: 'boolean',
  discovery: 'discovery',
  excludePaths: 'string-array',
  'trust.paths': 'string-array',
  'trust.owners': 'string-array',
  tools: 'string-array',
}

/**
 * Every settable key, in schema order — the dotted names `config set` accepts.
 *
 * Derived from {@link FIELDS}, so anything that lists the keys (the `guide`
 * command's config section) stays in step with the schema.
 */
export const CONFIG_KEYS: readonly string[] = Object.keys(FIELDS)

const DISCOVERY_VALUES = ['git', 'walk', 'auto'] as const

/**
 * Key order for writing: schema order, not alphabetical, so a written file
 * reads like the documented schema. Keys not listed here are unknown to this
 * version. They are written after the known ones, in the order the file
 * already had them.
 */
const KEY_ORDER: Record<string, readonly string[]> = {
  '': ['runners', 'allowExec', 'discovery', 'excludePaths', 'trust', 'tools'],
  runners: ['disabled', 'order'],
  trust: ['paths', 'owners'],
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return `a ${typeof value}`
}

/** Check one leaf against its declared type, returning it narrowed. */
function coerceField(key: string, value: unknown, file: string): unknown {
  const type = FIELDS[key]
  const where = file === '' ? '' : `${file}: `
  switch (type) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new ConfigError(`${where}${key} must be true or false, got ${describe(value)}`, file)
      }
      return value
    case 'string-array': {
      if (!Array.isArray(value)) {
        throw new ConfigError(
          `${where}${key} must be an array of strings, got ${describe(value)}`,
          file,
        )
      }
      // Name the offending element, not the container: "got an array" reads as
      // a contradiction when an array is exactly what was asked for.
      const bad = value.findIndex((item) => typeof item !== 'string')
      if (bad !== -1) {
        throw new ConfigError(
          `${where}${key} must be an array of strings, got ${describe(value[bad])} at index ${bad}`,
          file,
        )
      }
      return [...value]
    }
    case 'discovery':
      if (
        typeof value !== 'string' ||
        !DISCOVERY_VALUES.includes(value as DiscoveryMode | 'auto')
      ) {
        throw new ConfigError(
          `${where}${key} must be one of ${DISCOVERY_VALUES.join(', ')}, got ${JSON.stringify(value)}`,
          file,
        )
      }
      return value
    default:
      throw new ConfigError(`${where}unknown setting: ${key}`, file)
  }
}

function unknownKeyWarning(file: string, key: string): string {
  return `${file}: unknown setting "${key}" (ignored)`
}

/**
 * Resolve where each layer's file lives. `env` and `home` are injectable so a
 * test does not read the developer's own `~/.config`. The only other input is
 * whether a file exists, which picks between a new name and its old waypost
 * name (see the module docblock).
 *
 * Rules for a path taken from the environment:
 *
 * A leading `~` is expanded against `home`. A shell expands it before exec, but
 * `.env` loaders, direnv and CI YAML pass the literal tilde through. Without
 * this, `~/config.json` would silently become `<somewhere>/~/config.json`.
 *
 * A relative `XDG_CONFIG_HOME` is ignored, as the XDG spec says. A relative
 * `WAYFINDER_CONFIG` is ignored too, and `userEnvIgnored` says so. Resolved
 * against the root, or against the cwd, which is usually the root, it would
 * name a file inside the repository being scanned, and the user layer can
 * turn execution on and load tools.
 */
export function configLocations(
  root: string,
  env: Record<string, string | undefined> = process.env,
  home: string = homeDir(),
): ConfigLocations {
  const base = resolve(root)

  const fromVar = (name: string): string | null => {
    const value = env[name]?.trim()
    return value !== undefined && value !== '' ? value : null
  }
  const named = fromVar(CONFIG_ENV_VAR)
  const legacyNamed = named === null ? fromVar(LEGACY_CONFIG_ENV_VAR) : null
  const namedVar =
    named !== null ? CONFIG_ENV_VAR : legacyNamed !== null ? LEGACY_CONFIG_ENV_VAR : null
  const envValue = named ?? legacyNamed
  const expanded = envValue === null ? null : expandTilde(envValue, home)
  const envPath = expanded !== null && isAbsolute(expanded) ? expanded : null
  const userEnvVar = envPath !== null ? namedVar : null
  const userEnvIgnored =
    namedVar !== null && envValue !== null && envPath === null
      ? { variable: namedVar, value: envValue }
      : null

  const xdg = expandTilde(env['XDG_CONFIG_HOME']?.trim() ?? '', home)
  const configHome = isAbsolute(xdg) ? xdg : join(home, '.config')

  const xdgUser = preferNew(
    join(configHome, USER_CONFIG_DIR, USER_CONFIG_FILENAME),
    join(configHome, LEGACY_USER_CONFIG_DIR, USER_CONFIG_FILENAME),
  )
  const project = preferNew(
    join(base, PROJECT_CONFIG_FILENAME),
    join(base, LEGACY_PROJECT_CONFIG_FILENAME),
  )

  return {
    user: envPath !== null ? resolve(envPath) : xdgUser.path,
    userFromEnv: envPath !== null,
    userEnvVar,
    userLegacy: envPath === null && xdgUser.legacy,
    userIgnored: envPath === null ? xdgUser.ignored : null,
    userEnvIgnored,
    project: project.path,
    projectLegacy: project.legacy,
    projectIgnored: project.ignored,
  }
}

/**
 * The new path, unless only the old one exists. `ignored` names the old file
 * when both exist, so the caller can say it is not read.
 */
function preferNew(
  path: string,
  legacy: string,
): { path: string; legacy: boolean; ignored: string | null } {
  const hasNew = existsSync(path)
  const hasLegacy = existsSync(legacy)
  if (!hasNew && hasLegacy) return { path: legacy, legacy: true, ignored: null }
  return { path, legacy: false, ignored: hasNew && hasLegacy ? legacy : null }
}

/**
 * Validate a parsed JSON document against schema v1.
 *
 * Throws {@link ConfigError} on a type error. Returns the known keys plus one
 * warning per unknown key. Because the result holds only known keys, the write
 * path never goes through this shape (see {@link readRawConfigFile}).
 */
export function validateConfig(
  raw: unknown,
  file: string,
): { config: TaskConfig; warnings: string[] } {
  if (!isPlainObject(raw)) {
    throw new ConfigError(`${file}: expected a JSON object, got ${describe(raw)}`, file)
  }

  const warnings: string[] = []
  const config: TaskConfig = {}

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    switch (key) {
      case 'runners': {
        if (!isPlainObject(value)) {
          throw new ConfigError(`${file}: runners must be an object, got ${describe(value)}`, file)
        }
        const runners: RunnersConfig = {}
        for (const [inner, innerValue] of Object.entries(value)) {
          if (innerValue === undefined) continue
          if (inner === 'disabled' || inner === 'order') {
            runners[inner] = coerceField(`runners.${inner}`, innerValue, file) as string[]
          } else {
            warnings.push(unknownKeyWarning(file, `runners.${inner}`))
          }
        }
        config.runners = runners
        break
      }
      case 'allowExec':
        config.allowExec = coerceField('allowExec', value, file) as boolean
        break
      case 'discovery':
        config.discovery = coerceField('discovery', value, file) as DiscoveryMode | 'auto'
        break
      case 'excludePaths':
        config.excludePaths = coerceField('excludePaths', value, file) as string[]
        break
      case 'trust': {
        if (!isPlainObject(value)) {
          throw new ConfigError(`${file}: trust must be an object, got ${describe(value)}`, file)
        }
        const trust: TrustConfig = {}
        for (const [inner, innerValue] of Object.entries(value)) {
          if (innerValue === undefined) continue
          if (inner === 'paths' || inner === 'owners') {
            trust[inner] = coerceField(`trust.${inner}`, innerValue, file) as string[]
          } else {
            warnings.push(unknownKeyWarning(file, `trust.${inner}`))
          }
        }
        config.trust = trust
        break
      }
      case 'tools':
        config.tools = coerceField('tools', value, file) as string[]
        break
      default:
        warnings.push(unknownKeyWarning(file, key))
    }
  }

  return { config, warnings }
}

/**
 * Deep-copy a value so the result shares no mutable structure with its source.
 * A shallow spread is not enough. Every `loadConfig` merges on top of the
 * exported `DEFAULT_CONFIG` object, so a shared branch would let a caller that
 * mutates `effective` corrupt the defaults for every later load.
 */
function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) out[key] = cloneValue(inner)
    return out
  }
  return value
}

function deepMerge(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(base), ...Object.keys(over)])) {
    const under = base[key]
    const above = over[key]
    if (above === undefined) {
      out[key] = cloneValue(under)
    } else if (isPlainObject(under) && isPlainObject(above)) {
      out[key] = deepMerge(under, above)
    } else {
      out[key] = cloneValue(above)
    }
  }
  return out
}

/**
 * Merge `over` onto `base` per the module's rule: objects key by key, scalars
 * and arrays replaced whole.
 *
 * Neither argument is changed, and the result shares no object or array with
 * either, including branches `over` does not mention. Mutating a loaded config
 * must not change `DEFAULT_CONFIG`.
 */
export function mergeConfig(base: TaskConfig, over: TaskConfig): TaskConfig {
  return deepMerge(base, over) as TaskConfig
}

/**
 * One layer file as a plain object, read with `@osdlc/config-layers`'s
 * `readParsedFile`. `null` when the file does not exist. A file that is
 * unreadable, not JSON, or not an object throws {@link ConfigError} naming it.
 */
async function readJsonFile(file: string): Promise<Record<string, unknown> | null> {
  const read = readParsedFile(file, 'json')
  switch (read.kind) {
    case 'absent':
      return null
    case 'unreadable':
      throw new ConfigError(`${file}: cannot be read — ${read.message}`, file)
    case 'unparsable':
      throw new ConfigError(`${file}: invalid JSON — ${read.message}`, file)
    case 'ok':
      if (!isPlainObject(read.value)) {
        throw new ConfigError(`${file}: expected a JSON object, got ${describe(read.value)}`, file)
      }
      return read.value
  }
}

/**
 * The file's parsed object, unvalidated and with every key intact.
 *
 * `set` and `unset` edit this object, not the validated shape, because
 * validation drops unknown keys. Writing a validated document back would
 * silently delete a setting a newer version had written. `null` when the file
 * does not exist.
 */
export async function readRawConfigFile(file: string): Promise<Record<string, unknown> | null> {
  return readJsonFile(file)
}

/**
 * Read, parse and validate one layer. `null` when the file does not exist,
 * which is normal and not an error. A file that exists and is broken throws
 * {@link ConfigError}.
 */
export async function readConfigFile(
  file: string,
): Promise<{ config: TaskConfig; warnings: string[] } | null> {
  const raw = await readJsonFile(file)
  if (raw === null) return null
  return validateConfig(raw, file)
}

function orderedKeys(record: Record<string, unknown>, section: string): string[] {
  const canonical = KEY_ORDER[section] ?? []
  const known = canonical.filter((key) => key in record)
  const rest = Object.keys(record).filter((key) => !canonical.includes(key))
  return [...known, ...rest]
}

function stabilize(record: Record<string, unknown>, section: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of orderedKeys(record, section)) {
    const value = record[key]
    const child = section === '' ? key : `${section}.${key}`
    out[key] =
      isPlainObject(value) && KEY_ORDER[child] !== undefined ? stabilize(value, child) : value
  }
  return out
}

/**
 * Write a configuration file: known keys in schema order, unknown keys after
 * them in the order they already had, two-space indent, trailing newline.
 * Parent directories are created.
 *
 * The order is fixed so that writing an unchanged document produces an
 * unchanged file. A config under version control should not show a diff
 * because a key moved.
 *
 * Accepts a raw record as well as a {@link TaskConfig}, so an edit can keep
 * unknown keys.
 */
export async function writeConfigFile(
  file: string,
  config: TaskConfig | Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify(stabilize(config as Record<string, unknown>, ''), null, 2)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${body}\n`, 'utf-8')
}

export interface LoadedConfig {
  /** Defaults, then user, then project, merged. The values a caller should use. */
  effective: TaskConfig
  /**
   * The layers as they were applied. `project` has already had a rejected
   * `allowExec: true` and any `trust` block removed, so it matches `effective`
   * and `sources`. Read the file itself with {@link readRawConfigFile} to see
   * what was written.
   */
  layers: { default: TaskConfig; user: TaskConfig | null; project: TaskConfig | null }
  /**
   * Dotted key to the layer that supplied the winning value. Every leaf of
   * `effective` appears, so `way config list` can say where each value came
   * from when a setting is not what the user expected.
   */
  sources: Map<string, ConfigLayer>
  locations: ConfigLocations
  /** Warnings from every layer: unknown keys, ignored project keys, old waypost names. */
  warnings: string[]
}

function leafPaths(value: unknown, prefix: string): string[] {
  if (!isPlainObject(value)) return [prefix]
  return Object.entries(value).flatMap(([key, inner]) =>
    leafPaths(inner, prefix === '' ? key : `${prefix}.${key}`),
  )
}

/**
 * Load every layer and merge them. `env` and `home` are injectable for the same
 * reason {@link configLocations} takes them.
 */
export async function loadConfig(
  root: string,
  env: Record<string, string | undefined> = process.env,
  home: string = homeDir(),
): Promise<LoadedConfig> {
  const locations = configLocations(root, env, home)

  const userRead = await readConfigFile(locations.user)
  if (userRead === null && locations.userFromEnv) {
    throw new ConfigError(
      `${locations.user}: ${locations.userEnvVar ?? CONFIG_ENV_VAR} names a file that does not exist`,
      locations.user,
    )
  }
  const projectRead = await readConfigFile(locations.project)

  const user = userRead?.config ?? null
  let project = projectRead?.config ?? null
  const warnings = [...(userRead?.warnings ?? []), ...(projectRead?.warnings ?? [])]
  warnings.push(...legacyWarnings(locations))

  // A repository cannot grant itself permission to run its own code. Lowering
  // to false is honoured. Raising to true is dropped here, before the merge and
  // before `sources`, so `config list` names the layer that really supplied the
  // value, not the ignored file.
  //
  // Not in validateConfig: that check is the same for every layer and is also
  // used by `config set`. This rule depends on which layer a value came from.
  if (project?.allowExec === true) {
    // Warn even when the user layer already said true. The file's setting is
    // never honoured, and without a warning its author might rely on it in a
    // repo where it has no effect.
    warnings.push(
      `${locations.project}: allowExec: true is ignored in a project file — a repository cannot grant itself permission to run subprocesses; run "${BIN} trust" to trust this repository`,
    )
    const { allowExec: _ignored, ...rest } = project
    project = rest
  }

  // A stricter version of the same rule: a project-layer `trust` block is
  // dropped whole, whatever it holds. A repository must not pre-authorize
  // itself or any group of repositories. Even an empty `paths: []` would
  // otherwise replace the user's list in the merge. Only a non-empty block is
  // warned about, since an empty one granted nothing.
  if (project?.trust !== undefined) {
    if ((project.trust.paths?.length ?? 0) > 0 || (project.trust.owners?.length ?? 0) > 0) {
      warnings.push(
        `${locations.project}: trust is ignored in a project file — a repository cannot grant ` +
          `itself trust; set trust.paths/trust.owners in your user config (${locations.user}) instead`,
      )
    }
    const { trust: _ignoredTrust, ...rest } = project
    project = rest
  }

  const effective = mergeConfig(mergeConfig(DEFAULT_CONFIG, user ?? {}), project ?? {})

  const sources = new Map<string, ConfigLayer>()
  for (const key of leafPaths(effective, '')) {
    const layer: ConfigLayer =
      project !== null && getConfigValue(project, key) !== undefined
        ? 'project'
        : user !== null && getConfigValue(user, key) !== undefined
          ? 'user'
          : 'default'
    sources.set(key, layer)
  }

  return {
    effective,
    layers: { default: DEFAULT_CONFIG, user, project },
    sources,
    locations,
    warnings,
  }
}

/** The warning for a relative `WAYFINDER_CONFIG` that was ignored, or null. */
export function envIgnoredWarning(locations: ConfigLocations): string | null {
  if (locations.userEnvIgnored === null) return null
  const { variable, value } = locations.userEnvIgnored
  return (
    `${variable}=${value} is ignored because it is not an absolute path; ` +
    `use an absolute path or ~/. Reading ${locations.user} instead`
  )
}

/** One warning per old waypost name in use, naming the new one, and one for an ignored env path. */
function legacyWarnings(locations: ConfigLocations): string[] {
  const out: string[] = []
  const ignored = envIgnoredWarning(locations)
  if (ignored !== null) out.push(ignored)
  if (locations.userEnvVar === LEGACY_CONFIG_ENV_VAR) {
    out.push(`${LEGACY_CONFIG_ENV_VAR} is the old name; set ${CONFIG_ENV_VAR} instead`)
  }
  if (locations.userLegacy) {
    const target = join(dirname(dirname(locations.user)), USER_CONFIG_DIR, USER_CONFIG_FILENAME)
    out.push(`${locations.user}: read from the old waypost location; move it to ${target}`)
  }
  if (locations.userIgnored !== null) {
    out.push(
      `${locations.userIgnored} is ignored because ${locations.user} exists; merge it and delete it`,
    )
  }
  if (locations.projectLegacy) {
    out.push(`${locations.project}: the old file name; rename it to ${PROJECT_CONFIG_FILENAME}`)
  }
  if (locations.projectIgnored !== null) {
    out.push(
      `${locations.projectIgnored} is ignored because ${PROJECT_CONFIG_FILENAME} exists; merge it and delete it`,
    )
  }
  return out
}

/** Read a dotted path — `"runners.order"`, `"allowExec"`. `undefined` when absent. */
export function getConfigValue(config: object, key: string): unknown {
  let cursor: unknown = config
  for (const segment of key.split('.')) {
    if (!isPlainObject(cursor)) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

/**
 * Set a dotted path, returning a new document. The input is not changed.
 * Missing intermediate objects are created, so `set` works on an empty file.
 *
 * Throws {@link ConfigError} for an unknown key, a value of the wrong type, or
 * an existing intermediate value that is not an object, rather than writing a
 * file that will fail to load. Given a raw record, it returns a raw record with
 * its unknown keys untouched.
 */
export function setConfigValue<T extends object>(config: T, key: string, value: unknown): T {
  if (!(key in FIELDS)) {
    throw new ConfigError(`unknown setting: ${key}`, '')
  }
  const checked = coerceField(key, value, '')

  const segments = key.split('.')
  const root: Record<string, unknown> = { ...(config as Record<string, unknown>) }
  let cursor = root
  let walked = ''
  for (const segment of segments.slice(0, -1)) {
    walked = walked === '' ? segment : `${walked}.${segment}`
    const existing = cursor[segment]
    // A container of the wrong type means the file is broken. Replacing it
    // would silently delete whatever the user meant by it.
    if (existing !== undefined && !isPlainObject(existing)) {
      throw new ConfigError(
        `cannot set ${key}: ${walked} is ${describe(existing)}, not an object`,
        '',
      )
    }
    const next: Record<string, unknown> = existing === undefined ? {} : { ...existing }
    cursor[segment] = next
    cursor = next
  }
  cursor[segments[segments.length - 1] as string] = checked
  return root as T
}

/**
 * Remove a dotted path, returning a new document. A container left empty by the
 * removal is removed too, so unsetting the last `runners.*` key does not leave
 * `"runners": {}` behind.
 *
 * Unlike `set`, any key may be unset, including one this version does not
 * know, so a stale setting can be removed.
 */
export function unsetConfigValue<T extends object>(config: T, key: string): T {
  const segments = key.split('.')
  const record = config as Record<string, unknown>

  const head = segments[0] as string
  if (!(head in record)) return { ...record } as T

  if (segments.length === 1) {
    const out = { ...record }
    delete out[head]
    return out as T
  }

  const child = record[head]
  if (!isPlainObject(child)) return { ...record } as T

  const pruned = unsetConfigValue(child, segments.slice(1).join('.'))
  const out = { ...record }
  if (Object.keys(pruned).length === 0) delete out[head]
  else out[head] = pruned
  return out as T
}

/**
 * Parse a value typed on a command line. It is parsed as JSON first, so
 * `true`, `3` and `["a","b"]` keep their types. A bare word that is not valid
 * JSON is kept as a string, so `moon` need not be typed as `"moon"`.
 */
export function parseConfigValue(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * The {@link WayOptions} fields this configuration controls. Only keys the
 * config sets are present, so a caller spreads its own flags after it.
 */
export function collectOptionsFromConfig(
  config: TaskConfig,
): Pick<WayOptions, 'exclude' | 'allowExec' | 'discovery' | 'excludePaths'> {
  const options: Pick<WayOptions, 'exclude' | 'allowExec' | 'discovery' | 'excludePaths'> = {}
  const disabled = config.runners?.disabled
  if (disabled !== undefined) options.exclude = [...disabled]
  if (config.allowExec !== undefined) options.allowExec = config.allowExec
  if (config.discovery !== undefined) options.discovery = config.discovery
  if (config.excludePaths !== undefined) options.excludePaths = [...config.excludePaths]
  return options
}

/** `config.trust`, defaulted to the empty policy `@osdlc/trust-repo` expects. */
export function trustPolicyFromConfig(config: TaskConfig): TrustPolicy {
  return { paths: config.trust?.paths ?? [], owners: config.trust?.owners ?? [] }
}

/**
 * Expand a `trust.paths` entry's leading `~` against `home`, then resolve
 * symlinks in the pattern's static prefix (the part before the first glob
 * character) with `resolveTrustRoot`.
 *
 * This is the `expandPath` that `policyExecGate` and `policyDecision` take.
 * Without it, a pattern written as a person typed it (`/tmp/…`, which on macOS
 * is really `/private/tmp/…`) would never match the resolved root that
 * `policyDecision` compares it with.
 */
export async function expandTrustPath(raw: string, home: string): Promise<string> {
  const abs = resolve(expandTilde(raw, home))
  const globAt = abs.search(/[*?]/)
  if (globAt === -1) return resolveTrustRoot(abs)
  const slash = abs.lastIndexOf('/', globAt)
  const prefix = await resolveTrustRoot(slash <= 0 ? '/' : abs.slice(0, slash))
  return prefix + abs.slice(slash)
}

/**
 * The options every `@osdlc/trust-repo` gate call takes: {@link expandTrustPath}
 * against `home`, and the {@link originOwner} lookup that `trust.owners` needs.
 * Built in one place, so a call site cannot leave out `ownerOf` and silently
 * stop honouring `trust.owners`.
 */
export function trustPolicyOptions(home: string): PolicyDecisionOptions {
  return { expandPath: (raw) => expandTrustPath(raw, home), ownerOf: originOwner }
}

/**
 * Sort runner-keyed items for display: the ids named in `order` first, in that
 * order, then everything else alphabetically. Alphabetical rather than
 * registry order, so adding a tool does not reorder the list.
 */
export function orderRunners<T extends { runner: string }>(items: T[], order?: string[]): T[] {
  const rank = new Map((order ?? []).map((id, index) => [id, index]))
  const at = (item: T): number => rank.get(item.runner) ?? Number.MAX_SAFE_INTEGER
  return [...items].sort((a, b) => {
    const diff = at(a) - at(b)
    return diff !== 0 ? diff : a.runner.localeCompare(b.runner)
  })
}
