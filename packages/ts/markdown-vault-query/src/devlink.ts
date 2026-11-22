/**
 * The devlink spec: how `markdown-vault-query dev` recognises a markdown-vault-query checkout and runs it.
 *
 * A checkout has `src/cli.ts` and a `package.json` named `@osdlc/markdown-vault-query`; the
 * installed package ships no `src/`, so it never counts. A selected
 * checkout runs `src/bin.ts` under Bun. The cwd layer stays off: only
 * `MARKDOWN_VAULT_QUERY_HOME` or `markdown-vault-query dev link` hand off to a checkout.
 */

import { envVars } from '@osdlc/cli-tool'
import { type ToolSpec, validateSpec } from '@osdlc/cli-tool/devlink'

export const DEVLINK_SPEC: ToolSpec = validateSpec({
  name: 'markdown-vault-query',
  marker: 'src/cli.ts',
  packageName: '@osdlc/markdown-vault-query',
  entry: 'src/bin.ts',
  launcher: 'bin/markdown-vault-query.js',
  vendorDirs: { vendor: 'markdown-vault-query', envVars: envVars('MARKDOWN_VAULT_QUERY') },
})
