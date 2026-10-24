/**
 * Finds a tool's project config file and its overlay. No other code does.
 *
 * The tool names the file and the env variable that relocates it. There is no
 * default. With `{ name: 'tooly.yaml', envVar: 'TOOLY_CONFIG' }` the pair is
 * `<projectRoot>/tooly.yaml` and `<projectRoot>/tooly.local.yaml`. While the
 * variable is set, it replaces that pair with the file it names and that
 * file's overlay. Neither root file is read.
 *
 *   - A relative path resolves against the process working directory at the
 *     time this module loaded (the tool's startup directory). Every caller
 *     prints the absolute path.
 *   - The overlay is `<dir>/<basename without its last extension>.local.<ext>`.
 *     `tools/tooly.yaml` pairs with `tools/tooly.local.yaml`, `cfg.yml` with
 *     `cfg.local.yml`.
 *   - A set variable that names a missing file is an error
 *     ({@link ConfigInvalidError}, exit 14). Someone set the variable on
 *     purpose, so a missing file is a mistake. An absent default file is not
 *     an error and means all defaults.
 *
 * A repository-trust check treats a file named by the variable as
 * project-sourced, exactly like the default file. Pointing the variable outside
 * the repository does not get around the check. The variable does not affect
 * the machine file or the trust store.
 */

import { existsSync, statSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'

import { ConfigInvalidError } from './config-error.ts'

/** The working directory when this module loaded: what a relative variable value resolves against. */
const STARTUP_CWD = process.cwd()

/**
 * Which file a tool reads and which variable relocates it.
 *
 * @experimental
 */
export interface ConfigFileSpec {
  /** The file name under the project root, e.g. `tooly.yaml`. */
  name: string
  /** The variable that replaces the root pair, e.g. `TOOLY_CONFIG`. */
  envVar: string
}

/**
 * Options for resolving which config file to read: the file spec plus the environment, the working directory and the scope.
 * @experimental
 */
export interface ResolveConfigFileOptions extends ConfigFileSpec {
  /** The environment to read the variable from. Default `process.env`. */
  env?: Record<string, string | undefined>
  /** What a relative path resolves against. Default the startup working directory. */
  cwd?: string
  /**
   * `root` (default): the project root's own file, which the variable replaces.
   * `subtree`: a directory beneath the root that carries its own file (a
   * per-directory overlay). The variable names the root file only, so a
   * subtree always resolves to its own default pair.
   */
  scope?: 'root' | 'subtree'
}

/**
 * The resolved pair.
 *
 * @experimental
 */
export interface ResolvedConfigFile {
  /** Absolute path of the project file. */
  project: string
  /** Absolute path of its overlay. */
  local: string
  /** `env` when the variable named the file, else `default`. */
  source: 'env' | 'default'
}

/**
 * The overlay of a config file: `<dir>/<basename without its last extension>.local<ext>`.
 * `tools/tooly.yaml` is `tools/tooly.local.yaml`; `cfg.yml` is `cfg.local.yml`;
 * a file with no extension gains `.local` (`cfg` is `cfg.local`).
 * @experimental
 */
export function overlayPath(file: string): string {
  const ext = extname(file)
  const stem = basename(file, ext)
  return join(dirname(file), `${stem}.local${ext}`)
}

/**
 * Find the project file and its overlay for `projectRoot`. Throws {@link ConfigInvalidError} when the variable names a missing file.
 *
 * @experimental
 */
export function resolveConfigFile(
  projectRoot: string,
  opts: ResolveConfigFileOptions,
): ResolvedConfigFile {
  const { name, envVar } = opts
  const root = resolve(projectRoot)
  const pointed = opts.scope === 'subtree' ? undefined : (opts.env ?? process.env)[envVar]
  if (pointed === undefined || pointed === '') {
    const project = join(root, name)
    return { project, local: overlayPath(project), source: 'default' }
  }
  const project = isAbsolute(pointed) ? pointed : resolve(opts.cwd ?? STARTUP_CWD, pointed)
  if (!existsSync(project) || !statSync(project).isFile()) {
    throw new ConfigInvalidError(
      [project],
      [
        {
          path: '(root)',
          message: `${envVar} names ${project}, which is not an existing file`,
        },
      ],
    )
  }
  return { project, local: overlayPath(project), source: 'env' }
}
