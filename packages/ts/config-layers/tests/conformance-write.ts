/**
 * Writes the expected values of the config-layers conformance suite.
 *
 *   pnpm --filter @osdlc/config-layers conformance:write
 *
 * Inputs are written by hand in `packages/conformance/config-layers/suite.json`.
 * This rewrites every case's `expect` or `error` from what this package, the
 * family's reference, gives, and stamps `referenceVersion`. Run it on Linux or
 * macOS: the path and need cases use POSIX paths.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SUITE_PATH, readSuite, run } from './conformance.ts'
import type { Case } from './conformance.ts'

const suite = readSuite()
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
  version: string
}
suite.referenceVersion = pkg.version

for (const [name, section] of Object.entries(suite.sections)) {
  section.cases = section.cases.map((c): Case => {
    const { platforms, skip } = c
    return {
      name: c.name,
      input: c.input,
      ...run(name, c.input),
      ...(platforms === undefined ? {} : { platforms }),
      ...(skip === undefined ? {} : { skip }),
    }
  })
}

writeFileSync(SUITE_PATH, `${JSON.stringify(suite, null, 2)}\n`)
