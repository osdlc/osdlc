/**
 * Writes the expected values of the agent-router conformance suite.
 *
 *   pnpm --filter @osdlc/agent-router conformance:write
 *
 * Inputs are written by hand in `packages/conformance/agent-router/`, one
 * file per section. This rewrites every case's `expect` from what this
 * package, the family's reference, gives, and stamps `referenceVersion`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SECTION_NAMES, readSections, run } from './conformance.ts'
import type { Case } from './conformance.ts'

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as {
  version: string
}

const files = readSections()
const stray = [...files.keys()].filter((name) => !SECTION_NAMES.includes(name))
if (stray.length > 0) throw new Error(`no runner for the section files ${stray.join(', ')}`)

for (const { name, path, suite } of files.values()) {
  suite.referenceVersion = pkg.version
  const section = suite.sections[name]
  if (section === undefined || Object.keys(suite.sections).length !== 1) {
    throw new Error(`${name}.json holds exactly one section, named ${name}`)
  }
  section.cases = section.cases.map((c): Case => {
    if (c.error !== undefined) throw new Error(`${name}: ${c.name}: this family has no error cases`)
    return {
      name: c.name,
      input: c.input,
      expect: run(name, c.input),
      ...(c.platforms === undefined ? {} : { platforms: c.platforms }),
      ...(c.skip === undefined ? {} : { skip: c.skip }),
    }
  })
  writeFileSync(path, `${JSON.stringify(suite, null, 2)}\n`)
}
