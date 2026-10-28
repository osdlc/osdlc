/**
 * Writes the expected values of the tiered-dirs conformance suite.
 *
 *   pnpm --filter @osdlc/tiered-dirs conformance:write
 *
 * Inputs are written by hand in `packages/conformance/tiered-dirs/suite.json`.
 * This rewrites every case's `expect` or `error` from what this package, the
 * family's reference, gives, and stamps `referenceVersion`. Run it on Linux or
 * macOS: the `env` cases resolve POSIX paths.
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
    const { expect: _expect, error: _error, platforms, skip, ...rest } = c
    return {
      name: rest.name,
      input: rest.input,
      ...run(name, c.input),
      ...(platforms === undefined ? {} : { platforms }),
      ...(skip === undefined ? {} : { skip }),
    }
  })
}

writeFileSync(SUITE_PATH, `${JSON.stringify(suite, null, 2)}\n`)
