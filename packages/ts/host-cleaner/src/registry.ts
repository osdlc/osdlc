/** The plugins the command line knows, and the choice among them. */

import type { ArchiveOptions, Kind } from '@osdlc/repo-cleaner'

import { cargoPlugin } from './cargo.ts'
import { gitPlugin } from './git.ts'
import { nodePlugin } from './node.ts'
import { orcaPlugin } from './orca.ts'
import type { Plugin } from './types.ts'

/**
 * What a factory is told: its own entry in the config's `plugins`, validated with
 * its defaults filled in (`./settings.ts`), the git kinds `--worktrees` and
 * `--branches` leave, and `clean`'s archive options.
 */
export interface PluginInit {
  settings: Record<string, unknown>
  only: readonly Kind[]
  /** The command line's environment, for a plugin that runs other programs. */
  env: Readonly<Record<string, string | undefined>>
  /** `clean --archive`: push unlanded work to the remote before deleting it. */
  archive?: ArchiveOptions | undefined
}

export type PluginFactory = (init: PluginInit) => Plugin

/** The shipped plugins by name; `orderPlugins` sets the run order. */
export const FACTORIES: Readonly<Record<string, PluginFactory>> = {
  git: ({ only, archive }) => gitPlugin({ sweep: { only: [...only] }, archive }),
  cargo: ({ settings }) => cargoPlugin({ idleHours: settings.idleHours as number }),
  node: ({ settings }) => nodePlugin({ idleHours: settings.idleHours as number }),
  orca: ({ settings, env }) => orcaPlugin({ repos: settings.repos as boolean, env }),
}

/** A `--plugin` or `--skip-plugin` that names no plugin. */
export class UnknownPlugin extends Error {
  override name = 'UnknownPlugin'
}

/**
 * `plugins` narrowed to `want` when given, less `skip`. A name no plugin has is an error.
 *
 * @throws UnknownPlugin
 */
export function selectPlugins(
  plugins: readonly Plugin[],
  want: readonly string[] | undefined,
  skip: readonly string[] | undefined,
): Plugin[] {
  const known = new Set(plugins.map((p) => p.name))
  for (const name of [...(want ?? []), ...(skip ?? [])]) {
    if (!known.has(name)) {
      throw new UnknownPlugin(`no plugin named ${name}; have ${[...known].join(', ')}`)
    }
  }
  return plugins.filter(
    (p) =>
      (want === undefined || want.length === 0 || want.includes(p.name)) && !skip?.includes(p.name),
  )
}
