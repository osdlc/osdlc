/**
 * The shipped code plugins. Kept out of registry.ts so settings.ts can import
 * them: registry.ts imports descriptor/engine.ts, which imports config.ts, which
 * imports settings.ts.
 */

import { cargoDefinition } from './cargo.ts'
import { dockerDefinition } from './docker.ts'
import { gitDefinition } from './git.ts'
import { nodeDefinition } from './node.ts'
import { ollamaDefinition } from './ollama.ts'
import { orcaDefinition } from './orca.ts'
import type { PluginDefinition } from './types.ts'
import { cursorDefinition, vscodeDefinition } from './vscode.ts'

/**
 * The shipped plugins, in run order. Order decides which plugin keeps a
 * duplicate id, and the order `prepare` and `deleted` run in.
 */
export const BUILT_IN_PLUGINS: readonly PluginDefinition[] = [
  gitDefinition,
  cargoDefinition,
  nodeDefinition,
  vscodeDefinition,
  cursorDefinition,
  orcaDefinition,
  dockerDefinition,
  ollamaDefinition,
]
