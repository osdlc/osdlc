/** What `host-cleaner` runs: `bin/host-cleaner.js` loads the built copy of this file. */

import { runMain } from '@osdlc/cli-tool'

import { main } from './cli.ts'
import { VERSION } from './version.generated.ts'

await runMain(main, { name: 'host-cleaner', version: VERSION })
