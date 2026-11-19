/**
 * Writes the expected values of the etag-write conformance suite.
 *
 *   pnpm --filter @osdlc/etag-write conformance:write
 *
 * Inputs are written by hand in `packages/conformance/etag-write/suite.json`.
 * This rewrites every case's `expect` or `error` from what this package, the
 * family's reference, gives, and stamps `referenceVersion`. Run it on Linux or
 * macOS: the `write_atomic_mode` section is for `unix` only.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SUITE_PATH, readSuite, run } from './conformance.ts'
import type { Case } from './conformance.ts'

if (process.platform === 'win32') throw new Error('run the generator on Linux or macOS')

const suite = readSuite()
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
  version: string
}
suite.referenceVersion = pkg.version

for (const [name, section] of Object.entries(suite.sections)) {
  section.cases = section.cases.map((c): Case => {
    // The suite compares error kinds only: the implementations' messages differ by design.
    if (c.error !== undefined && 'message' in c.error) {
      throw new Error(`${name}: ${c.name}: error.message is not compared; remove it`)
    }
    return {
      name: c.name,
      input: c.input,
      ...run(name, c.input),
      ...(c.platforms === undefined ? {} : { platforms: c.platforms }),
      ...(c.skip === undefined ? {} : { skip: c.skip }),
    }
  })
}
writeFileSync(SUITE_PATH, `${JSON.stringify(suite, null, 2)}\n`)
