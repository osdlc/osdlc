/**
 * What `pr-update` runs: `bin/pr-update.js` loads the built copy, and a development
 * checkout that devlink selects runs this file under Bun.
 *
 * For `update`, the first SIGINT or SIGTERM aborts the context's signal: the repair
 * agent is stopped, no further PR is updated, and the command exits 130. A second
 * one ends the process at once, as it did before this handler.
 */

import { processContext, quietOnBrokenPipe, runMain } from '@osdlc/cli-tool'
import { devlinkHook } from '@osdlc/cli-tool/devlink'

import { main } from './cli.ts'
import { DEVLINK_SPEC } from './devlink.ts'
import { VERSION } from './version.generated.ts'

const abort = new AbortController()
// Only `update` acts on an interrupt; `survey` keeps the default. The first signal
// removes both listeners, so a second one of either kind ends the process.
if (process.argv[2] === 'update') {
  const SIGNALS = ['SIGINT', 'SIGTERM'] as const
  const onSignal = (): void => {
    for (const sig of SIGNALS) process.off(sig, onSignal)
    abort.abort()
  }
  for (const sig of SIGNALS) process.on(sig, onSignal)
}
// A supplied context skips runMain's own broken-pipe handling.
quietOnBrokenPipe(process.stdout, null)
quietOnBrokenPipe(process.stderr, null)

await runMain(main, {
  name: 'pr-update',
  version: VERSION,
  devlink: devlinkHook(DEVLINK_SPEC),
  context: { ...processContext(), signal: abort.signal },
})
