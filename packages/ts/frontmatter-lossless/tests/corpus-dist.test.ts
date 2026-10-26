// Runs the conformance corpus against the built package. The other tests run
// the TypeScript source; this one runs dist/, the code npm users get. It
// imports `../dist/index.js`, so it needs the build, which the workspace runs
// before the tests (`pnpm -r build`, then `pnpm test`).

import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { compose, split, splitLenient } from '../dist/index.js'

interface Fixture {
  name: string
  source: string
  split: {
    yaml: string | null
    body: string
    bom: boolean
    openEol: string
    closeEol: string
    closeSep: string
  }
  lenient: unknown
  edit?: { yaml: string; body: string; out: string }
}

// The corpus is the crate's; this suite reads it in place.
const fixtures = JSON.parse(
  readFileSync(
    new URL('../../../rust/frontmatter-lossless/tests/fixtures/conformance.json', import.meta.url),
    'utf8',
  ),
) as Fixture[]

describe('the built package against the corpus', () => {
  test('the corpus is non-empty', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const fx of fixtures) {
    test(`[${fx.name}] split, round trip, offsets, lenient and edit`, () => {
      const s = split(fx.source)
      expect(s.yaml).toBe(fx.split.yaml)
      expect(s.body).toBe(fx.split.body)
      expect({ ...s.shape }).toEqual({
        bom: fx.split.bom,
        openEol: fx.split.openEol,
        closeEol: fx.split.closeEol,
        closeSep: fx.split.closeSep,
      })
      expect(compose(s.yaml, s.body, s.shape)).toBe(fx.source)
      if (s.yaml !== null) {
        expect(fx.source.slice(s.yamlRange.start, s.yamlRange.end)).toBe(s.yaml)
      }
      expect(fx.source.slice(s.bodyStart)).toBe(s.body)
      expect(splitLenient(fx.source)).toEqual(fx.lenient)
      if (fx.edit) {
        const out = compose(fx.edit.yaml, fx.edit.body, s.shape)
        expect(out).toBe(fx.edit.out)
        const back = split(out)
        expect([back.yaml, back.body]).toEqual([fx.edit.yaml, fx.edit.body])
      }
    })
  }
})
