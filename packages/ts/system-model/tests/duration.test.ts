import { describe, expect, test } from 'vitest'

import { humanAge, humanMs } from '../src/duration.ts'

describe('humanMs', () => {
  test.each([
    [0, '0ms'],
    [149, '149ms'],
    [999.4, '999ms'],
    [999.6, '1.0s'],
    [1423, '1.4s'],
    [9_940, '9.9s'],
    [9_960, '10s'],
    [35_000, '35s'],
    [59_400, '59s'],
    [59_600, '1m'],
    [150_000, '3m'],
  ])('%d ms is %s', (ms, text) => {
    expect(humanMs(ms)).toBe(text)
  })
})

describe('humanAge', () => {
  test('a miss has no age', () => {
    expect(humanAge(undefined)).toBe('of unknown age')
  })

  test.each([
    [0, '1s old'],
    [-5_000, '1s old'],
    [35_000, '35s old'],
    [59_400, '59s old'],
    [59_600, '1m old'],
    [3_599_000, '1h old'],
    [5_400_000, '2h old'],
    [86_399_000, '1d old'],
    [3 * 86_400_000, '3d old'],
  ])('%d ms is %s', (ms, text) => {
    expect(humanAge(ms)).toBe(text)
  })
})
