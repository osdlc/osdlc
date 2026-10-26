/**
 * wayfinder's configuration. It is layered, and reading it runs nothing.
 * Settings people want on every run (runners to skip, paths that are not
 * project structure, whether execution is allowed, extra tools) are set once,
 * per user and per project. Flags are for one-off changes.
 *
 * {@link WayfinderConfigSchema} is the one description of the file. Validation,
 * the settable keys, the key order of a written file and `schema/config.json`
 * all come from it.
 *
 * ## Layers, lowest precedence first
 *
 *   1. {@link DEFAULT_CONFIG}: the built-in defaults.
 *   2. USER: `<config>/wayfinder/config.json` (see `xdg.ts`), or the file
 *      `WAYFINDER_CONFIG` names.
 *   3. PROJECT: `wayfinder.config.json` at the project root.
 *   4. CLI flags, applied by the caller. {@link collectOptionsFromConfig}
 *      returns the options a caller spreads its own flags on top of.
 *
 * The project file lives inside the repository being scanned, so it may not
 * set what would let a repository authorize itself, or what is a person's own
 * choice. Each of these is dropped from the project layer before the merge,
 * with a warning, and `config set --project` refuses to write it:
 *
 *   - `allowExec: true`. A project may lower `allowExec` to `false`, never
 *     raise it. Run `way trust` to give a repository lasting permission.
 *   - `trust`, whole. A repository must not pre-authorize itself, or any group
 *     of repositories that includes it.
 *   - `open`, `theme` and `skills`, which say how a person likes to work.
 *
 * `runners.timeout` from a project can only lower a limit: it caps each
 * runner's own limit, or the user's value. A project value above the user's,
 * or a project `null` that would undo it, is dropped with a warning.
 *
 * `tools` is gated too, because a tool module is code. User-layer entries
 * always load; project-layer entries load only when the repository is trusted
 * and execution is allowed (see `tools.ts`).
 *
 * `WAYFINDER_CONFIG=/path/to/file` changes only where the user layer is read
 * from. Naming a file that does not exist is an error, not an empty layer. A
 * relative value is ignored with a warning, since from the project root it
 * would name a file in the repository.
 *
 * ## Merge rule
 *
 * Objects merge key by key. Everything else, scalars and arrays alike,
 * replaces the lower value whole. A project that says `order: ["just"]` means
 * that list, not that list appended to the user's.
 *
 * ## Unknown keys and broken files
 *
 * An unknown key is a warning naming the file and the key, with the closest
 * known key, and the rest of the file still loads: a file written for a newer
 * version must not break an older one. A malformed file, or a value of the
 * wrong type for a known key, is a {@link ConfigError} naming the file and the
 * problem. `$schema` is accepted and ignored.
 */

import { constants, existsSync } from 'node:fs'
import { lstat, open, readlink, realpath, type FileHandle } from 'node:fs/promises'
import { dirname, isAbsolute, join as joinPath, resolve } from 'node:path'

import { z } from 'zod'

import { closestMatches } from '@osdlc/config-layers/did-you-mean'
import { atomicWriteAsync } from '@osdlc/etag-write'
import {
  expandTrustPath,
  homeDir,
  type PolicyDecisionOptions,
  type TrustPolicy,
} from '@osdlc/trust-repo'
import { originOwner } from '@osdlc/trust-repo/git'

import { APP, BIN, CONFIG_ENV_VAR, PROJECT_CONFIG_FILENAME } from './app.ts'
import { THEME_VALUES, type Theme } from './config-keys.ts'
import { appDirs, expandTilde, pre08Bases, USER_CONFIG_FILENAME } from './xdg.ts'
import type { WayOptions } from './catalog.ts'
import { SKILLS_SETTING_VALUES, type SkillsSetting } from './core/skills.ts'

export { CONFIG_ENV_VAR, PROJECT_CONFIG_FILENAME, USER_CONFIG_FILENAME }

/**
 * The URL a written file's `$schema` names: the schema this release line ships
 * in `schema/config.json`. Raise it with each minor release, here, in
 * `schema/config.json` and in the configuration guide; tests check all three.
 */
export const CONFIG_SCHEMA_URL = 'https://unpkg.com/@osdlc/wayfinder@0.10/schema/config.json'

const strings = (description: string) => z.array(z.string()).describe(description)

/** One set of trust rules: globs over the resolved root, and origin owners. */
const TrustRulesSchema = z.object({
  paths: strings(
    'Glob patterns over the repository root, symlinks resolved: *, ?, ** and a trailing /** for ' +
      'descendants only. A leading ~ is your home.',
  ).optional(),
  owners: strings(
    'Origin remote owners, as host/owner, or a bare owner for github.com/owner. Case-insensitive.',
  ).optional(),
})

/** The `discovery` values. */
export const DISCOVERY_VALUES = ['git', 'walk', 'auto'] as const

/** The smallest `runners.timeout`, in seconds. */
export const MIN_RUNNER_TIMEOUT_S = 1
/** The largest `runners.timeout`, in seconds: one hour. */
export const MAX_RUNNER_TIMEOUT_S = 3600

/** The `open` values: what the bare `way` command opens. */
export const OPEN_VALUES = ['tui', 'web'] as const
/** What the bare `way` command opens. */
export type OpenSurface = (typeof OPEN_VALUES)[number]

export { THEME_VALUES, type Theme } from './config-keys.ts'

/**
 * The configuration file, as a Zod schema. Every key is optional; the defaults
 * are {@link DEFAULT_CONFIG}.
 */
export const WayfinderConfigSchema = z
  .object({
    $schema: z.string().describe('The JSON Schema this file follows. Ignored by wayfinder.'),
    runners: z
      .object({
        disabled: strings('Runner ids to skip entirely.'),
        order: strings('Preferred display order. Runners not named follow alphabetically.'),
        timeout: z
          .number()
          .min(MIN_RUNNER_TIMEOUT_S)
          .max(MAX_RUNNER_TIMEOUT_S)
          .nullable()
          .describe(
            'Seconds one runner may take to list its tasks, its subprocesses included. A runner ' +
              'still running then is stopped and shows "timed out". null (the default): each ' +
              'runner has its own limit, 10 for just and task, 30 for mise and rake, 120 for ' +
              'moon, 300 for gradle and sbt, 60 for the rest. A project file can only lower a ' +
              'limit: each runner takes the smaller of its value and the limit it would have.',
          ),
      })
      .partial()
      .describe('Which runners are read, and in what order they are shown.'),
    allowExec: z
      .boolean()
      .describe(
        'Whether runners that must run a subprocess may be read. Execution also needs a trusted ' +
          'repository. A project file may only set false.',
      ),
    discovery: z
      .enum(DISCOVERY_VALUES)
      .describe('How directories are found: git-tracked files, a directory walk, or auto.'),
    excludePaths: strings(
      'Paths to leave out of discovery. A bare name matches any path segment; a value with a ' +
        'slash matches a path from the root and the tree beneath it.',
    ),
    trust: TrustRulesSchema.extend({
      tools: z
        .record(z.string().min(1), TrustRulesSchema)
        .describe(
          'Rules that trust one tool each, keyed by tool id. They are checked after the ' +
            'top-level rules.',
        )
        .optional(),
    }).describe(
      'Repositories trusted without a marker. User config only: a project file cannot set it.',
    ),
    tools: strings(
      'Modules that export extra tools. A relative path resolves against the file that names it.',
    ),
    open: z
      .enum(OPEN_VALUES)
      .describe(
        'What the bare way command opens: the terminal UI or the web view. User config only.',
      ),
    theme: z.enum(THEME_VALUES).describe('The web view theme. User config only.'),
    skills: z
      .enum(SKILLS_SETTING_VALUES)
      .describe(
        "Which agent skills the Skills group lists: the repository's (project), those and your " +
          "own and your plugins' (all), or none (off). User config only.",
      ),
  })
  .partial()
  .describe('wayfinder configuration: wayfinder.config.json or the user config file.')

/** The configuration document. */
export type WayfinderConfig = Omit<z.infer<typeof WayfinderConfigSchema>, '$schema'>

/**
 * The configuration document.
 * @deprecated Use {@link WayfinderConfig}.
 */
export type TaskConfig = WayfinderConfig

/** `config.runners`. */
export type RunnersConfig = NonNullable<WayfinderConfig['runners']>

/** `config.trust`: the policy `@osdlc/trust-repo`'s `policyExecGate` decides over. User layer only. */
export type TrustConfig = NonNullable<WayfinderConfig['trust']>

/** The schema's JSON Schema, as shipped in `schema/config.json`. */
export function configJsonSchema(): Record<string, unknown> {
  const { $schema, ...schema } = z.toJSONSchema(WayfinderConfigSchema, { io: 'input' }) as Record<
    string,
    unknown
  >
  return { $schema, $id: CONFIG_SCHEMA_URL, title: 'wayfinder configuration', ...schema }
}

// ── Schema walking ──────────────────────────────────────────────────────────

function unwrap(schema: z.ZodType): z.ZodType {
  let s = schema
  while (s instanceof z.ZodOptional) s = s.unwrap() as z.ZodType
  return s
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return `a ${typeof value}`
}

/** What a leaf expects, in words: `true or false`, `one of git, walk, auto`. */
function expectation(schema: z.ZodType): string {
  const s = unwrap(schema)
  if (s instanceof z.ZodBoolean) return 'true or false'
  if (s instanceof z.ZodNullable) return `${expectation(s.unwrap() as z.ZodType)}, or null`
  if (s instanceof z.ZodNumber)
    return `a number from ${MIN_RUNNER_TIMEOUT_S} to ${MAX_RUNNER_TIMEOUT_S}`
  if (s instanceof z.ZodEnum) return `one of ${s.options.join(', ')}`
  if (s instanceof z.ZodArray) return 'an array of strings'
  if (s instanceof z.ZodString) return 'a string'
  return 'an object'
}

const join = (prefix: string, key: string): string => (prefix === '' ? key : `${prefix}.${key}`)

/**
 * The schema node a dotted key names, or undefined. A record (`trust.tools`)
 * takes any key, so `trust.tools.mise.paths` names a node.
 */
function schemaAt(key: string): z.ZodType | undefined {
  if (key === '' || key === '$schema') return undefined
  let node: z.ZodType = WayfinderConfigSchema
  for (const segment of key.split('.')) {
    const s = unwrap(node)
    if (s instanceof z.ZodObject) {
      const next = (s.shape as Record<string, z.ZodType>)[segment]
      if (next === undefined || !Object.hasOwn(s.shape, segment)) return undefined
      node = next
    } else if (s instanceof z.ZodRecord) {
      if (!(s.keyType as z.ZodType).safeParse(segment).success) return undefined
      node = s.valueType as z.ZodType
    } else {
      return undefined
    }
  }
  return node
}

/** The dotted leaf keys under `schema`: an object is walked, anything else (a record too) is a leaf. */
function leafKeys(schema: z.ZodType, prefix: string): string[] {
  const s = unwrap(schema)
  if (!(s instanceof z.ZodObject)) return [prefix]
  return Object.entries(s.shape as Record<string, z.ZodType>).flatMap(([key, child]) =>
    key === '$schema' ? [] : leafKeys(child, join(prefix, key)),
  )
}

/**
 * Every setting, in schema order: the dotted names `config list` shows and
 * `config set` accepts. `trust.tools` is one setting whose value is an
 * object; `config set` also takes a key under it, such as
 * `trust.tools.mise.paths`.
 */
export const CONFIG_KEYS: readonly string[] = leafKeys(WayfinderConfigSchema, '')

export { CLI_ONLY_KEYS, USER_ONLY_KEYS } from './config-keys.ts'

/** Whether `key` is `top` or a key under it. */
function under(key: string, top: string): boolean {
  return key === top || key.startsWith(`${top}.`)
}

/**
 * Why the project file may not hold `value` at `key`, in a few words, or null
 * when it may. `config explain` shows it beside an ignored project value.
 */
export function projectIgnoreReason(key: string, value: unknown): string | null {
  if (under(key, 'trust')) return 'a repository cannot grant itself trust'
  if (under(key, 'open') || under(key, 'theme') || under(key, 'skills')) {
    return 'a personal setting, for the user config'
  }
  if (key === 'allowExec' && value === true) return 'a repository cannot turn execution on'
  return null
}

/**
 * Why `value` may not be written at `key` in the project file, or null when
 * it may. `config set --project` and the web view's save both ask this.
 */
export function projectWriteRefusal(key: string, value: unknown): string | null {
  const reason = projectIgnoreReason(key, value)
  if (reason === null) return null
  const fix =
    key === 'allowExec'
      ? `run "${BIN} trust" to trust this repository`
      : 'set it in your user config'
  return `${key === 'allowExec' ? 'allowExec: true' : key} cannot be set in a project file: ${reason}; ${fix}`
}

// ── Errors and locations ────────────────────────────────────────────────────

/**
 * A configuration file that cannot be honoured: unparseable, or holding a
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

export type ConfigLayer = 'default' | 'user' | 'project'

export interface ConfigLocations {
  /** Absolute path of the user layer's file, whether or not it exists. */
  user: string
  /** True when {@link CONFIG_ENV_VAR} supplied that path. */
  userFromEnv: boolean
  /** {@link CONFIG_ENV_VAR} when it supplied the path, else null. */
  userEnvVar: string | null
  /** A relative {@link CONFIG_ENV_VAR} value, which is ignored. Null when none was. */
  userEnvIgnored: { variable: string; value: string } | null
  /** Absolute path of `<root>/wayfinder.config.json`, whether or not it exists. */
  project: string
}

/**
 * Where each layer's file lives. `env` and `home` are injectable so a test
 * does not read the developer's own config. Nothing is read.
 *
 * A leading `~` in {@link CONFIG_ENV_VAR} is expanded against `home`: `.env`
 * loaders, direnv and CI YAML pass a literal tilde through. A relative value
 * is ignored and `userEnvIgnored` says so.
 */
export function configLocations(
  root: string,
  env: Record<string, string | undefined> = process.env,
  home: string = homeDir(),
): ConfigLocations {
  const raw = env[CONFIG_ENV_VAR]?.trim()
  const named = raw !== undefined && raw !== '' ? raw : null
  const expanded = named === null ? null : expandTilde(named, home)
  const envPath = expanded !== null && isAbsolute(expanded) ? resolve(expanded) : null
  return {
    user: envPath ?? appDirs({ env, home }).userConfig,
    userFromEnv: envPath !== null,
    userEnvVar: envPath !== null ? CONFIG_ENV_VAR : null,
    userEnvIgnored:
      named !== null && envPath === null ? { variable: CONFIG_ENV_VAR, value: named } : null,
    project: resolve(root, PROJECT_CONFIG_FILENAME),
  }
}

/**
 * The warning for a Windows user config left where releases before 0.8 kept
 * it (`~\.config\wayfinder\config.json`), when there is none at the new
 * path. That file is not read, so its settings, `allowExec: false` among
 * them, no longer apply. Null when there is nothing to say.
 */
export function movedUserConfigWarning(
  locations: ConfigLocations,
  env: Record<string, string | undefined>,
  home: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform !== 'win32' || locations.userFromEnv) return null
  const old = joinPath(pre08Bases(env, home).config, APP, USER_CONFIG_FILENAME)
  if (resolve(old) === resolve(locations.user) || !existsSync(old)) return null
  if (existsSync(locations.user)) return null
  return (
    `${old}: this user config is from before 0.8 and is no longer read, so none of its ` +
    `settings apply; move it to ${locations.user}`
  )
}

/** The warning for a relative {@link CONFIG_ENV_VAR} that was ignored, or null. */
export function envIgnoredWarning(locations: ConfigLocations): string | null {
  if (locations.userEnvIgnored === null) return null
  const { variable, value } = locations.userEnvIgnored
  return (
    `${variable}=${value} is ignored because it is not an absolute path; ` +
    `use an absolute path or ~/. Reading ${locations.user} instead`
  )
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Check `value` against `schema` at `key`, returning it with unknown keys
 * removed. Unknown keys add a warning; a wrong value throws.
 */
function check(
  schema: z.ZodType,
  value: unknown,
  key: string,
  file: string,
  warnings: string[],
): unknown {
  const where = file === '' ? '' : `${file}: `
  const s = unwrap(schema)
  if (s instanceof z.ZodObject) {
    if (!isPlainObject(value)) {
      throw new ConfigError(
        key === ''
          ? `${where}expected a JSON object, got ${describe(value)}`
          : `${where}${key} must be an object, got ${describe(value)}`,
        file,
      )
    }
    const shape = s.shape as Record<string, z.ZodType>
    const out: Record<string, unknown> = {}
    for (const [inner, innerValue] of Object.entries(value)) {
      if (innerValue === undefined) continue
      const child = Object.hasOwn(shape, inner) ? shape[inner] : undefined
      if (child === undefined) {
        const close = closestMatches(
          inner,
          Object.keys(shape).filter((k) => k !== '$schema'),
        ).map((k) => join(key, k))
        warnings.push(
          `${where}unknown setting "${join(key, inner)}" (ignored)` +
            (close.length > 0 ? `; did you mean ${close.join(', ')}?` : ''),
        )
        continue
      }
      out[inner] = check(child, innerValue, join(key, inner), file, warnings)
    }
    return out
  }
  if (s instanceof z.ZodRecord) {
    if (!isPlainObject(value)) {
      throw new ConfigError(`${where}${key} must be an object, got ${describe(value)}`, file)
    }
    const out: Record<string, unknown> = {}
    for (const [inner, innerValue] of Object.entries(value)) {
      if (innerValue === undefined) continue
      if (!(s.keyType as z.ZodType).safeParse(inner).success) {
        throw new ConfigError(`${where}${key} has an empty key`, file)
      }
      // Assigning `__proto__` would set the object's prototype, not a key.
      if (inner === '__proto__') {
        warnings.push(`${where}"${join(key, inner)}" is not a usable key (ignored)`)
        continue
      }
      out[inner] = check(s.valueType as z.ZodType, innerValue, join(key, inner), file, warnings)
    }
    return out
  }
  const parsed = s.safeParse(value)
  if (parsed.success) return parsed.data
  // Name the offending element, not the container: "got an array" reads as a
  // contradiction when an array is what was asked for.
  if (s instanceof z.ZodArray && Array.isArray(value)) {
    const bad = value.findIndex((item) => !(s.element as z.ZodType).safeParse(item).success)
    throw new ConfigError(
      `${where}${key} must be ${expectation(s)}, got ${describe(value[bad])} at index ${bad}`,
      file,
    )
  }
  const got =
    s instanceof z.ZodEnum || typeof value === 'number' ? JSON.stringify(value) : describe(value)
  throw new ConfigError(`${where}${key} must be ${expectation(s)}, got ${got}`, file)
}

/**
 * Validate a parsed JSON document against {@link WayfinderConfigSchema}.
 *
 * Throws {@link ConfigError} on a wrong value. Returns the known keys (without
 * `$schema`) plus one warning per unknown key. Because the result holds only
 * known keys, the write path never goes through this shape (see
 * {@link readRawConfigFile}).
 */
export function validateConfig(
  raw: unknown,
  file: string,
): { config: WayfinderConfig; warnings: string[] } {
  const warnings: string[] = []
  const checked = check(WayfinderConfigSchema, raw, '', file, warnings) as Record<string, unknown>
  const { $schema: _schema, ...config } = checked
  return { config: config as WayfinderConfig, warnings }
}

// ── Merge ───────────────────────────────────────────────────────────────────

/** A deep copy that shares no object or array with `value`. */
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
    const below = base[key]
    const above = over[key]
    if (above === undefined) out[key] = cloneValue(below)
    else if (isPlainObject(below) && isPlainObject(above)) out[key] = deepMerge(below, above)
    else out[key] = cloneValue(above)
  }
  return out
}

/**
 * Merge `over` onto `base` per the module's rule: objects key by key, scalars
 * and arrays replaced whole. Neither argument is changed, and the result
 * shares no object or array with either, so mutating a loaded config cannot
 * change {@link DEFAULT_CONFIG}.
 */
export function mergeConfig(base: WayfinderConfig, over: WayfinderConfig): WayfinderConfig {
  return deepMerge(base, over) as WayfinderConfig
}

/**
 * The built-in defaults layer. Every setting is present, so
 * {@link LoadedConfig.sources} has an entry for each one.
 *
 * `allowExec: true` does not mean "run this repository's code". The
 * repository must also be trusted, and a configured `false` still means no
 * execution.
 */
export const DEFAULT_CONFIG: Required<WayfinderConfig> = {
  runners: { disabled: [], order: [], timeout: null },
  allowExec: true,
  discovery: 'auto',
  excludePaths: [],
  trust: { paths: [], owners: [], tools: {} },
  tools: [],
  open: 'tui',
  theme: 'system',
  skills: 'project',
}

// ── Files ───────────────────────────────────────────────────────────────────

/** The largest config file read. A real one is a few kilobytes. */
const MAX_CONFIG_BYTES = 1024 * 1024

/**
 * One layer file's text, or null when it does not exist. The project file is
 * repository content, so only a regular file of at most
 * {@link MAX_CONFIG_BYTES} is read: a committed link to `/dev/zero` or a FIFO
 * must not hang or fill memory. Opened non-blocking, so a FIFO does not wait
 * for a writer.
 */
async function readConfigText(file: string): Promise<string | null> {
  let handle: FileHandle
  try {
    handle = await open(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new ConfigError(`${file}: cannot be read — ${(err as Error).message}`, file)
  }
  try {
    const info = await handle.stat()
    if (!info.isFile()) {
      throw new ConfigError(`${file}: cannot be read — it is not a regular file`, file)
    }
    const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead > MAX_CONFIG_BYTES) {
      throw new ConfigError(`${file}: cannot be read — it is larger than 1 MB`, file)
    }
    return buffer.subarray(0, bytesRead).toString('utf8')
  } catch (err) {
    if (err instanceof ConfigError) throw err
    throw new ConfigError(`${file}: cannot be read — ${(err as Error).message}`, file)
  } finally {
    await handle.close()
  }
}

/**
 * One layer file as a plain object. `null` when the file does not exist. A
 * file that is unreadable, not JSON, or not an object throws
 * {@link ConfigError} naming it.
 */
async function readJsonFile(file: string): Promise<Record<string, unknown> | null> {
  const text = await readConfigText(file)
  if (text === null) return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (err) {
    throw new ConfigError(`${file}: invalid JSON — ${(err as Error).message}`, file)
  }
  if (!isPlainObject(value)) {
    throw new ConfigError(`${file}: expected a JSON object, got ${describe(value)}`, file)
  }
  return value
}

/**
 * The file's parsed object, unvalidated and with every key intact. `set` and
 * `unset` edit this object, not the validated shape, because validation drops
 * unknown keys: writing a validated document back would delete a setting a
 * newer version had written. `null` when the file does not exist.
 */
export async function readRawConfigFile(file: string): Promise<Record<string, unknown> | null> {
  return readJsonFile(file)
}

/**
 * Read, parse and validate one layer. `null` when the file does not exist,
 * which is normal. A file that exists and is broken throws {@link ConfigError}.
 */
export async function readConfigFile(
  file: string,
): Promise<{ config: WayfinderConfig; warnings: string[] } | null> {
  const raw = await readJsonFile(file)
  if (raw === null) return null
  return validateConfig(raw, file)
}

/** `record` with known keys in schema order, unknown keys after them in their own order. */
function stabilize(record: Record<string, unknown>, schema: z.ZodType): Record<string, unknown> {
  const s = unwrap(schema)
  const out: Record<string, unknown> = {}
  if (s instanceof z.ZodRecord) {
    for (const [key, value] of Object.entries(record)) {
      out[key] = isPlainObject(value) ? stabilize(value, s.valueType as z.ZodType) : value
    }
    return out
  }
  const shape = s instanceof z.ZodObject ? (s.shape as Record<string, z.ZodType>) : {}
  const known = Object.keys(shape).filter((key) => key in record)
  const rest = Object.keys(record).filter((key) => !Object.hasOwn(shape, key))
  for (const key of [...known, ...rest]) {
    const value = record[key]
    const child = Object.hasOwn(shape, key) ? shape[key] : undefined
    out[key] = child !== undefined && isPlainObject(value) ? stabilize(value, child) : value
  }
  return out
}

/**
 * Write a configuration file atomically: a temporary file, then a rename, so
 * a crash or two saves at once never leave a truncated file. Known keys come
 * in schema order, unknown keys after them in the order they had, with a
 * two-space indent and a trailing newline. A file with no `$schema` gets
 * {@link CONFIG_SCHEMA_URL}. Parent directories are created.
 *
 * Writing an unchanged document gives an unchanged file, so a config under
 * version control shows no diff because a key moved. Accepts a raw record, so
 * an edit can keep unknown keys.
 */
export async function writeConfigFile(
  file: string,
  config: WayfinderConfig | Record<string, unknown>,
): Promise<void> {
  const record = config as Record<string, unknown>
  const withSchema = '$schema' in record ? record : { $schema: CONFIG_SCHEMA_URL, ...record }
  const body = JSON.stringify(stabilize(withSchema, WayfinderConfigSchema), null, 2)
  await atomicWriteAsync(file, `${body}\n`)
}

// ── Loading ─────────────────────────────────────────────────────────────────

export interface LoadedConfig {
  /** Defaults, then user, then project, merged. The values a caller should use. */
  effective: WayfinderConfig
  /**
   * The layers as they were applied. `project` has already had the keys a
   * project may not set removed, so it matches `effective` and `sources`.
   */
  layers: {
    default: WayfinderConfig
    user: WayfinderConfig | null
    project: WayfinderConfig | null
  }
  /** The layers as their files say, validated but before any key was removed. */
  files: { user: WayfinderConfig | null; project: WayfinderConfig | null }
  /** Each key of {@link CONFIG_KEYS} to the layer that supplied its value. */
  sources: Map<string, ConfigLayer>
  locations: ConfigLocations
  /** Warnings from every layer: unknown keys, ignored project keys, an ignored env path. */
  warnings: string[]
}

/**
 * The project layer with what a project may not set removed, and a warning
 * for each removal that could have mattered.
 */
function projectRules(
  project: WayfinderConfig,
  user: WayfinderConfig | null,
  locations: ConfigLocations,
): { project: WayfinderConfig; warnings: string[] } {
  const warnings: string[] = []
  const out: Record<string, unknown> = { ...project }
  const timeout = project.runners?.timeout
  const userTimeout = user?.runners?.timeout
  if (
    timeout !== undefined &&
    typeof userTimeout === 'number' &&
    (timeout === null || timeout > userTimeout)
  ) {
    warnings.push(
      `${locations.project}: runners.timeout ${JSON.stringify(timeout)} is ignored — a project ` +
        `file can only lower the limit below your user value (${userTimeout})`,
    )
    const { timeout: _dropped, ...runners } = project.runners!
    out['runners'] = runners
  }
  if (project.allowExec === true) {
    // Warned even when the user layer also says true: the file's setting is
    // never honoured, and its author might rely on it.
    warnings.push(
      `${locations.project}: allowExec: true is ignored in a project file — a repository cannot grant itself permission to run subprocesses; run "${BIN} trust" to trust this repository`,
    )
    delete out['allowExec']
  }
  if (project.trust !== undefined) {
    // Dropped whole: even an empty `paths: []` would replace the user's list
    // in the merge. Warned only when it granted something.
    const t = project.trust
    const grants =
      (t.paths?.length ?? 0) > 0 ||
      (t.owners?.length ?? 0) > 0 ||
      Object.keys(t.tools ?? {}).length > 0
    if (grants) {
      warnings.push(
        `${locations.project}: trust is ignored in a project file — a repository cannot grant ` +
          `itself trust; set it in your user config (${locations.user}) instead`,
      )
    }
    delete out['trust']
  }
  for (const key of ['open', 'theme', 'skills'] as const) {
    if (project[key] !== undefined) {
      warnings.push(
        `${locations.project}: ${key} is ignored in a project file — it is a personal setting; ` +
          `set it in your user config (${locations.user}) instead`,
      )
      delete out[key]
    }
  }
  return { project: out as WayfinderConfig, warnings }
}

/**
 * Load every layer and merge them. `env` and `home` are injectable for the
 * same reason {@link configLocations} takes them.
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
      `${locations.user}: ${CONFIG_ENV_VAR} names a file that does not exist`,
      locations.user,
    )
  }
  const projectRead = await readConfigFile(locations.project)

  const warnings: string[] = []
  const ignored = envIgnoredWarning(locations)
  if (ignored !== null) warnings.push(ignored)
  const moved = movedUserConfigWarning(locations, env, home)
  if (moved !== null) warnings.push(moved)
  warnings.push(...(userRead?.warnings ?? []), ...(projectRead?.warnings ?? []))

  const user = userRead?.config ?? null
  let project: WayfinderConfig | null = null
  if (projectRead !== null) {
    const ruled = projectRules(projectRead.config, user, locations)
    project = ruled.project
    warnings.push(...ruled.warnings)
  }

  const effective = mergeConfig(mergeConfig(DEFAULT_CONFIG, user ?? {}), project ?? {})

  const sources = new Map<string, ConfigLayer>()
  for (const key of CONFIG_KEYS) {
    sources.set(
      key,
      project !== null && getConfigValue(project, key) !== undefined
        ? 'project'
        : user !== null && getConfigValue(user, key) !== undefined
          ? 'user'
          : 'default',
    )
  }

  return {
    effective,
    layers: { default: DEFAULT_CONFIG, user, project },
    files: { user, project: projectRead?.config ?? null },
    sources,
    locations,
    warnings,
  }
}

// ── The shared reader and writer ────────────────────────────────────────────

/** One setting's effective value and where it came from. */
export interface SettingValue<T = unknown> {
  /** The dotted key: `runners.order`. */
  key: string
  value: T
  /** The layer that set it, or `default`. */
  source: ConfigLayer
  /** The file that set it. Null for the default. */
  file: string | null
}

/**
 * The settings every surface shows, read once. The terminal UI, the web view
 * and `way config list` all take their values from {@link readSettings}, so
 * they show the same answer.
 */
export interface Settings {
  /** The full load, for a caller that needs the layers. */
  loaded: LoadedConfig
  /** Every key of {@link CONFIG_KEYS}, in order. */
  settings: SettingValue[]
  /** The configured `allowExec`. Execution also needs a trusted repository. */
  allowExec: SettingValue<boolean>
  /** What the bare `way` command opens. */
  open: SettingValue<OpenSurface>
  /** The web view's theme. */
  theme: SettingValue<Theme>
  /** The runner display order. */
  runnerOrder: SettingValue<string[]>
  /** Which agent skills the Skills group lists. */
  skills: SettingValue<SkillsSetting>
  warnings: string[]
}

/** One setting of `loaded`. */
function settingOf<T>(loaded: LoadedConfig, key: string): SettingValue<T> {
  const source = loaded.sources.get(key) ?? 'default'
  return {
    key,
    value: getConfigValue(loaded.effective, key) as T,
    source,
    file:
      source === 'user'
        ? loaded.locations.user
        : source === 'project'
          ? loaded.locations.project
          : null,
  }
}

/**
 * Read every layer for `root` and return each setting's effective value and
 * source. Throws {@link ConfigError} for a broken file.
 */
export async function readSettings(
  root: string,
  env: Record<string, string | undefined> = process.env,
  home: string = homeDir(),
): Promise<Settings> {
  return settingsFrom(await loadConfig(root, env, home))
}

/** {@link Settings} from a config already loaded. */
function settingsFrom(loaded: LoadedConfig): Settings {
  return {
    loaded,
    settings: CONFIG_KEYS.map((key) => settingOf(loaded, key)),
    allowExec: settingOf<boolean>(loaded, 'allowExec'),
    open: settingOf<OpenSurface>(loaded, 'open'),
    theme: settingOf<Theme>(loaded, 'theme'),
    runnerOrder: settingOf<string[]>(loaded, 'runners.order'),
    skills: settingOf<SkillsSetting>(loaded, 'skills'),
    warnings: loaded.warnings,
  }
}

/** A file layer a setting can be written to. */
export type WritableLayer = 'user' | 'project'

/** Where {@link writeSetting} and {@link removeSetting} write. */
export interface WriteTarget {
  layer: WritableLayer
  /** The project root. Used for the project layer. */
  root: string
  env?: Record<string, string | undefined>
  home?: string
}

/**
 * Write `value` at `key` in one layer's file, atomically, keeping every other
 * key. Throws {@link ConfigError} with an empty `file` for an unknown key, a
 * wrong value, or a key the project file may not hold (see
 * {@link projectWriteRefusal}); throws one naming the file when the file is
 * broken. Returns the file and the value as written, and warnings for unknown
 * keys inside the value.
 */
export async function writeSetting(
  target: WriteTarget,
  key: string,
  value: unknown,
): Promise<{ file: string; value: unknown; warnings: string[] }> {
  const node = schemaAt(key)
  if (node === undefined) throw new ConfigError(`unknown setting: ${key}`, '')
  const warnings: string[] = []
  const checked = check(node, value, key, '', warnings)
  if (target.layer === 'project') {
    const refused = projectWriteRefusal(key, checked)
    if (refused !== null) throw new ConfigError(refused, '')
  }
  const file = fileOf(target)
  const document = setConfigValue((await readRawConfigFile(file)) ?? {}, key, checked)
  // The whole document is checked before it is written. A failure here is a
  // bad value already in the file, so the error names the file.
  validateConfig(document, file)
  await writeConfigFile(await writePath(target, file), document)
  return { file, value: checked, warnings }
}

/** Remove `key` from one layer's file. `removed: false` when it was not set there. */
export async function removeSetting(
  target: WriteTarget,
  key: string,
): Promise<{ file: string; removed: boolean }> {
  const file = fileOf(target)
  const document = await readRawConfigFile(file)
  if (document === null || getConfigValue(document, key) === undefined) {
    return { file, removed: false }
  }
  await writeConfigFile(await writePath(target, file), unsetConfigValue(document, key))
  return { file, removed: true }
}

/**
 * Where a write to `file` goes. The atomic write renames a new file into
 * place, which would replace a link with a regular file. A user config is
 * often a link into a dotfiles repository, so for the user layer the write
 * goes to the link's target. A project file that is a link is replaced, not
 * followed: the repository chose the link, and its target may be outside it.
 */
async function writePath(target: WriteTarget, file: string): Promise<string> {
  if (target.layer !== 'user') return file
  const info = await lstat(file).catch(() => null)
  if (info === null || !info.isSymbolicLink()) return file
  return realpath(file).catch(async () => resolve(dirname(file), await readlink(file)))
}

function fileOf(target: WriteTarget): string {
  // Locations, not a load: where to write must not depend on the other layer
  // parsing, and `--user` must work when WAYFINDER_CONFIG names a file that
  // does not exist yet.
  const locations = configLocations(target.root, target.env, target.home)
  return target.layer === 'user' ? locations.user : locations.project
}

// ── Dotted paths ────────────────────────────────────────────────────────────

/** Read a dotted path: `"runners.order"`, `"allowExec"`. `undefined` when absent. */
export function getConfigValue(config: object, key: string): unknown {
  let cursor: unknown = config
  for (const segment of key.split('.')) {
    if (!isPlainObject(cursor) || !Object.hasOwn(cursor, segment)) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

/**
 * Set a dotted path, returning a new document. The input is not changed.
 * Missing intermediate objects are created, so `set` works on an empty file.
 *
 * Throws {@link ConfigError} for an unknown key, a value of the wrong type, or
 * an existing intermediate value that is not an object. Given a raw record, it
 * returns a raw record with its unknown keys untouched.
 */
export function setConfigValue<T extends object>(config: T, key: string, value: unknown): T {
  const node = schemaAt(key)
  if (node === undefined) throw new ConfigError(`unknown setting: ${key}`, '')
  const checked = check(node, value, key, '', [])

  const segments = key.split('.')
  const root: Record<string, unknown> = { ...(config as Record<string, unknown>) }
  let cursor = root
  let walked = ''
  for (const segment of segments.slice(0, -1)) {
    walked = join(walked, segment)
    const existing = cursor[segment]
    // A container of the wrong type means the file is broken. Replacing it
    // would delete whatever the user meant by it.
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
 * Remove a dotted path, returning a new document. A container left empty by
 * the removal is removed too. Any key may be unset, including one this
 * version does not know, so a stale setting can be removed.
 */
export function unsetConfigValue<T extends object>(config: T, key: string): T {
  const segments = key.split('.')
  const record = config as Record<string, unknown>
  const head = segments[0] as string
  if (!Object.hasOwn(record, head)) return { ...record } as T
  const out = { ...record }
  if (segments.length === 1) {
    delete out[head]
    return out as T
  }
  const child = record[head]
  if (!isPlainObject(child)) return out as T
  const pruned = unsetConfigValue(child, segments.slice(1).join('.'))
  if (Object.keys(pruned).length === 0) delete out[head]
  else out[head] = pruned
  return out as T
}

/**
 * Parse a value typed on a command line: JSON first, so `true` and
 * `["a","b"]` keep their types, else the bare string.
 */
export function parseConfigValue(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/** The key a typed key names, or undefined when it names no setting. */
export function resolveConfigKey(key: string): string | undefined {
  return schemaAt(key) === undefined ? undefined : key
}

// ── Uses of the config ──────────────────────────────────────────────────────

type ConfigOptions = Pick<
  WayOptions,
  'exclude' | 'allowExec' | 'discovery' | 'excludePaths' | 'probeTimeoutMs' | 'maxProbeTimeoutMs'
>

/**
 * The {@link WayOptions} fields this configuration controls. Only keys the
 * config sets are present, so a caller spreads its own flags after it.
 *
 * With `layers`, `runners.timeout` comes from them: the user's value replaces
 * each runner's limit, and the project's caps it. Without, `config`'s value
 * replaces each runner's limit.
 */
export function collectOptionsFromConfig(
  config: WayfinderConfig,
  layers?: { user: WayfinderConfig | null; project: WayfinderConfig | null },
): ConfigOptions {
  const options: ConfigOptions = {}
  const disabled = config.runners?.disabled
  if (disabled !== undefined) options.exclude = [...disabled]
  const ms = (seconds: number | null | undefined): number | undefined =>
    typeof seconds === 'number' ? Math.round(seconds * 1000) : undefined
  const replace = ms(layers === undefined ? config.runners?.timeout : layers.user?.runners?.timeout)
  if (replace !== undefined) options.probeTimeoutMs = replace
  const cap = ms(layers?.project?.runners?.timeout)
  if (cap !== undefined) options.maxProbeTimeoutMs = cap
  if (config.allowExec !== undefined) options.allowExec = config.allowExec
  if (config.discovery !== undefined) options.discovery = config.discovery
  if (config.excludePaths !== undefined) options.excludePaths = [...config.excludePaths]
  return options
}

/**
 * `config.trust` as the policy `@osdlc/trust-repo` expects: the top-level
 * rules, and `trust.tools` as its per-scope rules.
 */
export function trustPolicyFromConfig(config: WayfinderConfig): TrustPolicy {
  const tools = config.trust?.tools ?? {}
  const scopes: NonNullable<TrustPolicy['scopes']> = {}
  for (const [id, rules] of Object.entries(tools)) {
    scopes[id] = { paths: rules.paths ?? [], owners: rules.owners ?? [] }
  }
  return {
    paths: config.trust?.paths ?? [],
    owners: config.trust?.owners ?? [],
    ...(Object.keys(scopes).length > 0 ? { scopes } : {}),
  }
}

/**
 * The options every `@osdlc/trust-repo` gate call takes: `expandTrustPath`
 * against `home`, and the git-backed `originOwner` lookup that `trust.owners`
 * needs. Built in one place, so a call site cannot leave out `ownerOf`.
 */
export function trustPolicyOptions(home: string): PolicyDecisionOptions {
  return { expandPath: (raw) => expandTrustPath(raw, home), ownerOf: originOwner }
}

/**
 * Sort runner-keyed items for display: the ids named in `order` first, in that
 * order, then everything else alphabetically.
 */
export function orderRunners<T extends { runner: string }>(items: T[], order?: string[]): T[] {
  const rank = new Map((order ?? []).map((id, index) => [id, index]))
  const at = (item: T): number => rank.get(item.runner) ?? Number.MAX_SAFE_INTEGER
  return [...items].sort((a, b) => {
    const diff = at(a) - at(b)
    return diff !== 0 ? diff : a.runner.localeCompare(b.runner)
  })
}
