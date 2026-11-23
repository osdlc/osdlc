/** The plugins the command line knows, and the choice among them. */

import { cargoDefinition } from './cargo.ts'
import { gitDefinition } from './git.ts'
import { nodeDefinition } from './node.ts'
import { orcaDefinition } from './orca.ts'
import type { Plugin, PluginDefinition } from './types.ts'

/**
 * The shipped plugins, in run order. Order decides which plugin keeps a
 * duplicate id, and the order `prepare` and `deleted` run in.
 */
export const BUILT_IN_PLUGINS: readonly PluginDefinition[] = [
  gitDefinition,
  cargoDefinition,
  nodeDefinition,
  orcaDefinition,
]

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
