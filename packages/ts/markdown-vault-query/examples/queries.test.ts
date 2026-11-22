import { createVaultIndex } from '@osdlc/markdown-vault'
import { expect, test } from 'vitest'

import {
  evaluatePropertyId,
  matchesFilter,
  parseBase,
  queryBase,
  queryExpression,
  queryVault,
  runView,
  toDisplayString,
  type FilterQueryOptions,
  type FilterQueryResult,
  type QueryOptions,
  type ViewGroup,
  type ViewResult,
  type ViewRow,
} from '@osdlc/markdown-vault-query'

const vault = createVaultIndex([
  { path: 'tasks/a.md', frontmatter: { status: 'open', points: 3 }, tags: ['work'] },
  { path: 'tasks/b.md', frontmatter: { status: 'open', points: 5 }, tags: ['work'] },
  { path: 'tasks/c.md', frontmatter: { status: 'done', points: 8 }, tags: ['home'] },
  { path: 'notes/d.md', frontmatter: { status: 'open', points: 1 } },
])

const BASE = parseBase(`
filters: file.inFolder("tasks")
formulas:
  double: points * 2
views:
  - type: table
    name: By status
    order: [file.name, points, formula.double]
    sort:
      - property: points
        direction: DESC
    groupBy: status
    summaries:
      points: Sum
`)

test('runView applies the filters, columns, sort, groups and summaries of one view', () => {
  const result: ViewResult = runView(vault, BASE, 'By status')
  const row: ViewRow = result.rows[0]!
  const groups: ViewGroup[] = result.groups!

  expect(result.total).toBe(3)
  expect(row.note.file.name).toBe('c.md')
  expect(row.columns['formula.double']).toBe(16)
  expect(groups.map((group) => [group.keyDisplay, group.rows.length])).toEqual([
    ['done', 1],
    ['open', 2],
  ])
  expect(result.summaries['points']).toBe(16)
  expect(groups[1]!.summaries['points']).toBe(8)
})

test('queryBase applies the global filters of a base and no view', () => {
  expect(queryBase(vault, BASE).map((note) => note.file.name)).toEqual(['a.md', 'b.md', 'c.md'])
})

test('queryExpression returns the notes an expression matches, in vault order', () => {
  const options: QueryOptions = { now: new Date('2026-01-01T00:00:00Z') }

  expect(queryExpression(vault, 'points > 2 && status == "open"', options).length).toBe(2)
  expect(queryExpression(vault, 'file.hasTag("home")').map((n) => n.file.name)).toEqual(['c.md'])
})

test('queryVault filters, sorts and pages, and returns the total', () => {
  const options: FilterQueryOptions = {
    filter: 'status == "open"',
    sort: [{ property: 'points', direction: 'DESC' }],
    limit: 2,
    offset: 1,
  }
  const result: FilterQueryResult = queryVault(vault, options)

  expect(result.total).toBe(3)
  expect(result.notes.map((note) => note.file.name)).toEqual(['a.md', 'd.md'])
})

test('matchesFilter tests one note against a parsed filter tree', () => {
  const filter = BASE.filters
  const note = vault.byPath.get('notes/d.md')!
  const ctx = { note, vault, formulas: BASE.formulas }

  expect(matchesFilter(filter, ctx)).toBe(false)
  expect(matchesFilter(null, ctx)).toBe(true)
})

test('evaluatePropertyId reads file, note and formula properties', () => {
  const note = vault.byPath.get('tasks/a.md')!
  const ctx = { note, vault, formulas: BASE.formulas }

  expect(toDisplayString(evaluatePropertyId('file.name', ctx))).toBe('a.md')
  expect(evaluatePropertyId('points', ctx)).toBe(3)
  expect(evaluatePropertyId('formula.double', ctx)).toBe(6)
})
