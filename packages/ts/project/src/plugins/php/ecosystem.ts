/** The php ecosystem: `composer.json`. */

import type { EcosystemDef } from '../../tool.ts'

export const COMPOSER_JSON = 'composer.json'

/** The php ecosystem. */
export const phpEcosystem: EcosystemDef = {
  id: 'php',
  manifests: [{ files: COMPOSER_JSON, tool: 'composer' }],
  languages: [{ id: 'php' }],
  tools: ['composer'],
}
