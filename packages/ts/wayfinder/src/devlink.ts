/**
 * The devlink spec: what `@osdlc/cli-tool/devlink` needs to recognise a
 * wayfinder checkout, run it, and put `way` on PATH.
 *
 * The marker is the source entry, which only a checkout has: the installed
 * package ships `dist/` alone. A selected checkout runs its source under Bun.
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
