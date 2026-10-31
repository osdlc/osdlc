/**
 * The devlink spec: what `@osdlc/cli-tool/devlink` needs to recognise a
 * wayfinder checkout, run it, and put `way` on PATH.
 *
 * A checkout has the source entry and a `package.json` named
 * `@osdlc/wayfinder`. The installed package ships no `src/`, so it never
 * counts. A selected checkout runs its source under Bun.
 *
 * The cwd layer stays off. Only `WAY_HOME` or `way dev link` hand off to a
 * checkout, so standing in a repository never runs that repository's code.
 *
 * The link state is `<config>/way/` under the `xdg` convention, moved by the
 * same `WAYFINDER_ROOT` and `WAYFINDER_CONFIG_DIR` as wayfinder's other files.
 */

import { validateSpec, type ToolSpec } from '@osdlc/cli-tool/devlink'

import { APP, BIN } from './app.ts'
import { DIR_ENV_VARS } from './xdg.ts'

const MARKER = 'src/cli.ts'

export const WAYFINDER_SPEC: ToolSpec = validateSpec({
  name: BIN,
  marker: MARKER,
  packageName: '@osdlc/wayfinder',
  entry: MARKER,
  launcher: 'bin/way.js',
  aliases: [APP],
  vendorDirs: { vendor: APP, envVars: DIR_ENV_VARS },
})
