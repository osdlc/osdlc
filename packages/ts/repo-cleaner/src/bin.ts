/**
 * What `repo-cleaner` runs: `bin/repo-cleaner.js` loads the built copy, and a development
 * checkout that devlink selects runs this file under Bun.
 */

import { runMain } from '@osdlc/cli-tool'
import { devlinkHook } from '@osdlc/cli-tool/devlink'

import { main } from './cli.ts'
import { DEVLINK_SPEC } from './devlink.ts'
import { VERSION } from './version.generated.ts'

await runMain(main, { name: 'repo-cleaner', version: VERSION, devlink: devlinkHook(DEVLINK_SPEC) })
