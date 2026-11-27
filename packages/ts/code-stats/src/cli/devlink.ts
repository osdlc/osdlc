/**
 * The devlink spec: how `code-stats dev` recognises a code-stats checkout and runs it.
 *
 * A checkout has `src/cli/main.ts` and a `package.json` named `@osdlc/code-stats`; the
 * installed package ships no `src/`, so it never counts. A selected
 * checkout runs `src/cli/bin.ts` under Bun. The cwd layer stays off: only
 * `CODE_STATS_HOME` or `code-stats dev link` hand off to a checkout.
 */

import { envVars } from '@osdlc/cli-tool'
import { validateSpec, type ToolSpec } from '@osdlc/cli-tool/devlink'

/** Whose directories devlink's state lives under: vendor `code-stats`, moved by the `CODE_STATS_*` override variables. */
export const VENDOR_DIRS = { vendor: 'code-stats', envVars: envVars('CODE_STATS') }

export const DEVLINK_SPEC: ToolSpec = validateSpec({
  name: 'code-stats',
  marker: 'src/cli/main.ts',
  packageName: '@osdlc/code-stats',
  entry: 'src/cli/bin.ts',
  launcher: 'bin/code-stats.js',
  vendorDirs: VENDOR_DIRS,
})
