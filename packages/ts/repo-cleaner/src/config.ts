/**
 * The standalone tool's own configuration file.
 *
 * Only the CLI reads it. The library takes repositories as an argument, so a
 * host that already knows where its repositories are passes them in and never touches this file.
 *
 * Shape, location and loading are `@osdlc/config-layers`'s machine file:
 * `<config-home>/repo-cleaner/config.yaml` over `@osdlc/tiered-dirs`'
 * standalone tier, Zod as the single source of truth, never throws, degrades
 * to the defaults, memoised. Standalone, not suite or vendor, because a
 * general tool must not write a company namespace onto someone else's
 * machine.
 */

import { envVars } from '@osdlc/cli-tool'
import {
  machineConfigFile,
  pathNames,
  pathsSchema,
  substitutePathNames,
} from '@osdlc/config-layers'
import { z } from 'zod'

/** The tool's name, and so its config directory segment. */
export const TOOL = 'repo-cleaner'

/** Env var that relocates the config file, for tests and one-off runs. */
export const CONFIG_ENV = 'REPO_CLEANER_MACHINE_CONFIG'

export const RepoCleanerConfigSchema = z
  .object({
    paths: pathsSchema()
      .default({})
      .describe('Named directories; a `repos:` entry refers to one as `{name}`.'),
    repos: z
      .array(z.string().trim().min(1))
      .default([])
      .describe('Checkouts, or directories containing checkouts at any depth.'),
  })
  .strict()

export type RepoCleanerConfig = z.infer<typeof RepoCleanerConfigSchema>

/**
 * Whose directories the config file, plans and receipts live under: vendor
 * `repo-cleaner`, moved by the `REPO_CLEANER_*` override variables.
 */
export const VENDOR_DIRS = { vendor: TOOL, envVars: envVars('REPO_CLEANER') }

const file = machineConfigFile({
  tool: TOOL,
  schema: RepoCleanerConfigSchema,
  vendorDirs: VENDOR_DIRS,
  env: CONFIG_ENV,
})

export const DEFAULT_CONFIG: RepoCleanerConfig = RepoCleanerConfigSchema.parse({})

/** `<config-home>/repo-cleaner/config.yaml`, unless {@link CONFIG_ENV} says otherwise. */
export const configPath = (): string => file.path()

/**
 * The config, defaults filled.
 *
 * Never throws. A missing file, unreadable file, malformed YAML or wrong
 * shape all degrade to the defaults: a person running the tool in a
 * repository should not be stopped by a config file they never wrote.
 */
export const loadConfig = (): RepoCleanerConfig => file.load()

/** Drop the memoised value. Call from tests between runs. */
export const clearConfigCache = (): void => file.clearCache()

/**
 * The configured entries with their `{name}` path names substituted against
 * `paths:`, relative entries resolved against `baseDir`.
 *
 * A name nothing defines is an error rather than an empty string — a
 * `repos:` entry that quietly becomes `/dev` would sweep whatever happens to
 * be there.
 */
export function configuredRepos(
  config: RepoCleanerConfig = loadConfig(),
  baseDir: string = process.cwd(),
): string[] {
  const names = pathNames(baseDir, config.paths, {})
  return config.repos.map((entry) => substitutePathNames(entry, names, 'repos:'))
}
