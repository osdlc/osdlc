/**
 * Every list query returns `{ rows, truncated } | null`. The verb asks gh
 * for one row more than `limit`, so a list cut short says so.
 */

import { describe, expect, test } from 'vitest'

import { issueList, labelList, prList, searchPrs, type CommandResult } from '../src/index.ts'

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

describe("a search stops at 1000 results, so 1000 rows may be GitHub search's cut", () => {
  const hits = (n: number): CommandResult => ({
    exitCode: 0,
    stdout: JSON.stringify(
      Array.from({ length: n }, (_, i) => ({
        number: i + 1,
        repository: { nameWithOwner: 'acme/widgets' },
      })),
    ),
    stderr: '',
  })

  test('prList with search: 1000 rows at a limit of 1000 or more is truncated', () => {
    expect(prList({ search: 'is:pr', limit: 1000 }).parse(rows(1000))?.truncated).toBe(true)
    expect(prList({ search: 'is:pr', limit: 5000 }).parse(rows(1000))).toMatchObject({
      truncated: true,
    })
    expect(prList({ search: 'is:pr', limit: 5000 }).parse(rows(999))?.truncated).toBe(false)
  })

  test('prList without search lists past 1000, so 1000 rows at limit 1000 is complete', () => {
    expect(prList({ limit: 1000 }).parse(rows(1000))?.truncated).toBe(false)
    // An empty search is no search: gh lists and pages past 1000.
    expect(prList({ search: '', limit: 1000 }).parse(rows(1000))?.truncated).toBe(false)
  })

  test('prList with author goes through search too', () => {
    expect(prList({ author: 'octocat', limit: 1000 }).parse(rows(1000))?.truncated).toBe(true)
  })

  test('issueList with a label goes through search; without one it does not', () => {
    expect(issueList({ label: 'bug', limit: 1000 }).parse(rows(1000))?.truncated).toBe(true)
    expect(issueList({ limit: 1000 }).parse(rows(1000))?.truncated).toBe(false)
  })

  test('searchPrs asks gh for at most 1000, and 1000 hits is truncated', () => {
    const verb = searchPrs('is:open', { limit: 5000 })
    expect(verb.argv[verb.argv.indexOf('--limit') + 1]).toBe('1000')
    expect(verb.parse(hits(1000))?.truncated).toBe(true)
    expect(verb.parse(hits(999))?.truncated).toBe(false)
    const small = searchPrs('is:open', { limit: 30 })
    expect(small.argv[small.argv.indexOf('--limit') + 1]).toBe('31')
  })
})
