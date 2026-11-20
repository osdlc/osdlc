/**
 * Writes the expected values of the markdown-contract conformance suite.
 *
 *   pnpm --filter @osdlc/markdown-contract conformance:write
 *
 * Inputs are written by hand in `packages/conformance/markdown-contract/suite.json`.
 * This rewrites every case's `expect` from what this package, the family's
 * reference, gives, and stamps `referenceVersion`. It loads the built `dist/`,
 * so run `pnpm --filter @osdlc/markdown-contract build` first.
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
  section.cases = section.cases.map((c): Case => ({
    name: c.name,
    input: c.input,
    ...run(name, c.input),
    ...(c.platforms === undefined ? {} : { platforms: c.platforms }),
    ...(c.skip === undefined ? {} : { skip: c.skip }),
  }))
}
writeFileSync(SUITE_PATH, `${JSON.stringify(suite, null, 2)}\n`)
