/**
 * The devlink spec: how `markdown-contract dev` recognises a markdown-contract checkout and runs
 * it.
 *
 * A checkout has `src/cli/run.ts` and a `package.json` named `@osdlc/markdown-contract`; the
 * installed package ships no `src/`, so it never counts. A selected checkout runs
 * `src/cli/bin.ts` from source. The cwd layer stays off: only `MARKDOWN_CONTRACT_HOME` or
 * `markdown-contract dev link` hand off to a checkout.
 */
import { envVars } from '@osdlc/cli-tool'
import { type ToolSpec, validateSpec } from '@osdlc/cli-tool/devlink'

export const DEVLINK_SPEC: ToolSpec = validateSpec({
  name: 'markdown-contract',
  marker: 'src/cli/run.ts',
  packageName: '@osdlc/markdown-contract',
  entry: 'src/cli/bin.ts',
  launcher: 'bin/markdown-contract.js',
  vendorDirs: { vendor: 'markdown-contract', envVars: envVars('MARKDOWN_CONTRACT') },
})
