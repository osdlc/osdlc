/**
 * The devlink spec: how `markdown-astro dev` recognises a markdown-astro checkout and runs it.
 *
 * A checkout has `src/cli.ts` and a `package.json` named `@osdlc/markdown-astro`; the
 * installed package ships no `src/`, so it never counts. A selected checkout runs
 * `src/cli.ts` from source. The cwd layer stays off: only `MARKDOWN_ASTRO_HOME` or
 * `markdown-astro dev link` hand off to a checkout.
 */

import { envVars } from '@osdlc/cli-tool'
import { type ToolSpec, validateSpec } from '@osdlc/cli-tool/devlink'

export const DEVLINK_SPEC: ToolSpec = validateSpec({
  name: 'markdown-astro',
  marker: 'src/cli.ts',
  packageName: '@osdlc/markdown-astro',
  entry: 'src/cli.ts',
  launcher: 'bin/markdown-astro.js',
  vendorDirs: { vendor: 'markdown-astro', envVars: envVars('MARKDOWN_ASTRO') },
})
