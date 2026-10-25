import { describe, expect, test } from 'vitest'

import {
  TieredDirs,
  TieredDirsError,
  envVars,
  parseConvention,
  rootedBaseDirs,
  systemBaseDirs,
} from '../src/index.ts'
import type { TieredDirsErrorCode } from '../src/index.ts'

const ENV = envVars('EXAMPLE')
const dirs = new TieredDirs('com.example', rootedBaseDirs('/b'))

/** The error `run` throws, which must be a `TieredDirsError`. */
function thrown(run: () => unknown): TieredDirsError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(TieredDirsError)
    return error as TieredDirsError
  }
  throw new Error('expected a throw')
}

describe('every throw site sets its code', () => {
  const cases: [string, TieredDirsErrorCode, () => unknown][] = [
    ['no home', 'MISSING_BASE_DIR', () => systemBaseDirs(ENV, { platform: 'linux', env: {} })],
    [
      'a relative injected HOME',
      'MISSING_BASE_DIR',
      () => systemBaseDirs(ENV, { platform: 'linux', env: { HOME: '.' } }),
    ],
    [
      'an empty injected home',
      'MISSING_BASE_DIR',
      () => systemBaseDirs(ENV, { platform: 'linux', env: {}, home: '' }),
    ],
    [
      'a relative root',
      'RELATIVE_OVERRIDE',
      () => systemBaseDirs(ENV, { platform: 'linux', env: { EXAMPLE_ROOT: 'rel' } }),
    ],
    [
      'a relative per-directory variable',
      'RELATIVE_OVERRIDE',
      () => systemBaseDirs(ENV, { platform: 'linux', env: { EXAMPLE_LOGS_DIR: 'logs' } }),
    ],
    [
      'an unknown convention variable',
      'INVALID_CONVENTION',
      () => systemBaseDirs(ENV, { home: '/h', env: { EXAMPLE_CONVENTION: 'apple' } }),
    ],
    ['an unknown convention string', 'INVALID_CONVENTION', () => parseConvention('apple')],
    ['a bad vendor', 'INVALID_KEY', () => new TieredDirs('../x', rootedBaseDirs('/b'))],
    ['a bad suite', 'INVALID_KEY', () => dirs.suite('state')],
    ['a bad standalone tool', 'INVALID_KEY', () => dirs.standalone('')],
    ['a bad scope kind', 'INVALID_KEY', () => dirs.vendor().cache().scoped('a/b', 'k')],
    ['a bad scope', 'INVALID_KEY', () => dirs.vendor().cache().scoped('vaults', '..')],
    ['a bad app', 'INVALID_KEY', () => dirs.vendor().cache().app('run')],
  ]

  test.each(cases)('%s: %s', (_name, code, run) => {
    const error = thrown(run)
    expect(error.code).toBe(code)
    expect(error.name).toBe('TieredDirsError')
  })
})

test('the code does not change the message', () => {
  const error = new TieredDirsError('INVALID_KEY', 'the message')
  expect(error.message).toBe('the message')
  expect(error.code).toBe('INVALID_KEY')
  expect(error).toBeInstanceOf(Error)
})
