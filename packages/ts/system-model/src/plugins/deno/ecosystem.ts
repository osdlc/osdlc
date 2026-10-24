/** The deno ecosystem: `deno.json` or `deno.jsonc`. */

import type { EcosystemDef } from '../../tool.ts'

export const DENO_JSON = 'deno.json'
export const DENO_JSONC = 'deno.jsonc'

/** The deno ecosystem. Deno runs TypeScript directly. */
export const denoEcosystem: EcosystemDef = {
  id: 'deno',
  manifests: [
    { files: DENO_JSON, tool: 'deno-tasks' },
    { files: DENO_JSONC, tool: 'deno-tasks' },
  ],
  languages: [{ id: 'typescript' }],
  tools: ['deno-tasks'],
}
