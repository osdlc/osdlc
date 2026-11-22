/**
 * A failure a caller shows as a message: `DiffkitError`, with `usage` set when
 * the command line, not the repository, was at fault.
 */
import { expect, test } from 'vitest'

import { DiffkitError, runPrep } from '@osdlc/diffkit'

test('contradictory selectors are a usage error', () => {
  const never = {
    run: () => {
      throw new Error('not called')
    },
  }
  try {
    runPrep({ cwd: '.', pr: 12, base: 'main' }, { git: never, gh: never })
    expect.unreachable('a PR and --base cannot be combined')
  } catch (e) {
    expect(e).toBeInstanceOf(DiffkitError)
    expect((e as DiffkitError).usage).toBe(true)
  }
})
