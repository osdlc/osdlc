/** What `conformance` runs: `bin/conformance.js` loads the built copy. */

import { main } from './cli.ts'

process.exitCode = main(process.argv.slice(2))
