/**
 * Writes the expected values of the markdown-db conformance suite.
 *
 *   pnpm --filter @osdlc/markdown-db conformance:write
 *
 * Cases are written by hand in packages/conformance/markdown-db/suite.json, each naming a corpus
 * folder beside it. This rewrites every case's `expect` from what this package, the family's
 * reference, reports, and stamps `referenceVersion`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readSuite, run, SUITE_PATH } from './conformance.ts'

const suite = readSuite()
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
  version: string
}
suite.referenceVersion = pkg.version
for (const section of Object.values(suite.sections))
  section.cases = section.cases.map((c) => ({ name: c.name, input: c.input, expect: run(c.input) }))
writeFileSync(SUITE_PATH, `${JSON.stringify(suite, null, 2)}\n`)
