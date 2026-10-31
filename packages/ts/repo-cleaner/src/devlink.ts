/**
 * The devlink spec: how `repo-cleaner dev` recognises a repo-cleaner checkout and runs it.
 *
 * A checkout has `src/cli.ts` and a `package.json` named `@osdlc/repo-cleaner`; the
 * installed package ships no `src/`, so it never counts. A selected
 * checkout runs `src/bin.ts` under Bun. The cwd layer stays off: only
 * `REPO_CLEANER_HOME` or `repo-cleaner dev link` hand off to a checkout.
 */

import { envVars } from '@osdlc/cli-tool'
import { validateSpec, type ToolSpec } from '@osdlc/cli-tool/devlink'

/** Whose directories devlink's state lives under: vendor `repo-cleaner`, moved by the `REPO_CLEANER_*` override variables. */
export const VENDOR_DIRS = { vendor: 'repo-cleaner', envVars: envVars('REPO_CLEANER') }

export const DEVLINK_SPEC: ToolSpec = validateSpec({
  name: 'repo-cleaner',
  marker: 'src/cli.ts',
  packageName: '@osdlc/repo-cleaner',
  entry: 'src/bin.ts',
  launcher: 'bin/repo-cleaner.js',
  vendorDirs: VENDOR_DIRS,
})
