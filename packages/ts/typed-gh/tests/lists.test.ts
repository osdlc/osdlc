/**
 * Every list query returns `{ rows, truncated } | null`. The verb asks gh
 * for one row more than `limit`, so a list cut short says so.
 */

import { describe, expect, test } from 'vitest'

import { issueList, labelList, prList, type CommandResult } from '../src/index.ts'

const rows = (n: number): CommandResult => ({
  exitCode: 0,
  stdout: JSON.stringify(
    Array.from({ length: n }, (_, i) => ({ number: i + 1, name: `l${i}`, headRefName: 'h' })),
  ),
  stderr: '',
})
const FAIL: CommandResult = { exitCode: 1, stdout: '', stderr: 'boom' }

const LISTS = [
  ['prList', (limit: number) => prList({ limit })],
  ['issueList', (limit: number) => issueList({ limit })],
  ['labelList', (limit: number) => labelList({ limit })],
] as const

describe('a list', () => {
  for (const [name, build] of LISTS) {
    test(`${name} asks gh for limit + 1 rows`, () => {
      const argv = build(3).argv
      expect(argv[argv.indexOf('--limit') + 1]).toBe('4')
    })

    test(`${name} is truncated when the extra row comes back, and keeps limit rows`, () => {
      const result = build(3).parse(rows(4))
      expect(result?.rows.length).toBe(3)
      expect(result?.truncated).toBe(true)
    })

    test(`${name} is complete with exactly limit rows`, () => {
      expect(build(3).parse(rows(3))?.truncated).toBe(false)
      expect(build(3).parse(rows(0))).toEqual({ rows: [], truncated: false })
    })

    test(`${name} is null when gh failed`, () => {
      expect(build(3).parse(FAIL)).toBeNull()
    })

    test(`${name} throws RangeError for a limit that is not a positive integer`, () => {
      for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => build(bad)).toThrow(RangeError)
      }
    })
  }

  test('a head filter applies after the cut, so truncated still reports a full page', () => {
    const verb = prList({ head: 'x', limit: 2 })
    const result = verb.parse(rows(3))
    expect(result).toEqual({ rows: [], truncated: true })
  })
})
