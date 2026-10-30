/**
 * Runs `packages/conformance/config-layers/suite.json`, the cases this package
 * and the Rust `config-layers` crate must agree on. `conformance.ts` holds the
 * runner, which also writes the suite's expected values. `readSuite` fails on
 * a section, case field or error field the runner does not know, and every
 * case either runs here or is skipped for a reason the suite gives.
 */
import { describe, expect, test } from 'vitest'

import { SECTION_NAMES, readSuite, run } from './conformance.ts'
import type { Case } from './conformance.ts'

const suite = readSuite()

/** Whether a case runs on this host. */
function runsHere(c: Case): boolean {
  if (c.skip?.['ts'] !== undefined) return false
  if (c.platforms === undefined) return true
  return c.platforms.includes(process.platform === 'win32' ? 'windows' : 'unix')
}

describe('conformance suite', () => {
  test('is the config-layers suite, with every section this package runs', () => {
    expect(suite.family).toBe('config-layers')
    expect(Object.keys(suite.sections).sort()).toEqual([...SECTION_NAMES].sort())
  })

  for (const [name, section] of Object.entries(suite.sections)) {
    describe(name, () => {
      for (const c of section.cases) {
        test.skipIf(!runsHere(c))(c.name, () => {
          if ((c.expect === undefined) === (c.error === undefined)) {
            throw new Error('give exactly one of expect and error')
          }
          const got = run(name, c.input)
          if (c.error === undefined) {
            expect(got).toEqual({ expect: c.expect })
            return
          }
          // The message is compared only where the case sets one.
          expect('error' in got).toBe(true)
          const error = 'error' in got ? got.error : undefined
          expect(error?.kind).toBe(c.error.kind)
          if (c.error.message !== undefined) expect(error?.message).toBe(c.error.message)
        })
      }
    })
  }
})
