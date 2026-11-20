import { describe, expect, test } from 'vitest'

import { CASE_KEYS, INPUT_KEYS, checkInput, readSuite, run } from './conformance.ts'
import type { Case } from './conformance.ts'

/**
 * Runs `packages/conformance/markdown-contract/suite.json`, the cases this
 * package and the Rust `markdown-contract` crate must agree on.
 * `conformance.ts` holds the runner, which also writes the suite's expected
 * values. The suite's sections must be exactly the ones this package runs, and
 * every case's shape and input are checked before `skip` filters the cases, as
 * the Rust runner does.
 */

const suite = readSuite()
const sections = suite.sections

/** Whether a case runs here. */
function runsHere(c: Case): boolean {
  return c.skip?.['ts'] === undefined
}

describe('conformance suite', () => {
  test('is the markdown-contract suite, with this package as its reference', () => {
    expect([suite.family, suite.reference]).toEqual(['markdown-contract', 'ts'])
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
        expect(Object.keys(c.expect), c.name).toEqual(['findings'])
        checkInput(name, c.input)
      }
    }
  })

  test('case names are unique', () => {
    const names = Object.values(sections).flatMap((s) => s.cases.map((c) => c.name))
    expect(new Set(names).size).toBe(names.length)
  })

  test('runs some case of every section here', () => {
    for (const [name, section] of Object.entries(sections)) {
      expect(section.cases.filter(runsHere).length, name).toBeGreaterThan(0)
    }
  })

  for (const [name, section] of Object.entries(sections)) {
    describe(name, () => {
      for (const c of section.cases) {
        test.skipIf(!runsHere(c))(c.name, () => {
          expect(run(name, c.input)).toEqual({ expect: c.expect })
        })
      }
    })
  }
})
