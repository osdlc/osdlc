/**
 * Runs packages/conformance/corpus-schema/suite.json: every case, and only the sections this
 * package knows. Every corpus folder beside the suite is named by a case, so none is skipped.
 */
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, test } from 'vitest'

import { FAMILY_DIR, readSuite, run, SECTIONS } from './conformance.ts'

const suite = readSuite()

test('the suite has exactly the sections this package runs', () => {
  assert.equal(suite.family, 'corpus-schema')
  assert.deepEqual(Object.keys(suite.sections).sort(), [...SECTIONS].sort())
})

test('every corpus folder is named by one case', () => {
  const folders = readdirSync(join(FAMILY_DIR, 'corpora'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `corpora/${d.name}`)
  const named = Object.values(suite.sections).flatMap((s) => s.cases.map((c) => c.input.corpus))
  assert.deepEqual([...named].sort(), folders.sort())
})

for (const [name, section] of Object.entries(suite.sections))
  describe(name, () => {
    for (const c of section.cases)
      test(c.name, () => {
        assert.ok(c.expect !== undefined, 'run conformance:write to fill in expect')
        assert.deepEqual(run(name, c.input), c.expect)
      })
  })
