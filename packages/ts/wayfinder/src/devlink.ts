/**
 * The devlink spec: what `@osdlc/cli-tool/devlink` needs to recognise a
 * wayfinder checkout, run it, and put `way` on PATH.
 *
 * A checkout has the source entry and a `package.json` named
 * `@osdlc/wayfinder`. The installed package ships `dist/` alone, so it never
 * counts. A selected checkout runs its source under Bun.
 *
 * The cwd layer stays off. Only `WAY_HOME` or `way dev link` hand off to a
 * checkout, so standing in a repository never runs that repository's code.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { envVars } from '@osdlc/cli-tool'
import { validateSpec, type ToolSpec } from '@osdlc/cli-tool/devlink'

import { APP, BIN } from './app.ts'

const MARKER = 'src/cli.ts'

export const WAYFINDER_SPEC: ToolSpec = validateSpec({
  name: BIN,
  marker: MARKER,
  packageName: '@osdlc/wayfinder',
  entry: MARKER,
  launcher: 'bin/way.js',
  aliases: [APP],
  vendorDirs: { vendor: APP, envVars: envVars(BIN.toUpperCase()) },
})

/**
 * The checkout this module runs from, or null for an installed package.
 * `src/` and `dist/` are both one level below the package root.
 */
export function checkoutRoot(): string | null {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..')
  return existsSync(resolve(root, MARKER)) ? root : null
}
