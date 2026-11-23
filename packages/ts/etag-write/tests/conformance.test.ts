import { describe, expect, test } from 'vitest'

import { CASE_KEYS, INPUT_KEYS, checkInput, readSuite, run } from './conformance.ts'
import type { Case } from './conformance.ts'

/**
 * Runs `packages/conformance/etag-write/suite.json`, the cases this package
 * and the Rust `etag-write` crate must agree on. `conformance.ts` holds the
 * runner, which also writes the suite's expected values. The suite's sections
 * must be exactly the ones this package runs, and every case's shape and input
 * are checked on every host, before `platforms` and `skip` filter the cases,
 * as the Rust runner does.
 */

const suite = readSuite()
const sections = suite.sections

const HOST = process.platform === 'win32' ? 'windows' : 'unix'

/** Whether a case runs on this host. */
function runsHere(c: Case): boolean {
  if (c.skip?.['ts'] !== undefined) return false
  return c.platforms === undefined || c.platforms.includes(HOST)
}

describe('conformance suite', () => {
  test('is the etag-write suite, with this package as its reference', () => {
    expect([suite.family, suite.reference]).toEqual(['etag-write', 'ts'])
  })

  test('has exactly the sections this implementation runs', () => {
    expect(Object.keys(sections).sort()).toEqual(Object.keys(INPUT_KEYS).sort())
  })

  // On every host, before `platforms` and `skip` filter the cases.
  test('every case has a shape this implementation knows', () => {
    for (const [name, section] of Object.entries(sections)) {
      for (const c of section.cases) {
        expect(
          Object.keys(c).filter((k) => !CASE_KEYS.includes(k)),
          c.name,
        ).toEqual([])
        const outcomes = ['expect', 'error'].filter((k) => k in c)
        expect(outcomes, `${c.name}: exactly one of expect and error`).toHaveLength(1)
        // An error holds its kind only: the implementations' messages differ by design.
        expect(Object.keys(c.error ?? { kind: '' }), c.name).toEqual(['kind'])
        checkInput(name, c.input)
      }
    }
  })

  test('runs some case of every section here', () => {
    for (const [name, section] of Object.entries(sections)) {
      // A section whose every case's `platforms` excludes this host runs nothing here.
      if (section.cases.every((c) => c.platforms !== undefined && !c.platforms.includes(HOST)))
        continue
      expect(section.cases.filter(runsHere).length, name).toBeGreaterThan(0)
    }
  })

  for (const [name, section] of Object.entries(sections)) {
    describe(name, () => {
      for (const c of section.cases) {
        test.skipIf(!runsHere(c))(c.name, () => {
          expect(run(name, c.input)).toEqual(
            c.error === undefined ? { expect: c.expect } : { error: { kind: c.error.kind } },
          )
        })
      }
    })
  }
})
