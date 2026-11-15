/** What `package-checks` runs: `bin/package-checks.js` loads the built copy. */

import { main } from './cli.ts'

process.exitCode = await main(process.argv.slice(2))
