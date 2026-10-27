/**
 * The devlink spec: how `pr-update dev` recognises a pr-update checkout and runs it.
 *
 * A checkout has `src/cli.ts` and a `package.json` named `@osdlc/pr-update`; the
 * installed package ships `dist/` alone, so it never counts. A selected
 * checkout runs `src/bin.ts` under Bun. The cwd layer stays off: only
 * `PR_UPDATE_HOME` or `pr-update dev link` hand off to a checkout.
 */

import { envVars } from '@osdlc/cli-tool'
import { validateSpec, type ToolSpec } from '@osdlc/cli-tool/devlink'

export const DEVLINK_SPEC: ToolSpec = validateSpec({
  name: 'pr-update',
  marker: 'src/cli.ts',
  packageName: '@osdlc/pr-update',
  entry: 'src/bin.ts',
  launcher: 'bin/pr-update.js',
  vendorDirs: { vendor: 'pr-update', envVars: envVars('PR_UPDATE') },
})
