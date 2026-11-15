/**
 * The devlink spec: how `markdown-vault-astro dev` recognises a markdown-vault-astro checkout and runs it.
 *
 * A checkout has `src/cli.ts` and a `package.json` named `@osdlc/markdown-vault-astro`; the
 * installed package ships no `src/`, so it never counts. A selected checkout runs
 * `src/cli.ts` from source. The cwd layer stays off: only `MARKDOWN_VAULT_ASTRO_HOME` or
 * `markdown-vault-astro dev link` hand off to a checkout.
 */

import { envVars } from '@osdlc/cli-tool'
import { type ToolSpec, validateSpec } from '@osdlc/cli-tool/devlink'

export const DEVLINK_SPEC: ToolSpec = validateSpec({
  name: 'markdown-vault-astro',
  marker: 'src/cli.ts',
  packageName: '@osdlc/markdown-vault-astro',
  entry: 'src/cli.ts',
  launcher: 'bin/markdown-vault-astro.js',
  vendorDirs: { vendor: 'markdown-vault-astro', envVars: envVars('MARKDOWN_VAULT_ASTRO') },
})
