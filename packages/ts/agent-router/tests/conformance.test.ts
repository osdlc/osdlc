import { describe, expect, test } from 'vitest'

import { CASE_KEYS, SECTION_NAMES, readSections, run } from './conformance.ts'

/**
 * Runs the agent-router conformance suite, `packages/conformance/agent-router/`
 * (`constants.json`, `ref_parse.json` and so on), the cases this package and
 * the Rust `agent-router` crate must agree on. `conformance.ts` holds the
 * runner, which also writes the suite's expected values. The suite is split
 * into one file per section, and its sections must be exactly the ones this
 * package runs.
 */

const files = readSections()

describe('conformance suite', () => {
  test('has exactly the sections this implementation runs, one per file', () => {
    expect([...files.keys()].sort()).toEqual([...SECTION_NAMES].sort())
    for (const { name, suite } of files.values()) {
      expect(Object.keys(suite.sections), name).toEqual([name])
    }
  })

  test('is the agent-router suite, with this package as its reference', () => {
    for (const { name, suite } of files.values()) {
      expect([suite.family, suite.reference], name).toEqual(['agent-router', 'ts'])
    }
  })

  test('every case has a shape this implementation knows', () => {
    for (const { suite } of files.values()) {
      for (const section of Object.values(suite.sections)) {
        for (const c of section.cases) {
          expect(
            Object.keys(c).filter((k) => !CASE_KEYS.includes(k)),
            c.name,
          ).toEqual([])
          // This family has no error cases: a rejected input is an `expect`.
          expect('expect' in c && !('error' in c), `${c.name}: an expect and no error`).toBe(true)
        }
      }
    }
  })

  for (const { name, suite } of files.values()) {
    describe(name, () => {
      for (const c of suite.sections[name]?.cases ?? []) {
        test.skipIf(c.skip?.['ts'] !== undefined)(c.name, () => {
          expect(run(name, c.input)).toEqual(c.expect)
        })
      }
    })
  }
})
