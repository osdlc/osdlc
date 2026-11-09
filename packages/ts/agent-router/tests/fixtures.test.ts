// The fixture vectors shared with the Rust twin (packages/rust/agent-router;
// see docs/planning/decisions/D-05): this package must produce every committed
// vector's `expected` from its `input`, as the Rust tests do. That the committed
// files equal what scripts/fixtures.ts emits is `pnpm run check:extra`;
// regenerate with `pnpm run fixtures`.
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
