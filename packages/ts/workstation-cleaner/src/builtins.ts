/**
 * The shipped code plugins. Kept out of registry.ts so settings.ts can import
 * them: registry.ts imports descriptor/engine.ts, which imports config.ts, which
 * imports settings.ts.
 */

import { agentHistoryDefinition } from './agent-history.ts'
import { CARGO_PLUGIN, CARGO_PROJECT, cargoDefinition } from './cargo.ts'
import { dockerDefinition } from './docker.ts'
import { gitDefinition } from './git.ts'
import { jetbrainsDefinition } from './jetbrains.ts'
import { NODE_PLUGIN, NODE_PROJECT, nodeDefinition } from './node.ts'
import { ollamaDefinition } from './ollama.ts'
import { orcaDefinition } from './orca.ts'
import { toolchainsDefinition } from './toolchains.ts'
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
  agentHistoryDefinition,
  jetbrainsDefinition,
  toolchainsDefinition,
]

/**
 * The project folders a built-in plugin takes, by folder name and the marker
 * file beside it. A plugin added above that takes one is listed here too.
 */
export const BUILT_IN_PROJECTS: readonly { dir: string; marker: string; by: string }[] = [
  { ...NODE_PROJECT, by: NODE_PLUGIN },
  { ...CARGO_PROJECT, by: CARGO_PLUGIN },
]
