/**
 * What `code-stats` runs, through `bin/code-stats.js` or a checkout devlink
 * selects (see `DEVLINK_SPEC` in ./devlink.ts). The devlink hook answers
 * `code-stats dev …`, and `runMain` answers `--version` and `--where`, then
 * runs the app.
 */
import { runMain } from '@osdlc/cli-tool'
import { devlinkHook } from '@osdlc/cli-tool/devlink'

import { DEVLINK_SPEC } from './devlink.ts'
import { app } from './main.ts'

await runMain(app.main, {
  name: app.name,
  version: app.version,
  devlink: devlinkHook(DEVLINK_SPEC),
})
