/**
 * The devlink spec: how `diffkit dev` recognises a diffkit checkout and runs it.
 *
 * A checkout has `src/cli.ts` and a `package.json` named `@osdlc/diffkit`; the
 * installed package ships no `src/`, so it never counts. A selected
 * checkout runs `src/bin.ts` under Bun. The cwd layer stays off: only
 * `DIFFKIT_HOME` or `diffkit dev link` hand off to a checkout.
 */

import { envVars } from '@osdlc/cli-tool'
import { validateSpec, type ToolSpec } from '@osdlc/cli-tool/devlink'

/** Whose directories devlink's state lives under: vendor `diffkit`, moved by the `DIFFKIT_*` override variables. */
export const VENDOR_DIRS = { vendor: 'diffkit', envVars: envVars('DIFFKIT') }

export const DEVLINK_SPEC: ToolSpec = validateSpec({
  name: 'diffkit',
  marker: 'src/cli.ts',
  packageName: '@osdlc/diffkit',
  entry: 'src/bin.ts',
  launcher: 'bin/diffkit.js',
  vendorDirs: VENDOR_DIRS,
})
