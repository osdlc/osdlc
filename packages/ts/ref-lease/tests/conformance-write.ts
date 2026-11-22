/**
 * Writes the expected values of the ref-lease conformance suite.
 *
 *   pnpm --filter @osdlc/ref-lease conformance:write
 *
 * Inputs are written by hand in `packages/conformance/ref-lease/suite.json`.
 * This rewrites every case's `expect` from what this package, the family's
 * reference, gives, and stamps `referenceVersion`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SUITE_PATH, readSuite, run } from './conformance.ts'

const suite = readSuite()
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
  version: string
}
suite.referenceVersion = pkg.version
for (const [name, section] of Object.entries(suite.sections)) {
  section.cases = section.cases.map((c) => ({
    name: c.name,
    input: c.input,
    expect: run(name, c.input),
  }))
}
writeFileSync(SUITE_PATH, `${JSON.stringify(suite, null, 2)}\n`)
