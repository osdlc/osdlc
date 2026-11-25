/** The shipped code plugins, apart from the registry so settings can read them without its descriptor imports. */

import { cargoDefinition } from './cargo.ts'
import { gitDefinition } from './git.ts'
import { nodeDefinition } from './node.ts'
import { orcaDefinition } from './orca.ts'
import type { PluginDefinition } from './types.ts'

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
