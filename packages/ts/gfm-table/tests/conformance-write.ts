/**
 * Writes the expected values of the gfm-table conformance suite.
 *
 *   pnpm --filter @osdlc/gfm-table conformance:write
 *
 * Inputs are written by hand in `packages/conformance/gfm-table/suite.json`.
 * This rewrites every case's `expect` or `error` from what this package, the
 * family's reference, gives, and stamps `referenceVersion`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SUITE_PATH, readSuite, run } from './conformance.ts'
import type { SuiteCase } from './conformance.ts'

const suite = readSuite()
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
  version: string
}
suite.referenceVersion = pkg.version

for (const [name, section] of Object.entries(suite.sections)) {
  section.cases = section.cases.map((c): SuiteCase => {
    if (c.error !== undefined && 'message' in c.error) {
      throw new Error(`${name}: ${c.name}: error.message is not compared; remove it`)
    }
    const outcome = run(name, c.input)
    if ('expect' in outcome && outcome.expect === undefined) {
      throw new Error(`${name}: ${c.name}: the runner returned no outcome`)
    }
    return {
      name: c.name,
      input: c.input,
      ...outcome,
      ...(c.platforms === undefined ? {} : { platforms: c.platforms }),
      ...(c.skip === undefined ? {} : { skip: c.skip }),
    }
  })
}
writeFileSync(SUITE_PATH, `${JSON.stringify(suite, null, 2)}\n`)
