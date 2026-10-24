// Runs the conformance corpus against the built package. The other tests run
// the TypeScript source; this one runs dist/ and its copy of the wasm, the
// code npm users get. It imports `../dist/index.js`, so it needs the build,
// which the workspace runs before the tests (`pnpm -r build`, then
// `pnpm test`).

import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { EditError, editYaml } from '../dist/index.js'

type Edits = Parameters<typeof editYaml>[1]

interface Fixture {
  name: string
  source?: string
  source_bytes?: number[]
  edits: Edits
  case_sensitive?: boolean
  expect: { error?: string; changed?: boolean; bytes?: string }
}

// The corpus is the crate's; this suite reads it in place.
const fixtures = JSON.parse(
  readFileSync(
    new URL('../../../rust/yaml-splice/tests/fixtures/conformance.json', import.meta.url),
    'utf8',
  ),
) as Fixture[]

const sourceBytes = (fx: Fixture): Uint8Array =>
  fx.source !== undefined ? new TextEncoder().encode(fx.source) : Uint8Array.from(fx.source_bytes!)

describe('the built package against the corpus', () => {
  test('the corpus is non-empty', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const fx of fixtures) {
    // The package has no case-sensitivity option; see tests/index.test.ts.
    test.skipIf(fx.case_sensitive === true)(fx.name, () => {
      const source = sourceBytes(fx)
      if (fx.expect.error !== undefined) {
        expect(() => editYaml(source, fx.edits)).toThrow(
          expect.objectContaining({ code: fx.expect.error }),
        )
        expect(() => editYaml(source, fx.edits)).toThrow(EditError)
        return
      }
      const out = editYaml(source, fx.edits)
      expect(out.changed).toBe(fx.expect.changed)
      expect(new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }).decode(out.bytes)).toBe(
        fx.expect.bytes,
      )
    })
  }
})
