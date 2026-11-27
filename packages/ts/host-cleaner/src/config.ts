/**
 * Where host-cleaner keeps its files, and what its config file holds. The
 * directories are `@osdlc/tiered-dirs`' `standalone('host-cleaner')` tier
 * under the `xdg` convention (see {@link hostDirs}), moved by the
 * `HOST_CLEANER_*` override variables:
 *
 *   config  `config.json`: the targets to sweep and each plugin's settings,
 *           and `descriptors/`: the user's descriptors
 *   state   `receipts/`: one receipt per `clean` that was not given `--receipt`
 *   logs    `host-cleaner.log`: one JSON line per `clean`
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import { envVars, homeDir, systemDirs, TieredDirsError, type ResolveOptions } from '@osdlc/cli-tool'

import { settingsIssues } from './settings.ts'
import type { PluginDefinition } from './types.ts'

const VENDOR_DIRS = { vendor: 'host-cleaner', envVars: envVars('HOST_CLEANER') }

export const ConfigSchema = z.strictObject({
  /** Checkouts and directories of checkouts, swept when none is named on the command line. */
  targets: z.array(z.string().min(1)).default([]),
  /** Paths no candidate may sit in or below, for every plugin; `--ignore` adds to them. `~` is the home directory. */
  ignore: z.array(z.string().min(1)).default([]),
  /** Hours an artifact must have sat unused, for every plugin that does not set its own; 0 or more. */
  idleHours: z.number().nonnegative().optional(),
  /** Settings by plugin name; a plugin reads only its own entry. */
  plugins: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
})

export type Config = z.infer<typeof ConfigSchema>

export interface HostDirs {
  config: string
  state: string
  logs: string
}

/**
 * The directories, under the `xdg` convention. Windows has no `xdg` folders
 * and keeps its own; `HOST_CLEANER_CONVENTION=native` switches back to the
 * native ones. With `process.env`, a missing `HOME` falls back to the OS
 * account's home; an `env` passed in is the only one read.
 *
 * @param opts - A platform and home to use instead of this machine's, for tests.
 * @throws ConfigError for a folder variable that cannot be used, such as a
 *   `HOST_CLEANER_CONVENTION` that is neither `native` nor `xdg`.
 * @throws TieredDirsError with code `MISSING_BASE_DIR` when one of the three
 *   folders needs a home directory and none can be found.
 */
export function hostDirs(
  env: Record<string, string | undefined> = process.env,
  opts: Pick<ResolveOptions, 'platform' | 'home'> = {},
): HostDirs {
  return dirsUnder(env, { convention: 'xdg', ...opts })
}

/**
 * The config folder alone, by the rules of {@link hostDirs}: for when those
 * cannot place the state and logs folders (no home, and no `XDG_STATE_HOME`),
 * since reading the config needs only this one.
 *
 * @throws as {@link hostDirs} does
 */
export function hostConfigDir(
  env: Record<string, string | undefined> = process.env,
  opts: Pick<ResolveOptions, 'platform' | 'home'> = {},
): string {
  return dirsUnder(env, {
    convention: 'xdg',
    ...opts,
    overrides: { state: '/unused', logs: '/unused' },
  }).config
}

/** The `TieredDirsError` codes that name a folder variable to fix: exit 2. Any other exits 1. */
const USAGE_CODES: ReadonlySet<string> = new Set([
  'RELATIVE_OVERRIDE',
  'INVALID_CONVENTION',
  'OVERRIDE_REQUIRED',
])

/**
 * The roots host-cleaner never reads, pinned so that placing config, state and
 * logs (from `XDG_*` alone, say) needs no home directory for these.
 */
const UNREAD_ROOTS = {
  durable: '/unused',
  cache: '/unused',
  runtime: '/unused',
  scratch: '/unused',
}

// `tiered-dirs` takes any `env` passed in for a test's and never falls back to the OS home.
const envOpt = (env: Record<string, string | undefined>): { env?: typeof env } =>
  env === process.env ? {} : { env }

/**
 * The home directory `~` stands for in targets and ignore entries: the one
 * {@link hostDirs} builds the folders on, by the same rules. A `HOME` that is
 * empty or relative counts as unset.
 *
 * @throws TieredDirsError with code `MISSING_BASE_DIR` when no home can be found.
 */
export const hostHome = (env: Record<string, string | undefined> = process.env): string =>
  homeDir(envOpt(env))

function dirsUnder(env: Record<string, string | undefined>, opts: ResolveOptions): HostDirs {
  try {
    const overrides = { ...UNREAD_ROOTS, ...opts.overrides }
    const dirs = systemDirs(VENDOR_DIRS, { ...envOpt(env), ...opts, overrides })
    const tier = dirs.standalone('host-cleaner')
    return { config: tier.config().path, state: tier.state().path, logs: tier.logs().path }
  } catch (err) {
    if (err instanceof TieredDirsError && USAGE_CODES.has(err.code)) {
      throw new ConfigError(err.message)
    }
    throw err
  }
}

export const configFile = (dirs: Pick<HostDirs, 'config'>): string =>
  join(dirs.config, 'config.json')

/** The user's descriptors, which add plugins or replace shipped descriptors of the same name. */
export const descriptorsDir = (dirs: Pick<HostDirs, 'config'>): string =>
  join(dirs.config, 'descriptors')

/**
 * The config file in the native folders, when it exists and is not `xdgFile`,
 * the one {@link hostDirs} names: on macOS, a config left in
 * `~/Library/Application Support/host-cleaner/` by versions up to 0.3. Only
 * its existence is checked; it is never read. Nothing here throws: the answer
 * only decides a warning, so native folders that cannot be placed (the xdg ones
 * can be, from `XDG_*` alone, with no home directory) hold no old config.
 *
 * @param opts - A platform and home to use instead of this machine's, for tests.
 */
export function unreadNativeConfig(
  env: Record<string, string | undefined>,
  xdgFile: string,
  opts: Pick<ResolveOptions, 'platform' | 'home'> = {},
): string | undefined {
  try {
    const native = configFile(
      dirsUnder(env, { convention: 'native', conventionFromEnv: false, ...opts }),
    )
    return native !== xdgFile && existsSync(native) ? native : undefined
  } catch {
    return undefined
  }
}

/** A config file, or a folder variable, that cannot be used; the CLI exits 2 for it. */
export class ConfigError extends Error {
  override name = 'ConfigError'
}

/**
 * The config at `path`, and whether the file exists; empty when it does not,
 * unless `required` (a file the person named). Its `plugins` are checked by
 * {@link checkPlugins} against `opts.plugins`.
 *
 * @throws ConfigError for a file that is not valid, or whose plugin entry has an unknown key or a wrong type
 */
export function readConfig(
  path: string,
  opts: { required?: boolean; plugins?: readonly PluginDefinition[] } = {},
): { fileExists: boolean; config: Config } {
  if (!existsSync(path)) {
    if (opts.required) throw new ConfigError(`config ${path} does not exist`)
    return { fileExists: false, config: ConfigSchema.parse({}) }
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    throw new ConfigError(`cannot read config ${path}: ${(err as Error).message}`)
  }
  const parsed = ConfigSchema.safeParse(raw)
  if (!parsed.success) throw new ConfigError(`bad config ${path}: ${parsed.error.message}`)
  return { fileExists: true, config: checkPlugins(parsed.data, path, opts.plugins) }
}

/**
 * `config`, once each entry of its `plugins` fits the settings of the plugin
 * of its name in `plugins`, the built-ins by default; an entry no plugin has is
 * not checked. `path` is the file it came from, for the error.
 *
 * @throws ConfigError for a plugin entry with an unknown key or a wrong type
 */
export function checkPlugins(
  config: Config,
  path: string,
  plugins?: readonly PluginDefinition[],
): Config {
  const issues = settingsIssues(config.plugins, 'plugins', plugins)
  if (issues.length > 0) throw new ConfigError(`bad config ${path}: ${issues.join('; ')}`)
  return config
}
