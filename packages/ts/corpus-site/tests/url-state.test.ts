import { describe, expect, test } from 'vitest'
import { emptyState, type FilterState } from '../src/filter.ts'
import { formatSort, formatState, parseSort, parseState } from '../src/url-state.ts'
import { tasks } from './fixtures.ts'

const { fields } = tasks()

describe('the query string', () => {
  const state: FilterState = {
    query: 'the table',
    page: 2,
    sort: { field: 'due', descending: true },
    filters: {
      status: { kind: 'set', values: ['todo', 'done'] },
      owner: { kind: 'set', values: ['people/ada'] },
      points: { kind: 'range', min: '2', max: null },
      due: { kind: 'range', min: '2026-01-01', max: '2026-06-30' },
      urgent: { kind: 'toggle', value: false },
      note: { kind: 'text', value: 'a&b' },
      q: { kind: 'text', value: 'odd' },
    },
  }
  const query =
    'q=the+table&status=todo&status=done&owner=people%2Fada&points=2..&due=2026-01-01..2026-06-30&urgent=false&note=a%26b&f.q=odd&sort=-due&page=2'

  test('formats in field order, with a reserved field name prefixed', () => {
    expect(formatState(state, fields)).toBe(query)
  })

  test('parses back to the same state', () => {
    expect(parseState(query, fields)).toEqual(state)
    expect(parseState(`?${query}`, fields)).toEqual(state)
  })

  test('the default view is the empty string', () => {
    expect(formatState(emptyState(), fields)).toBe('')
    expect(parseState('', fields)).toEqual(emptyState())
  })

  test('the default sort is left out and restored', () => {
    const byDue = { field: 'due', descending: true }
    expect(formatState({ ...emptyState(), sort: byDue }, fields, byDue)).toBe('')
    expect(parseState('', fields, byDue).sort).toEqual(byDue)
    expect(parseState('sort=title', fields, byDue).sort).toEqual({
      field: 'title',
      descending: false,
    })
  })

  test('ignores what it cannot use, so an old link still opens', () => {
    expect(parseState('colour=red&sort=colour&page=x&urgent=maybe&status=', fields)).toEqual(
      emptyState(),
    )
    expect(parseState('page=-2', fields).page).toBe(1)
  })

  test('a single value is a range of one, and a field with no filter is skipped', () => {
    expect(parseState('points=5', fields).filters['points']).toEqual({
      kind: 'range',
      min: '5',
      max: '5',
    })
    expect(parseState('points=..9', fields).filters['points']).toEqual({
      kind: 'range',
      min: null,
      max: '9',
    })
    const off = fields.map((f) => ({ ...f, filter: false }))
    expect(parseState('status=todo', off).filters).toEqual({})
  })
})

test('a sort is a field name, with - for descending', () => {
  expect(parseSort('-observed')).toEqual({ field: 'observed', descending: true })
  expect(parseSort('title')).toEqual({ field: 'title', descending: false })
  expect(parseSort('')).toBeNull()
  expect(parseSort(undefined)).toBeNull()
  expect(formatSort({ field: 'observed', descending: true })).toBe('-observed')
})
