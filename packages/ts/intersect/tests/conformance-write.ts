/**
 * Writes the expected values of the intersect conformance suite.
 *
 *   pnpm --filter @osdlc/intersect conformance:write
 *
 * Inputs are written by hand in `packages/conformance/intersect/suite.json`.
 * This rewrites every case's `expect` or `error` from what this package, the
 * family's reference, gives, and stamps `referenceVersion`. Run it on Linux or
 * macOS, and not as root: the fs cases create symbolic links and unreadable
 * directories.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CASE_KEYS, SUITE_PATH, readSuite, run } from './conformance.ts'
import type { Case } from './conformance.ts'

const suite = readSuite()
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
  version: string
}
suite.referenceVersion = pkg.version

for (const [name, section] of Object.entries(suite.sections)) {
  const cases: Case[] = []
  for (const c of section.cases) {
    // A key outside the known ones is a typo; rewriting would drop it unseen.
    const unknown = Object.keys(c).filter((k) => !CASE_KEYS.includes(k))
    if (unknown.length > 0) {
      throw new Error(`${name}: ${c.name}: unknown case keys ${unknown.join(', ')}`)
    }
    const { platforms, skip } = c
    cases.push({
      name: c.name,
      input: c.input,
      ...(await run(name, c.input)),
      ...(platforms === undefined ? {} : { platforms }),
      ...(skip === undefined ? {} : { skip }),
    })
  }
  section.cases = cases
}

writeFileSync(SUITE_PATH, `${JSON.stringify(suite, null, 2)}\n`)
