/**
 * `@osdlc/system-model/node`: the node ecosystem, its four package managers and
 * the package.json scripts runner.
 */

import type { ToolDef } from '../../tool.ts'
import { nodeEcosystem } from './ecosystem.ts'
import { bun, npm, pnpm, yarn } from './managers.ts'
import { nodeScriptsRunner, NODE_SCRIPTS_BRAND } from './node-scripts.ts'

/** package.json `scripts`, run through the package's own manager. */
export const nodeScripts: ToolDef = {
  id: 'node-scripts',
  homepage: 'https://docs.npmjs.com/cli/using-npm/scripts/',
  description: "The scripts a package.json declares, run through the package's own manager.",
  brand: NODE_SCRIPTS_BRAND,
  ecosystem: nodeEcosystem,
  roles: { runner: nodeScriptsRunner },
}

/** Every tool this plugin defines. */
export const nodeTools: readonly ToolDef[] = [bun, pnpm, yarn, npm, nodeScripts]

export { bun, nodeEcosystem, npm, pnpm, yarn }
