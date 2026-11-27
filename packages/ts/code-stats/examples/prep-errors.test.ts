/**
 * A failure a caller shows as a message: `CodeStatsError`, with `kind` set to `bad-input`
 * when the arguments, not the repository, were at fault.
 */
import { expect, test } from 'vitest'

import { CodeStatsError } from '@osdlc/code-stats'
import { runPrep } from '@osdlc/code-stats/prep'

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
    expect(e).toBeInstanceOf(CodeStatsError)
    expect((e as CodeStatsError).kind).toBe('bad-input')
  }
})
