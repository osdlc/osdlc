/** `@osdlc/system-model/php`: the php ecosystem and composer scripts. */

import type { ToolDef } from '../../tool.ts'
import { composerRunner } from './composer.ts'
import { phpEcosystem } from './ecosystem.ts'

/** composer: the `scripts` a `composer.json` declares. */
export const composer: ToolDef = {
  id: 'composer',
  binary: 'composer',
  ecosystem: phpEcosystem,
  roles: { runner: composerRunner },
}

/** Every tool this plugin defines. */
export const phpTools: readonly ToolDef[] = [composer]

export { phpEcosystem }
