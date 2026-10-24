/**
 * waypost's configuration: layered, and readable without running anything.
 * The settings people want every time (runners to skip, paths that are not
 * project structure, whether execution is allowed, extra tools) are set once,
 * per user and per project; flags stay for the exceptions.
 *
 * ## Layers, lowest precedence first
 *
 *   1. `DEFAULT_CONFIG` — the built-in defaults.
 *   2. USER — `$XDG_CONFIG_HOME/waypost/config.json`, or `~/.config/waypost/config.json`
 *      when `XDG_CONFIG_HOME` is unset.
 *   3. PROJECT — `waypost.config.json` at the root `findRoot` resolves.
 *   4. CLI flags — not this module's business. {@link collectOptionsFromConfig}
 *      produces the slice a caller spreads its own flags on top of.
 *
 * `allowExec` IS AN EXCEPTION TO THIS ORDER. The project layer may lower it to
 * `false` — a repository asking not to be shelled out for is safe to honour —
 * but it can never raise it to `true`. `waypost.config.json` lives INSIDE the
 * repository being scanned, so honouring `allowExec: true` from it would let a
 * repository authorize the execution of its own code. The key is therefore
 * stripped from the project layer before merging, with a warning, and only the
 * user layer and the CLI flags can turn execution on. Granting a repository
 * standing permission is `way trust`, which records the consent outside the
 * repository.
 *
 * `tools` is gated too, because a tool module is code. User-layer entries
 * always load; project-layer entries load only when the repository is trusted
 * and execution is allowed (see `tools.ts`).
 *
 * `trust` IS THE SAME EXCEPTION, more strongly: it has no "lower" state to
 * honour from the project layer at all, so ANY project-layer `trust.paths` or
 * `trust.owners` entry is dropped, with a warning — a repository must not be
 * able to pre-authorize itself, or any class of repositories including
 * itself. Only the USER layer's `trust` reaches `@osdlc/trust-repo`'s
 * `policyExecGate`, which combines it with the marker store that
 * `way trust` writes to. See that package's README for the glob dialect,
 * and `origin-owner.ts` for the origin-remote lookup `trust.owners` rests on.
 *
 * XDG is used on every platform, macOS included, as `gh` does: a developer
 * with a dotfiles repository expects this beside their other tool config.
 *
 * `WAYPOST_CONFIG=/path/to/file` replaces the USER layer's LOCATION and nothing
 * else. The named file is read INSTEAD OF the XDG path; the project layer is
 * still read from the project root, still merges on top, and cannot be turned
 * off this way. Naming a file that does not exist is an error rather than a
 * silent empty layer — an env var pointing at nothing is a typo, not a choice.
 *
 * ## Merge rule
 *
 * Objects merge key-wise; everything else — scalars and arrays alike —
 * REPLACES wholesale. Arrays replace because both of ours are answers to
 * "which ones, in what order", and a project that says `order: ["just"]` means
 * that list, not that list appended to whatever the user happened to have.
 *
 *   user    { runners: { disabled: ["cargo"], order: ["moon"] } }
 *   project { runners: {                      order: ["just"] } }
 *   result  { runners: { disabled: ["cargo"], order: ["just"] } }
 *
 * ## Unknown keys and broken files
 *
 * An unknown key is a WARNING naming the file and the key, and the rest of the
 * file still loads — a config written for a newer version must not brick an
 * older one. A file that is malformed, or that holds a wrong-typed value where
 * the type is knowable, is a {@link ConfigError} naming the file and the
 * problem. There is no silent fallback: a setting that quietly did not apply is
 * worse than one that refused to load.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { readParsedFile } from '@osdlc/config-layers'
import { resolveTrustRoot, type PolicyDecisionOptions, type TrustPolicy } from '@osdlc/trust-repo'

import type { DiscoveryMode } from '@osdlc/system-model/detect'

import { APP, BIN, CONFIG_ENV_VAR, PROJECT_CONFIG_FILENAME } from './app.ts'
import { originOwner } from './origin-owner.ts'
import { expandTilde } from './xdg.ts'
import type { WayOptions } from './catalog.ts'

export { CONFIG_ENV_VAR, PROJECT_CONFIG_FILENAME }

/** Directory under `$XDG_CONFIG_HOME` holding the USER layer. */
export const USER_CONFIG_DIR = APP

/** The `tool` key of the trust store (`$XDG_STATE_HOME/<tool>/trusted/`). */
export const TRUST_STORE_TOOL = APP

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
 * top of the marker store `way trust` writes to. USER LAYER ONLY — see
 * the module docblock's "trust IS THE SAME EXCEPTION" note; a project-layer
 * entry is dropped before the merge, with a warning.
 */
export interface TrustConfig {
  /**
   * Glob patterns (`@osdlc/trust-repo`'s dialect: `*`, `?`, `**`, a trailing
   * `/**` matching descendants only) over the resolved, symlink-free repo
   * root. A leading `~` expands against `home`; there is no `{name}` token
   * vocabulary here the way sdlc's `paths:` map has one.
   */
  paths?: string[]
  /** Origin remote owners (case-insensitive) that trust a root without a marker. */
  owners?: string[]
}

/**
 * The whole configuration document, schema v1.
 *
 * A type alias rather than an interface so it carries an implicit index
 * signature: {@link setConfigValue} and friends operate on this and on the raw
 * untyped record from a file with one implementation.
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
   * The setting a repository reaches for to say that a tree is DATA rather than
   * project structure — a fixture repo, a vendored sample. Unlike
   * `runners.disabled`, which turns off a runner everywhere in this project,
   * this leaves the runner on and narrows where it looks.
   *
   * The project layer is the natural home: which of a repository's own trees
   * are fixtures is a fact about that repository, and the same answer for
   * everyone working in it. Nothing stops the user layer from setting it, and
   * the usual replace-wholesale rule applies if both do.
   */
  excludePaths?: string[]
  /** USER LAYER ONLY. See {@link TrustConfig} and the module docblock. */
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
 * Every leaf is present, which is what makes {@link LoadedConfig.sources}
 * total: a key with no answer anywhere would otherwise have no layer to name.
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
  /** True when {@link CONFIG_ENV_VAR} supplied that path instead of XDG. */
  userFromEnv: boolean
  /** Absolute path of `<root>/waypost.config.json`, whether or not it exists. */
  project: string
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
 * Every settable key, by dotted path. This is the single list: validation,
 * {@link setConfigValue} and "is that a real setting" all read it, so a new
 * setting cannot be accepted in one path and rejected in another.
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
 * Derived from {@link FIELDS} rather than retyped, so a surface that lists the
 * keys (the `guide` command's config section) cannot fall behind the schema.
 */
export const CONFIG_KEYS: readonly string[] = Object.keys(FIELDS)

const DISCOVERY_VALUES = ['git', 'walk', 'auto'] as const

/**
 * Canonical key order for writing, schema order rather than alphabetical, so a
 * written file reads like the documented schema. Keys not listed here are
 * unknown to this version and are written after the known ones in the order the
 * file already had them.
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
 * Resolve where each layer's file lives. Pure — `env` and `home` are injectable
 * because a test that consulted the real environment would read the developer's
 * own `~/.config`, and pass or fail according to what is in it.
 *
 * Two details of how a path out of the environment is read:
 *
 * A leading `~` is expanded against `home`. A shell expands it before exec, but
 * `.env` loaders, direnv and CI YAML hand the literal tilde through, and
 * `~/config.json` quietly becoming `<somewhere>/~/config.json` is the silent
 * wrong answer this module refuses to give anywhere else.
 *
 * A RELATIVE path resolves against `root`, not the process working directory.
 * This function is otherwise a pure function of its arguments; reading
 * `process.cwd()` would smuggle an ambient input in, so a library consumer
 * scanning some other directory would get a user-layer path unrelated to the
 * directory being scanned while the project layer tracked it.
 */
export function configLocations(
  root: string,
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
): ConfigLocations {
  const base = resolve(root)
  const absolute = (path: string): string => resolve(base, expandTilde(path, home))

  const named = env[CONFIG_ENV_VAR]?.trim()
  const fromEnv = named !== undefined && named !== ''

  const xdg = env['XDG_CONFIG_HOME']?.trim()
  const configHome = xdg !== undefined && xdg !== '' ? absolute(xdg) : join(home, '.config')

  return {
    user: fromEnv ? absolute(named) : join(configHome, USER_CONFIG_DIR, USER_CONFIG_FILENAME),
    userFromEnv: fromEnv,
    project: join(base, PROJECT_CONFIG_FILENAME),
  }
}

/**
 * Validate a parsed JSON document against schema v1.
 *
 * Throws {@link ConfigError} on a type violation; returns the recognized subset
 * plus one warning per unknown key. The returned config holds ONLY known keys,
 * which is why the write path never round-trips through this shape — see
 * {@link readRawConfigFile}.
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
 * Copy a value deeply enough that the result shares no mutable structure with
 * its source. A shallow spread is not enough here: `DEFAULT_CONFIG` is an
 * exported process-wide singleton that every `loadConfig` merges on top of, so
 * a branch aliased out of it would let one caller mutating `effective` corrupt
 * the built-in defaults for every later load in the process.
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
 * Merge `over` onto `base` per the module's rule: objects key-wise, scalars and
 * arrays wholesale.
 *
 * Non-mutating in both directions: neither argument is touched, and the result
 * shares no object or array with either of them — including branches `over`
 * never mentioned. Mutating a loaded config must not reach back into
 * `DEFAULT_CONFIG`.
 */
export function mergeConfig(base: TaskConfig, over: TaskConfig): TaskConfig {
  return deepMerge(base, over) as TaskConfig
}

/**
 * One layer file as a plain object, read through `@osdlc/config-layers`'s
 * file read (the one read of a config file's bytes). `null` when the file does
 * not exist; a file that is unreadable, not JSON, or not an object throws
 * {@link ConfigError} naming it.
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
 * This is the read half of an edit that preserves what this version does not
 * understand. `set` and `unset` must apply to THIS, not to the validated shape,
 * because validation drops unknown keys — so writing a validated document back
 * would silently delete a setting a newer version had written. `null` when the
 * file does not exist.
 */
export async function readRawConfigFile(file: string): Promise<Record<string, unknown> | null> {
  return readJsonFile(file)
}

/**
 * Read, parse and validate one layer. `null` when the file does not exist —
 * absence is normal and is not an error. A file that exists and is broken
 * throws {@link ConfigError}.
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
 * unchanged file — a config under version control should not churn its diff
 * because a key moved.
 *
 * Accepts a raw record as well as a {@link TaskConfig}, which is what makes the
 * unknown-key-preserving edit path writable.
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
  /** Defaults, then user, then project. What a caller should actually act on. */
  effective: TaskConfig
  /**
   * The layers as they were APPLIED. `project` has already had a rejected
   * `allowExec: true` removed, so it matches what `effective` and `sources`
   * say. Read the file itself with {@link readRawConfigFile} to see what was
   * written.
   */
  layers: { default: TaskConfig; user: TaskConfig | null; project: TaskConfig | null }
  /**
   * Dotted key to the layer that supplied the winning value. Every leaf of
   * `effective` appears, so `way config list` can say where each value came
   * from — the question a user asks when a setting is not what they expected.
   */
  sources: Map<string, ConfigLayer>
  locations: ConfigLocations
  /** Unknown-key warnings from every layer, in layer order. */
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
  home: string = homedir(),
): Promise<LoadedConfig> {
  const locations = configLocations(root, env, home)

  const userRead = await readConfigFile(locations.user)
  if (userRead === null && locations.userFromEnv) {
    throw new ConfigError(
      `${locations.user}: ${CONFIG_ENV_VAR} names a file that does not exist`,
      locations.user,
    )
  }
  const projectRead = await readConfigFile(locations.project)

  const user = userRead?.config ?? null
  let project = projectRead?.config ?? null
  const warnings = [...(userRead?.warnings ?? []), ...(projectRead?.warnings ?? [])]

  // A repository cannot grant itself permission to run its own code. Lowering
  // to false is honoured; raising to true is dropped here, BEFORE the merge and
  // before `sources`, so `config list` attributes the value to the layer that
  // really supplied it rather than to the file that was ignored.
  //
  // Not in validateConfig: that function is layer-agnostic and is also the
  // `config set` write path's check. This rule is about which layer a value
  // came from, which only layer resolution knows.
  if (project?.allowExec === true) {
    // Warned even when the user layer already said true. The author's intent —
    // grant exec — is never honoured from this file, and silence would let them
    // believe it worked and rely on it in a repo where it does not.
    warnings.push(
      `${locations.project}: allowExec: true is ignored in a project file — a repository cannot grant itself permission to run subprocesses; run "${BIN} trust" to trust this repository`,
    )
    const { allowExec: _ignored, ...rest } = project
    project = rest
  }

  // Same rule, more strongly: a project-layer `trust` block is dropped
  // whole, whatever it holds — a repository must not be able to pre-authorize
  // itself or any class of repositories, and even an empty `paths: []` would
  // otherwise deep-merge over the user's list and silently narrow it. The
  // warning is for a non-empty block only, matching allowExec's silence on
  // `false`: an empty block granted nothing worth naming.
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
 * Set a dotted path, returning a new document. Non-mutating and creating any
 * intermediate objects, so `set` works on an empty file.
 *
 * The key must be a known setting and the value must match its type; both throw
 * {@link ConfigError} rather than writing something that will fail to load
 * next time, as does an existing intermediate value that is not an object. The
 * generic return means a raw record edits to a raw record with its unknown keys
 * untouched.
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
    // A container of the wrong type is a broken file, not a slot to overwrite:
    // silently replacing it would delete whatever the user meant by it.
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
 * Unlike `set`, any key may be unset — including one this version does not know
 * — because removing a stale setting is exactly when you need that.
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
 * Parse a value typed on a command line. JSON first, so `true`, `3` and
 * `["a","b"]` arrive as themselves; a bare word that is not valid JSON falls
 * back to the string, so `moon` does not have to be typed as `"moon"`.
 */
export function parseConfigValue(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * The {@link WayOptions} slice this configuration owns. Only keys the config
 * sets are present, so a caller spreads its own flags after it.
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
 * Expand a `trust.paths` entry's leading `~` against `home`, then
 * symlink-resolve the pattern's static prefix — the part before the first
 * glob character — through `resolveTrustRoot`.
 *
 * The injected `expandPath` `policyExecGate`/`policyDecision` take. Without it, a pattern written against the spelling a person typed
 * (`/tmp/…`, which on macOS is really `/private/tmp/…`) would silently never
 * match the RESOLVED root `@osdlc/trust-repo`'s `policyDecision` compares it
 * against.
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
 * against `home`, and the git-backed {@link originOwner} lookup `trust.owners`
 * rests on. One home for the binding, so a call site cannot leave `ownerOf` out
 * and silently stop honouring `trust.owners`.
 */
export function trustPolicyOptions(home: string): PolicyDecisionOptions {
  return { expandPath: (raw) => expandTrustPath(raw, home), ownerOf: originOwner }
}

/**
 * Sort runner-keyed items for display: the ids named in `order` first, in that
 * order, then everything else alphabetically. Alphabetical rather than
 * registry order, so adding a tool does not reshuffle the list.
 */
export function orderRunners<T extends { runner: string }>(items: T[], order?: string[]): T[] {
  const rank = new Map((order ?? []).map((id, index) => [id, index]))
  const at = (item: T): number => rank.get(item.runner) ?? Number.MAX_SAFE_INTEGER
  return [...items].sort((a, b) => {
    const diff = at(a) - at(b)
    return diff !== 0 ? diff : a.runner.localeCompare(b.runner)
  })
}
