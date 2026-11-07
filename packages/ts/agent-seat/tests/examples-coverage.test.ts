/**
 * Every stable export has at least one usage example: some `examples/*.test.ts` uses its name
 * outside an import. An export tagged `@experimental` is exempt (the README's "Stability"
 * section lists those, see `stability.test.ts`).
 */
import { expect, test } from 'vitest'

import { exampleIdentifiers, publicExports } from './fixtures/exports.ts'

test('every stable export is used in at least one example', () => {
  const stable = publicExports()
    .filter((e) => !e.experimental)
    .map((e) => e.name)
  const used = exampleIdentifiers()
  const uncovered = stable.filter((name) => !used.has(name))
  expect(stable.length).toBeGreaterThan(0)
  expect(uncovered, 'add an example under examples/ for each of these').toEqual([])
})
