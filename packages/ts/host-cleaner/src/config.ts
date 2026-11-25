/**
 * Where host-cleaner keeps its files, and what its config file holds. The
 * directories are `@osdlc/tiered-dirs`' `standalone('host-cleaner')` tier
 * under the `xdg` convention (see {@link hostDirs}), moved by the
 * `HOST_CLEANER_*` override variables:
 *
 *   config  `config.json`: the targets to sweep and each plugin's settings
 *   state   `receipts/`: one receipt per `clean` that was not given `--receipt`
 *   logs    `host-cleaner.log`: one JSON line per `clean`
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import { envVars, systemDirs, type ResolveOptions } from '@osdlc/cli-tool'

import { settingsIssues } from './settings.ts'

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
 * native ones. `opts` stands in for this machine's platform and home, for tests.
 *
 * @throws ConfigError when the environment cannot place them, such as a
 *   `HOST_CLEANER_CONVENTION` that is neither `native` nor `xdg`.
 */
export function hostDirs(
  env: Record<string, string | undefined> = process.env,
  opts: Pick<ResolveOptions, 'platform' | 'home'> = {},
): HostDirs {
  try {
    const dirs = systemDirs(VENDOR_DIRS, { env, convention: 'xdg', ...opts })
    const tier = dirs.standalone('host-cleaner')
    return { config: tier.config().path, state: tier.state().path, logs: tier.logs().path }
  } catch (err) {
    if (err instanceof Error && err.name === 'TieredDirsError') throw new ConfigError(err.message)
    throw err
  }
}

export const configFile = (dirs: HostDirs): string => join(dirs.config, 'config.json')

/** A config file, or a folder variable, that cannot be used; the CLI exits 2 for it. */
export class ConfigError extends Error {
  override name = 'ConfigError'
}

/**
 * The config at `path`, and whether the file was `found`; empty when the file
 * does not exist, unless `required` (a file the person named).
 *
 * @throws ConfigError for a file that is not valid, or whose plugin entry has an unknown key or a wrong type
 */
export function readConfig(
  path: string,
  opts: { required?: boolean } = {},
): { found: boolean; config: Config } {
  if (!existsSync(path)) {
    if (opts.required) throw new ConfigError(`config ${path} does not exist`)
    return { found: false, config: ConfigSchema.parse({}) }
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    throw new ConfigError(`cannot read config ${path}: ${(err as Error).message}`)
  }
  const parsed = ConfigSchema.safeParse(raw)
  if (!parsed.success) throw new ConfigError(`bad config ${path}: ${parsed.error.message}`)
  const issues = settingsIssues(parsed.data.plugins)
  if (issues.length > 0) throw new ConfigError(`bad config ${path}: ${issues.join('; ')}`)
  return { found: true, config: parsed.data }
}
