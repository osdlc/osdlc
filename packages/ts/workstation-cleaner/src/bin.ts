/** What `workstation-cleaner` runs: `bin/workstation-cleaner.js` loads the built copy of this file. */

import { runMain } from '@osdlc/cli-tool'

import { main } from './cli.ts'
import { VERSION } from './version.generated.ts'

await runMain((argv, ctx) => main(argv, ctx), { name: 'workstation-cleaner', version: VERSION })
