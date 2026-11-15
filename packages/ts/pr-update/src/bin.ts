/**
 * What `pr-update` runs: `bin/pr-update.js` loads the built copy, and a development
 * checkout that devlink selects runs this file under Bun.
 */

import { runMain } from '@osdlc/cli-tool'
import { devlinkHook } from '@osdlc/cli-tool/devlink'
import { installGroupSignalForwarding } from '@osdlc/command-seam'

import { main } from './cli.ts'
import { DEVLINK_SPEC } from './devlink.ts'
import { VERSION } from './version.generated.ts'

// Only `update` starts an agent, and the agent runs in its own process group, which
// Ctrl-C does not reach. While one is live, SIGINT, SIGTERM or SIGHUP kills it, and the
// command stops with no further PR and exits 128 + the signal (130 for SIGINT, 143 for
// SIGTERM). A second signal is SIGKILL. With no agent running, a signal ends pr-update as
// before; `survey` runs none.
if (process.argv[2] === 'update') installGroupSignalForwarding()

await runMain(main, { name: 'pr-update', version: VERSION, devlink: devlinkHook(DEVLINK_SPEC) })
