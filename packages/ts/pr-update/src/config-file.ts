/**
 * Loading the config of a standalone `pr-update` run: the `pr_update:` and
 * `code_host:` blocks of a project file, layered under its `.local` overlay,
 * through `@osdlc/config-layers`.
 *
 * The caller names the file and the env variable that relocates it
 * (the binary's file spec lives in `cli.ts`). A host that keeps these blocks inside its own config file passes
 * that file's spec and gets the same schema, defaults and layering. While the
 * variable is set it replaces the file-and-overlay pair with the file it names.
 *
 * pr-update mounts only the two sections it reads and ignores every other
 * top-level key (`unknownTopLevel: 'ignore'`), so a file that also holds a
 * host's own blocks — even a malformed one — still works. A mounted block that
 * is invalid is a `ConfigInvalidError` (exit 14).
 *
 * A host embedding this package as a library may skip this file entirely and
 * build a `PrUpdateConfig` from its own config format instead.
 */

import {
  assembleConfig,
  type ConfigFileSpec,
  type ConfigHandle,
  type ConfigLayers,
  type ConfigOf,
} from '@osdlc/config-layers'
import { codeHostSection } from '@osdlc/code-host'

import { prUpdateStandaloneSection } from './config.ts'

/** The sections a standalone run mounts, in key order. */
export const STANDALONE_SECTIONS = [prUpdateStandaloneSection, codeHostSection] as const

export type StandaloneConfig = ConfigOf<typeof STANDALONE_SECTIONS>

export type { ConfigFileSpec }

/** The environment and working directory the loader resolves the file's env variable against. */
export interface LoadEnv {
  env?: Record<string, string | undefined>
  cwd?: string
}

/** The config handle for a run reading `file`; `env` and `cwd` decide where its variable points. */
export function standaloneConfig(
  file: ConfigFileSpec,
  opts: LoadEnv = {},
): ConfigHandle<typeof STANDALONE_SECTIONS> {
  return assembleConfig({
    file,
    sections: STANDALONE_SECTIONS,
    unknownTopLevel: 'ignore',
    label: 'pr-update config',
    resolve: {
      ...(opts.env !== undefined ? { env: opts.env } : {}),
      ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    },
  })
}

/**
 * Load the layered config of `projectRoot`: the two mounted sections with every
 * default filled. Neither file present is not an error — every key has a default.
 */
export function loadConfigLayers(
  file: ConfigFileSpec,
  projectRoot: string,
  opts: LoadEnv = {},
): ConfigLayers<StandaloneConfig> {
  return standaloneConfig(file, opts).loadLayers(projectRoot)
}
