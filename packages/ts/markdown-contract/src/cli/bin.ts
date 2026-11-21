/**
 * The `markdown-contract` program: `bin/markdown-contract.js` loads the built copy, and a
 * development checkout that devlink selects runs this file from source. It runs the command tree
 * on the process arguments; `runMain` sets the exit code without calling `process.exit`, so
 * output still buffered for a pipe is not cut off.
 */
import { runMain } from '@osdlc/cli-tool'
import { devlinkHook } from '@osdlc/cli-tool/devlink'

import { createApp } from './run.js'
import { DEVLINK_SPEC } from './devlink.js'
import { VERSION } from './version.generated.js'

const app = createApp()

await runMain((argv, ctx) => app.run(argv, ctx), {
  name: 'markdown-contract',
  version: VERSION,
  devlink: devlinkHook(DEVLINK_SPEC),
})
