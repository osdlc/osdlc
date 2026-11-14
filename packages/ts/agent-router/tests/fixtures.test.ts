// Every committed vector's `expected` must come from its `input` here, as in the
// Rust tests; see scripts/fixtures.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { FIXTURES_DIR } from '../scripts/emit-fixtures.ts'
import { AREAS, type Vector } from '../scripts/fixtures.ts'

describe('fixtures', () => {
  test('every area has vectors', () => {
    for (const area of AREAS) expect(area.vectors.length, area.file).toBeGreaterThan(0)
  })
})

for (const area of AREAS) {
  describe(`fixtures/${area.file}`, () => {
    const vectors = JSON.parse(
      readFileSync(join(FIXTURES_DIR, `${area.file}.json`), 'utf8'),
    ) as Vector[]
    test.each(vectors.map((vec) => [vec.name, vec] as const))('%s', (_name, vec) => {
      const actual = JSON.parse(JSON.stringify(area.run(vec.input) ?? null))
      expect(actual).toEqual(vec.expected)
    })
  })
}
