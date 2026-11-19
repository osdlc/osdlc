/** What `host-cleaner` runs: `bin/host-cleaner.js` loads the built copy of this file. */

import { runMain } from '@osdlc/cli-tool'

import { cargoAdapter } from './cargo.ts'
import { main } from './cli.ts'
import { nodeAdapter } from './node.ts'
import { VERSION } from './version.generated.ts'

await runMain((argv, ctx) => main(argv, ctx, { adapters: [cargoAdapter, nodeAdapter] }), {
  name: 'host-cleaner',
  version: VERSION,
})
