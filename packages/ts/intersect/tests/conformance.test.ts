import { describe, expect, test } from 'vitest'

import { CASE_KEYS, SECTIONS, canRunHere, checkInput, readSuite, run } from './conformance.ts'
import type { Case } from './conformance.ts'

/**
 * Runs `packages/conformance/intersect/suite.json`, the cases this package and
 * the Rust `glob-intersect` crate must agree on. `conformance.ts` holds the
 * runner, which also writes the suite's expected values. A section or a case
 * key this package does not know fails, and every case runs unless its
 * `platforms` or `skip` rules this host out. Every case's shape is checked on
 * every host, before that filtering, as the Rust runner does.
 */

const suite = readSuite()

/** Whether a case runs on this host. */
function runsHere(c: Case): boolean {
  if (c.skip?.['ts'] !== undefined) return false
  if (c.platforms === undefined) return true
  return c.platforms.includes(process.platform === 'win32' ? 'windows' : 'unix')
}

describe('conformance suite', () => {
  test('is the intersect family with TypeScript as its reference', () => {
    expect(suite.family).toBe('intersect')
    expect(suite.reference).toBe('ts')
  })

  test('names no section this implementation does not run', () => {
    expect(Object.keys(suite.sections).filter((s) => !(s in SECTIONS))).toEqual([])
  })

  for (const [name, section] of Object.entries(suite.sections)) {
    describe(name, () => {
      test('every case has a shape this implementation knows', () => {
        for (const c of section.cases) {
          expect(
            Object.keys(c).filter((k) => !CASE_KEYS.includes(k)),
            c.name,
          ).toEqual([])
          const outcomes = ['expect', 'error'].filter((k) => k in c)
          expect(outcomes, `${c.name}: exactly one of expect and error`).toHaveLength(1)
          // The two implementations' messages differ, so no case may compare one.
          expect(c.error?.message, c.name).toBeUndefined()
          checkInput(name, c.input)
        }
      })

      for (const c of section.cases) {
        test.skipIf(!runsHere(c))(c.name, async (ctx) => {
          // A case with `unreadable` cannot run as root; the skip shows in the report.
          if (!canRunHere(c.input)) ctx.skip()
          expect(await run(name, c.input)).toEqual(
            c.error === undefined ? { expect: c.expect } : { error: { kind: c.error.kind } },
          )
        })
      }
    })
  }
})
