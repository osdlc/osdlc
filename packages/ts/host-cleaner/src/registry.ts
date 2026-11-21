/** The plugins the command line knows, and the choice among them. */

import type { Kind } from '@osdlc/repo-cleaner'

import { ConfigError } from './config.ts'
import { cargoPlugin } from './cargo.ts'
import { claudeCodePlugin } from './claude.ts'
import { gitPlugin } from './git.ts'
import { nodePlugin } from './node.ts'
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
  cargo: ({ settings }) => cargoPlugin(artifactSettings('cargo', settings)),
  node: ({ settings }) => nodePlugin(artifactSettings('node', settings)),
  'claude-code': () => claudeCodePlugin(),
}

/** `idleHours` from a plugin's settings; a wrong type is a config error, not a silent default. */
function artifactSettings(name: string, settings: Record<string, unknown>) {
  const idle = settings.idleHours
  if (idle !== undefined && (typeof idle !== 'number' || !(idle > 0))) {
    throw new ConfigError(`plugins.${name}.idleHours must be a positive number`)
  }
  return { idleHours: idle }
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
