import { describe, expect, test } from 'vitest'

import {
  countByLevel,
  filterFindings,
  findingLocation,
  formatFinding,
  hasErrors,
} from '../../src/core/finding-view.js'
import type { Finding } from '../../src/core/types.js'

// finding-view.ts renders and selects over `Finding[]`. Each case is a finding in, string/set out.

const pinned: Finding = {
  id: 'frontmatter/required',
  level: 'error',
  path: 'task.md',
  message: 'missing key',
  pos: { line: 4 },
}
const unpinned: Finding = {
  id: 'structure/section-missing',
  level: 'error',
  path: 'task.md',
  message: 'no Goal section',
}

describe('findingLocation — the location token', () => {
  test('position-pinned → `line <n>`', () => {
    expect(findingLocation(pinned)).toBe('line 4')
  })

  test('unpinned → the root fallback (default `<root>`, overridable)', () => {
    expect(findingLocation(unpinned)).toBe('<root>')
    expect(findingLocation(unpinned, { root: '<task>' })).toBe('<task>')
  })

  test('withPath → `<path>:<line>` (just `<path>` when unpinned)', () => {
    expect(findingLocation(pinned, { withPath: true })).toBe('task.md:4')
    expect(findingLocation(unpinned, { withPath: true })).toBe('task.md')
  })
})

describe('formatFinding — one-line rendering', () => {
  test('full (default) always carries a location token', () => {
    expect(formatFinding(pinned)).toBe('[frontmatter/required] (line 4): missing key')
    expect(formatFinding(unpinned)).toBe('[structure/section-missing] (<root>): no Goal section')
  })

  test('style "line" omits the parenthetical when unpinned (reproduces validate.ts)', () => {
    expect(formatFinding(pinned, { style: 'line' })).toBe(
      '[frontmatter/required] (line 4): missing key',
    )
    expect(formatFinding(unpinned, { style: 'line' })).toBe(
      '[structure/section-missing]: no Goal section',
    )
    // validate.ts's exact per-error line is the "line" style with a two-space indent:
    expect('  ' + formatFinding(pinned, { style: 'line' })).toBe(
      '  [frontmatter/required] (line 4): missing key',
    )
  })
})

describe('filterFindings — select by area / ids', () => {
  const findings: Finding[] = [
    { id: 'frontmatter/required', level: 'error', path: '', message: 'a' },
    { id: 'frontmatter', level: 'error', path: '', message: 'b' },
    { id: 'structure/x', level: 'warn', path: '', message: 'c' },
    { id: 'content/table/cell', level: 'error', path: '', message: 'd' },
  ]

  test('area keeps the exact id and its `area/*` children', () => {
    expect(filterFindings(findings, { area: 'frontmatter' }).map((f) => f.id)).toEqual([
      'frontmatter/required',
      'frontmatter',
    ])
  })

  test('ids keeps membership', () => {
    expect(
      filterFindings(findings, { ids: ['structure/x', 'content/table/cell'] }).map((f) => f.id),
    ).toEqual(['structure/x', 'content/table/cell'])
  })

  test('both selectors intersect', () => {
    expect(
      filterFindings(findings, { area: 'frontmatter', ids: ['frontmatter'] }).map((f) => f.id),
    ).toEqual(['frontmatter'])
  })
})

describe('level summaries', () => {
  const findings: Finding[] = [
    { id: 'a', level: 'error', path: '', message: '' },
    { id: 'b', level: 'warn', path: '', message: '' },
    { id: 'c', level: 'warn', path: '', message: '' },
    { id: 'd', level: 'report', path: '', message: '' },
  ]

  test('hasErrors is true iff any finding is error-level', () => {
    expect(hasErrors(findings)).toBe(true)
    expect(hasErrors([{ id: 'x', level: 'warn', path: '', message: '' }])).toBe(false)
    expect(hasErrors([])).toBe(false)
  })

  test('countByLevel tallies each level', () => {
    expect(countByLevel(findings)).toEqual({ error: 1, warn: 2, report: 1 })
  })
})
