/** The plugins the command line knows, and the choice among them. */

import type { Kind } from '@osdlc/repo-cleaner'

import { gitPlugin } from './git.ts'
import type { Plugin } from './types.ts'

/**
 * What a factory is told: its own entry in the config's `plugins`, and the git
 * kinds `--worktrees` and `--branches` leave.
 */
export interface PluginInit {
  settings: Record<string, unknown>
  only: readonly Kind[]
}

export type PluginFactory = (init: PluginInit) => Plugin

/** The shipped plugins by name; `orderPlugins` sets the run order. */
export const FACTORIES: Readonly<Record<string, PluginFactory>> = {
  git: ({ only }) => gitPlugin({ sweep: { only: [...only] } }),
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
