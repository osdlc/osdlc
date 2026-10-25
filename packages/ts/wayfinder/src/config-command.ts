/**
 * `way config`: cli-tool's shared `config` group over wayfinder's files.
 * {@link configStore} is the {@link ConfigStore} it runs on; this module also
 * holds what every wayfinder command needs from its context (the home
 * directory and the project root).
 *
 * `trust`, `allowExec` and `tools` are written from the command line only
 * ({@link CLI_ONLY_KEYS}): the MCP and HTTP adapters refuse them.
 */

import { stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

import { CommandError, UsageError, type CommandContext, type Group } from '@osdlc/cli-tool/command'
import {
  ConfigUsageError,
  configCommands,
  type ConfigLayerValue,
  type ConfigStore,
} from '@osdlc/cli-tool/config-command'
import type { FlagSpec } from '@osdlc/cli-tool/define-cli'
import { homeDir } from '@osdlc/trust-repo'

import { makeProject } from './catalog.ts'
import {
  CLI_ONLY_KEYS,
  CONFIG_KEYS,
  ConfigError,
  DEFAULT_CONFIG,
  configLocations,
  envIgnoredWarning,
  getConfigValue,
  loadConfig,
  projectIgnoreReason,
  readSettings,
  removeSetting,
  resolveConfigKey,
  writeSetting,
  type LoadedConfig,
  type Settings,
  type WritableLayer,
} from './config.ts'

/** What a wayfinder command takes from its caller, beside the command context. */
export interface CommandEnvOptions {
  /**
   * The home directory. Default: `HOME` from the context's environment when
   * it is absolute, else the OS account's home.
   */
  home?: (ctx: CommandContext) => string
  /**
   * The project root for a run. Default: `-C` (`ctx.globals.dir`) or the
   * working directory, resolved upward to the project root.
   */
  root?: (ctx: CommandContext) => Promise<string>
}

/** The home directory for `ctx`: an absolute `HOME`, else the OS account's home. */
export function homeOf(ctx: Pick<CommandContext, 'env'>): string {
  const home = ctx.env['HOME']
  return home !== undefined && isAbsolute(home) ? home : homeDir()
}

/**
 * The project root for `ctx`: the directory `-C` names (`ctx.globals.dir`),
 * else `ctx.cwd`, resolved upward to the project root. A directory that does
 * not exist is an error, so a typo never edits the enclosing repository.
 */
export async function projectRootOf(ctx: CommandContext): Promise<string> {
  const named = ctx.globals['dir']
  const dir = resolve(ctx.cwd, typeof named === 'string' && named !== '' ? named : '.')
  const info = await stat(dir).catch(() => null)
  if (info === null || !info.isDirectory()) throw new CommandError(`no such directory: ${dir}`)
  return makeProject().findRoot(dir)
}

/** {@link homeOf} and {@link projectRootOf}, or the caller's own. */
export function commandEnv(opts: CommandEnvOptions = {}): {
  home: (ctx: CommandContext) => string
  root: (ctx: CommandContext) => Promise<string>
} {
  return { home: opts.home ?? homeOf, root: opts.root ?? projectRootOf }
}

/** A broken file, as the command's failure (exit 1). */
function asCommandError(err: unknown): never {
  if (err instanceof ConfigError) throw new CommandError(err.message)
  throw err
}

/**
 * wayfinder's {@link ConfigStore}: the user and project files, with the
 * project file the default for `set` and `unset`.
 */
export function configStore(opts: CommandEnvOptions = {}): ConfigStore {
  const env = commandEnv(opts)
  const load = async (ctx: CommandContext): Promise<LoadedConfig> =>
    loadConfig(await env.root(ctx), ctx.env, env.home(ctx)).catch(asCommandError)
  const settings = async (ctx: CommandContext): Promise<Settings> =>
    readSettings(await env.root(ctx), ctx.env, env.home(ctx)).catch(asCommandError)
  const target = async (ctx: CommandContext, layer: string) => ({
    layer: layer as WritableLayer,
    root: await env.root(ctx),
    env: ctx.env,
    home: env.home(ctx),
  })

  return {
    layers: ['user', 'project'],
    defaultLayer: 'project',
    keys: CONFIG_KEYS,
    cliOnlyKeys: CLI_ONLY_KEYS,
    resolveKey: resolveConfigKey,

    async list(ctx) {
      const read = await settings(ctx)
      return {
        settings: read.settings.map(({ key, value, source }) => ({ key, value, source })),
        warnings: read.warnings,
      }
    },

    // Existence only: `config path` is what you run when a file will not load.
    async locations(ctx) {
      const locations = configLocations(await env.root(ctx), ctx.env, env.home(ctx))
      const ignored = envIgnoredWarning(locations)
      if (ignored !== null) ctx.warn(ignored)
      const exists = async (file: string): Promise<boolean> =>
        (await stat(file).catch(() => null)) !== null
      return [
        {
          layer: 'user',
          path: locations.user,
          exists: await exists(locations.user),
          envVar: locations.userEnvVar,
        },
        { layer: 'project', path: locations.project, exists: await exists(locations.project) },
      ]
    },

    async set(ctx, layer, key, value) {
      if (resolveConfigKey(key) === undefined) throw new ConfigUsageError(`unknown setting: ${key}`)
      try {
        return await writeSetting(await target(ctx, layer), key, value)
      } catch (err) {
        // An empty `file` is about what was typed: a wrong value, or a key
        // the project file may not hold.
        if (err instanceof ConfigError && err.file === '') throw new UsageError(err.message)
        return asCommandError(err)
      }
    },

    async unset(ctx, layer, key) {
      return removeSetting(await target(ctx, layer), key).catch(asCommandError)
    },

    async explain(ctx, key) {
      if (resolveConfigKey(key) === undefined) throw new ConfigUsageError(`unknown setting: ${key}`)
      const loaded = await load(ctx)
      const fallback = getConfigValue(DEFAULT_CONFIG, key)
      const user = loaded.files.user === null ? undefined : getConfigValue(loaded.files.user, key)
      const project =
        loaded.files.project === null ? undefined : getConfigValue(loaded.files.project, key)
      const projectApplied =
        loaded.layers.project === null ? undefined : getConfigValue(loaded.layers.project, key)
      const reason = project === undefined ? null : projectIgnoreReason(key, project)
      const layers: ConfigLayerValue[] = [
        { layer: 'default', set: fallback !== undefined, value: fallback },
        {
          layer: 'user',
          set: user !== undefined,
          value: user,
          file: loaded.locations.user,
          ...(loaded.locations.userEnvVar !== null ? { envVar: loaded.locations.userEnvVar } : {}),
        },
        {
          layer: 'project',
          set: project !== undefined,
          value: project,
          file: loaded.locations.project,
          allowed: project === undefined || projectApplied !== undefined,
          ...(reason !== null ? { note: reason } : {}),
        },
      ]
      return { layers, warnings: loaded.warnings }
    },
  }
}

/**
 * The `config` group: `list` (the default), `get`, `set`, `unset`, `path` and
 * `explain`. Mount it as `config: configCommand({ globals })`, with the app's
 * global flags; `-C` must be declared as `dir`.
 */
export function configCommand<G extends FlagSpec = Record<never, never>>(
  options: CommandEnvOptions & { globals?: G } = {},
): Group {
  const { globals, ...env } = options
  return configCommands(configStore(env), globals !== undefined ? { globals } : {})
}
