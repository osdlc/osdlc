import { runChecked, spawnRunner } from '@osdlc/command-seam'
import { describe, expect, test } from 'vitest'

import { commandFailedOf, DiffkitError } from '../src/error.ts'

/** A real `CommandFailed`: git refuses an unknown subcommand. */
function realFailure(): unknown {
  try {
    runChecked(spawnRunner('git'), ['no-such-subcommand'], { cwd: process.cwd() })
  } catch (e) {
    return e
  }
  throw new Error('git accepted an unknown subcommand')
}

describe('commandFailedOf', () => {
  test('returns a bare command failure as it is', () => {
    const failed = realFailure()
    expect(commandFailedOf(failed)).toBe(failed)
  })

  test('finds the failure behind the error a typed client throws', () => {
    const failed = realFailure()
    expect(commandFailedOf({ failure: { cause: failed } })).toBe(failed)
  })

  test('is null for anything else', () => {
    expect(commandFailedOf(new Error('x'))).toBeNull()
    expect(commandFailedOf({ failure: { cause: 'not a failure' } })).toBeNull()
    expect(commandFailedOf({ failure: null })).toBeNull()
    expect(commandFailedOf(null)).toBeNull()
    expect(commandFailedOf('text')).toBeNull()
  })
})

describe('DiffkitError', () => {
  test('is a usage error only when it says so', () => {
    expect(new DiffkitError('boom').usage).toBe(false)
    expect(new DiffkitError('bad line', true).usage).toBe(true)
    expect(new DiffkitError('boom')).toBeInstanceOf(Error)
  })
})
