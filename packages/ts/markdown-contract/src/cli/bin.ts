/**
 * The `markdown-contract` program: `bin/markdown-contract.js` loads the built copy, and a
 * development checkout that devlink selects runs this file from source. It runs `runCli` on the
 * process arguments and writes its output; `runMain` sets the exit code without calling
 * `process.exit`, so output still buffered for a pipe is not cut off.
 */
import { runMain } from '@osdlc/cli-tool'
import { devlinkHook } from '@osdlc/cli-tool/devlink'

import { DEVLINK_SPEC } from './devlink.js'
import { runCli } from './run.js'

await runMain(
  async (argv, ctx) => {
    const { code, stdout, stderr } = await runCli([...argv], { cwd: ctx.cwd })
    if (stdout) ctx.io.stdout(`${stdout}\n`)
    if (stderr) ctx.io.stderr(`${stderr}\n`)
    return code
  },
  { name: 'markdown-contract', devlink: devlinkHook(DEVLINK_SPEC) },
)
