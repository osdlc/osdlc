/** `@osdlc/system-model/php`: the php ecosystem and composer scripts. */

import type { ToolDef } from '../../tool.ts'
import { composerRunner, COMPOSER_BRAND } from './composer.ts'
import { phpEcosystem } from './ecosystem.ts'

/** composer: the `scripts` a `composer.json` declares. */
export const composer: ToolDef = {
  id: 'composer',
  homepage: 'https://getcomposer.org',
  description: 'A dependency manager for PHP that also runs composer.json scripts.',
  brand: COMPOSER_BRAND,
  binary: 'composer',
  ecosystem: phpEcosystem,
  roles: { runner: composerRunner },
}

/** Every tool this plugin defines. */
export const phpTools: readonly ToolDef[] = [composer]

export { phpEcosystem }
