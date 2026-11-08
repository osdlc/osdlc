import { describe, expect, test } from 'vitest'

import { SECTIONS, readSuite, run } from './conformance.ts'
import type { Case } from './conformance.ts'

/**
 * Runs `packages/conformance/file-lock/suite.json`, the cases this package and
 * the Rust `osdlc-file-lock` crate must agree on so that the two can hold one
 * lock file in turn. `conformance.ts` holds the runner, which also writes the
 * suite's expected values.
 */

const suite = readSuite()

/** Whether a case runs on this host. */
function runsHere(c: Case): boolean {
  if (c.skip?.['ts'] !== undefined) return false
  if (c.platforms === undefined) return true
  return c.platforms.includes(process.platform === 'win32' ? 'windows' : 'unix')
}

describe('conformance suite', () => {
  test('names no section this implementation does not run', () => {
    expect(Object.keys(suite.sections).filter((s) => !SECTIONS.includes(s))).toEqual([])
  })

  for (const [name, section] of Object.entries(suite.sections)) {
    describe(name, () => {
      for (const c of section.cases) {
        test.skipIf(!runsHere(c))(c.name, () => {
          const got = run(name, c.input)
          expect(got).toEqual(c.error === undefined ? { expect: c.expect } : { error: c.error })
        })
      }
    })
  }
})
