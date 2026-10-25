/**
 * Where wayfinder keeps its files outside a repository. Every path comes from
 * `@osdlc/tiered-dirs`, standalone tier `wayfinder`, `xdg` convention:
 *
 * | store | Linux and macOS | Windows |
 * |---|---|---|
 * | user config | `${XDG_CONFIG_HOME:-~/.config}/wayfinder/config.json` | `%APPDATA%\wayfinder\config.json` |
 * | trust store | `${XDG_STATE_HOME:-~/.local/state}/wayfinder/trusted/` | `%LOCALAPPDATA%\state\wayfinder\trusted\` |
 * | probe cache | `${XDG_CACHE_HOME:-~/.cache}/wayfinder/` | `%LOCALAPPDATA%\wayfinder\` |
 *
 * `WAYFINDER_ROOT` moves all of them under one directory, and
 * `WAYFINDER_<HOME>_DIR` (`WAYFINDER_CONFIG_DIR`, `WAYFINDER_STATE_DIR`,
 * `WAYFINDER_CACHE_DIR`) moves one. `WAYFINDER_CONVENTION` is not read: the
 * convention is pinned, so the files stay where the docs say. A relative
 * `XDG_*` value is ignored. `home` is always injected, so a test never reads
 * or writes the real home directory.
 */

import { join } from 'node:path'

import { envVars, systemBaseDirs, TieredDirs, type EnvVars } from '@osdlc/tiered-dirs'

import { APP } from './app.ts'

/** The variables that move wayfinder's directories: `WAYFINDER_ROOT` and `WAYFINDER_<HOME>_DIR`. */
export const DIR_ENV_VARS: EnvVars = envVars(APP.toUpperCase())

/** The directory under the state directory that holds the trust markers. */
const TRUST_DIR = 'trusted'

/** The user config's file name inside the config directory. */
export const USER_CONFIG_FILENAME = 'config.json'

/** wayfinder's directories. */
export interface AppDirs {
  /** `<config>/wayfinder`: holds the user config file. */
  config: string
  /** `<state>/wayfinder`: holds the trust store. */
  state: string
  /** `<cache>/wayfinder`: the probe cache. */
  cache: string
  /** `<config>/wayfinder/config.json`, before `WAYFINDER_CONFIG` is applied. */
  userConfig: string
  /** `<state>/wayfinder/trusted`. */
  trustStore: string
  /** The base directories the paths above are under. `way clean` prunes up to them. */
  bases: { config: string; state: string; cache: string }
}

/** Inputs for {@link appDirs}. */
export interface AppDirsOptions {
  /** Defaults to `process.env`. */
  env?: Record<string, string | undefined>
  /** The home directory. Required, so nothing resolves a real home by accident. */
  home: string
  /** Defaults to `process.platform`. */
  platform?: string
}

/**
 * The `TieredDirs` wayfinder's paths come from, vendor `wayfinder`, under
 * `convention` (default `xdg`). Throws `TieredDirsError` when an override
 * variable holds a relative path.
 */
export function appTieredDirs(
  opts: AppDirsOptions & { convention?: 'xdg' | 'native' },
): TieredDirs {
  const bases = systemBaseDirs(DIR_ENV_VARS, {
    convention: opts.convention ?? 'xdg',
    conventionFromEnv: false,
    env: opts.env ?? process.env,
    home: opts.home,
    ...(opts.platform !== undefined ? { platform: opts.platform } : {}),
  })
  return new TieredDirs(APP, bases)
}

/**
 * wayfinder's directories. Throws `TieredDirsError` when an override
 * variable holds a relative path.
 */
export function appDirs(opts: AppDirsOptions): AppDirs {
  const dirs = appTieredDirs(opts)
  const tier = dirs.standalone(APP)
  const config = tier.config().path
  const state = tier.state().path
  const { bases } = dirs
  return {
    config,
    state,
    cache: tier.cache().path,
    userConfig: join(config, USER_CONFIG_FILENAME),
    trustStore: join(state, TRUST_DIR),
    bases: { config: bases.config, state: bases.state, cache: bases.cache },
  }
}

/**
 * Expand a leading `~` against `home`; anything else is returned unchanged.
 * direnv, `.env` loaders and CI YAML pass a literal tilde through, and
 * `<cwd>/~/x` would be a silent wrong answer.
 */
export function expandTilde(path: string, home: string): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return join(home, path.slice(2))
  return path
}
