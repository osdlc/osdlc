import { describe, expect, test } from 'vitest'

import {
  CASE_KEYS,
  INPUT_KEYS,
  byteOffset,
  checkInput,
  readSuite,
  run,
  utf16Offset,
} from './conformance.ts'
import type { SuiteCase } from './conformance.ts'

/**
 * Runs `packages/conformance/gfm-table/suite.json`, the cases this package
 * and the Rust `gfm-pipe-table` crate must agree on. `conformance.ts` holds
 * the runner, which also writes the suite's expected values. The suite's
 * sections must be exactly the ones this package runs, and every case's shape
 * and input are checked before `platforms` and `skip` filter the cases, as
 * the Rust runner does.
 */

const suite = readSuite()
const sections = suite.sections

const HOST = process.platform === 'win32' ? 'windows' : 'unix'

/** Whether a case runs on this host. */
function runsHere(c: SuiteCase): boolean {
  if (c.skip?.['ts'] !== undefined) return false
  return c.platforms === undefined || c.platforms.includes(HOST)
}

describe('conformance suite', () => {
  test('is the gfm-table suite, with this package as its reference', () => {
    expect([suite.family, suite.reference]).toEqual(['gfm-table', 'ts'])
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
        const outcomes = ['expect', 'error'].filter((k) => k in c)
        expect(outcomes, `${c.name}: exactly one of expect and error`).toHaveLength(1)
        // An error holds its kind only.
        expect(Object.keys(c.error ?? { kind: '' }), c.name).toEqual(['kind'])
        checkInput(name, c.input)
      }
    }
  })

  test('runs some case of every section here', () => {
    for (const [name, section] of Object.entries(sections)) {
      expect(section.cases.filter(runsHere).length, name).toBeGreaterThan(0)
    }
  })

  test('the byte offset conversion', () => {
    expect(byteOffset('a中👍b', 4)).toBe(8)
    expect(utf16Offset('a中👍b', 8)).toBe(4)
    expect(() => utf16Offset('中', 1)).toThrow()
    // Byte 2 of the emoji: inside its surrogate pair, so not a boundary.
    expect(() => utf16Offset('|👍', 4)).toThrow()
  })

  for (const [name, section] of Object.entries(sections)) {
    describe(name, () => {
      for (const c of section.cases) {
        test.skipIf(!runsHere(c))(c.name, () => {
          expect(run(name, c.input)).toStrictEqual(
            c.error === undefined ? { expect: c.expect } : { error: { kind: c.error.kind } },
          )
        })
      }
    })
  }
})
