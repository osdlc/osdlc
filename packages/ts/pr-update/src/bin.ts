/**
 * What `pr-update` runs: `bin/pr-update.js` loads the built copy, and a development
 * checkout that devlink selects runs this file under Bun.
 *
 * SIGINT and SIGTERM abort the context's signal: the repair agent is stopped, no
 * further PR is updated, and the command exits 130.
 */

import { processContext, quietOnBrokenPipe, runMain } from '@osdlc/cli-tool'
import { devlinkHook } from '@osdlc/cli-tool/devlink'

import { main } from './cli.ts'
import { DEVLINK_SPEC } from './devlink.ts'
import { VERSION } from './version.generated.ts'

const abort = new AbortController()
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => abort.abort())
// A supplied context skips runMain's own broken-pipe handling.
quietOnBrokenPipe(process.stdout, null)
quietOnBrokenPipe(process.stderr, null)

await runMain(main, {
  name: 'pr-update',
  version: VERSION,
  devlink: devlinkHook(DEVLINK_SPEC),
  context: { ...processContext(), signal: abort.signal },
})
