/**
 * Runs `packages/conformance/ref-lease/suite.json`, the cases this package and
 * the Rust `ref-lease` crate must agree on. The runner is `run` in `conformance.ts`.
 */
import { describe, expect, test } from 'vitest'

import { CASE_KEYS, INPUT_KEYS, checkInput, readSuite, run } from './conformance.ts'

const suite = readSuite()
const sections = suite.sections

describe('conformance suite', () => {
  test('is the ref-lease suite, with this package as its reference', () => {
    expect([suite.family, suite.reference]).toEqual(['ref-lease', 'ts'])
  })

  test('has exactly the sections this implementation runs', () => {
    expect(Object.keys(sections).sort()).toEqual(Object.keys(INPUT_KEYS).sort())
  })

  test('every case has a shape this implementation knows', () => {
    for (const [name, section] of Object.entries(sections)) {
      for (const c of section.cases) {
        expect(
          Object.keys(c).filter((k) => !CASE_KEYS.includes(k)),
          c.name,
        ).toEqual([])
        checkInput(name, c.input)
      }
    }
  })

  for (const [name, section] of Object.entries(sections)) {
    describe(name, () => {
      for (const c of section.cases) {
        test(c.name, () => {
          expect(run(name, c.input)).toEqual(c.expect)
        })
      }
    })
  }
})
