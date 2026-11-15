/** What `conformance-suites` runs: `bin/conformance-suites.js` loads the built copy. */

import { main } from './cli.ts'

process.exitCode = main(process.argv.slice(2))
