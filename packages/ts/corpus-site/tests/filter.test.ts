import { describe, expect, test } from 'vitest'
import {
  activeFilters,
  emptyState,
  facetCounts,
  fieldBounds,
  filterKind,
  filterOptions,
  filterRecords,
  isEmptyFilter,
  paginate,
  removeFilter,
  setFilter,
  type FilterState,
} from '../src/filter.ts'
import { ids, tasks } from './fixtures.ts'

const data = tasks()
const state = (over: Partial<FilterState>): FilterState => ({ ...emptyState(), ...over })
const run = (over: Partial<FilterState>): string[] => ids(filterRecords(data, state(over)))

describe('filterRecords', () => {
  test('no filter keeps every record in file order', () => {
    expect(run({})).toEqual(['T-1', 'T-2', 'T-3', 'T-4', 'T-5'])
  })

  test('a set keeps records with any of the values, in a list too', () => {
    expect(run({ filters: { status: { kind: 'set', values: ['todo', 'done'] } } })).toEqual([
      'T-1',
      'T-4',
      'T-5',
    ])
    expect(run({ filters: { tags: { kind: 'set', values: ['ui'] } } })).toEqual(['T-1', 'T-2'])
    expect(run({ filters: { owner: { kind: 'set', values: ['people/grace'] } } })).toEqual([
      'T-3',
      'T-4',
    ])
  })

  test('a range has two open ends, and a date bound covers a date and time', () => {
    expect(run({ filters: { points: { kind: 'range', min: '3', max: '5' } } })).toEqual([
      'T-1',
      'T-3',
    ])
    expect(run({ filters: { points: { kind: 'range', min: '5', max: null } } })).toEqual([
      'T-2',
      'T-3',
    ])
    expect(
      run({ filters: { due: { kind: 'range', min: '2026-02-01', max: '2026-02-20' } } }),
    ).toEqual(['T-2', 'T-3'])
    expect(run({ filters: { due: { kind: 'range', min: null, max: '2025-12-31' } } })).toEqual([
      'T-4',
    ])
  })

  test('a toggle off keeps records that are not true, missing ones too', () => {
    expect(run({ filters: { urgent: { kind: 'toggle', value: true } } })).toEqual(['T-1'])
    expect(run({ filters: { urgent: { kind: 'toggle', value: false } } })).toEqual([
      'T-2',
      'T-3',
      'T-4',
      'T-5',
    ])
  })

  test('a text filter matches what a reader sees, case ignored', () => {
    expect(run({ filters: { note: { kind: 'text', value: 'COLUMNS' } } })).toEqual(['T-1'])
    expect(run({ filters: { owner: { kind: 'text', value: 'hopper' } } })).toEqual(['T-3', 'T-4'])
  })

  test('filters combine, and the search box wants every word', () => {
    expect(
      run({
        query: 'the',
        filters: {
          status: { kind: 'set', values: ['doing'] },
          tags: { kind: 'set', values: ['ui'] },
        },
      }),
    ).toEqual(['T-2'])
    expect(run({ query: 'ada table' })).toEqual(['T-1'])
    expect(run({ query: 'To do' })).toEqual(['T-1', 'T-5'])
    expect(run({ query: 'search' })).toEqual(['T-3'])
    expect(run({ query: 'nothing here' })).toEqual([])
  })

  test('a filter on a field the data lacks is ignored', () => {
    expect(run({ filters: { colour: { kind: 'set', values: ['red'] } } })).toHaveLength(5)
  })

  test('sorts by title, number, date, reference title and enum order, with missing last', () => {
    expect(run({ sort: { field: 'title', descending: false } })).toEqual([
      'T-2',
      'T-1',
      'T-4',
      'T-5',
      'T-3',
    ])
    expect(run({ sort: { field: 'points', descending: true } })).toEqual([
      'T-2',
      'T-3',
      'T-1',
      'T-4',
      'T-5',
    ])
    expect(run({ sort: { field: 'due', descending: false } })).toEqual([
      'T-4',
      'T-1',
      'T-2',
      'T-3',
      'T-5',
    ])
    expect(run({ sort: { field: 'owner', descending: false } })).toEqual([
      'T-1',
      'T-2',
      'T-3',
      'T-4',
      'T-5',
    ])
    expect(run({ sort: { field: 'status', descending: true } })).toEqual([
      'T-4',
      'T-2',
      'T-3',
      'T-1',
      'T-5',
    ])
    expect(run({ sort: { field: 'nope', descending: true } })).toEqual([
      'T-1',
      'T-2',
      'T-3',
      'T-4',
      'T-5',
    ])
  })
})

test('facetCounts counts a field under the other filters, not its own', () => {
  const counts = facetCounts(
    data,
    state({ filters: { status: { kind: 'set', values: ['doing'] } } }),
  )
  expect(counts['status']).toEqual({ todo: 2, doing: 2, done: 1 })
  expect(counts['tags']).toEqual({ ui: 1, api: 2 })
  expect(counts['owner']).toEqual({ 'people/ada': 1, 'people/grace': 1 })
  expect(counts['points']).toBeUndefined()
})

test('filterOptions offers enum values in schema order, and the values held by label', () => {
  const [status, , owner] = data.fields
  expect(filterOptions(status!, null).map((o) => o.value)).toEqual(['todo', 'doing', 'done'])
  expect(filterOptions(owner!, null)).toEqual([])
  expect(filterOptions(owner!, data).map((o) => o.label)).toEqual(['Ada Lovelace', 'Grace Hopper'])
})

test('fieldBounds gives the lowest and highest value', () => {
  expect(fieldBounds(data, 'points')).toEqual({ min: '1', max: '8' })
  expect(fieldBounds(data, 'due')).toEqual({ min: '2025-12-24', max: '2026-02-20T09:00:00Z' })
  expect(fieldBounds(data, 'nope')).toBeNull()
})

test('paginate clamps the page', () => {
  const rows = [1, 2, 3, 4, 5]
  expect(paginate(rows, 2, 2)).toEqual({ page: 2, pages: 3, start: 2, rows: [3, 4] })
  expect(paginate(rows, 9, 2)).toEqual({ page: 3, pages: 3, start: 4, rows: [5] })
  expect(paginate(rows, 0, 2).page).toBe(1)
  expect(paginate([], 1, 2)).toEqual({ page: 1, pages: 1, start: 0, rows: [] })
})

describe('the active filters', () => {
  const filtered = state({
    page: 3,
    filters: {
      status: { kind: 'set', values: ['todo', 'done'] },
      owner: { kind: 'set', values: ['people/ada'] },
      points: { kind: 'range', min: '2', max: null },
      urgent: { kind: 'toggle', value: false },
      note: { kind: 'text', value: ' first ' },
    },
  })

  test('one chip per value, as a reader sees it', () => {
    expect(activeFilters(data.fields, filtered, data).map((f) => `${f.label}: ${f.text}`)).toEqual([
      'Status: To do',
      'Status: Done',
      'Owner: Ada Lovelace',
      'Points: from 2',
      'Urgent: no',
      'Note: "first"',
    ])
  })

  test('removing one value keeps the rest of the set and goes back to page 1', () => {
    const [todo, , owner] = activeFilters(data.fields, filtered, data)
    const next = removeFilter(filtered, todo!)
    expect(next.filters['status']).toEqual({ kind: 'set', values: ['done'] })
    expect(next.page).toBe(1)
    expect(removeFilter(next, owner!).filters['owner']).toBeUndefined()
  })

  test('setFilter drops a filter that filters nothing', () => {
    expect(
      setFilter(filtered, 'status', { kind: 'set', values: [] }).filters['status'],
    ).toBeUndefined()
    expect(setFilter(filtered, 'note', null).filters['note']).toBeUndefined()
    expect(isEmptyFilter({ kind: 'range', min: null, max: null })).toBe(true)
    expect(isEmptyFilter({ kind: 'toggle', value: false })).toBe(false)
  })
})

test('filterKind maps a control to its filter', () => {
  expect(
    ['select', 'chips', 'range', 'toggle', 'search', 'hidden'].map((c) => filterKind(c as never)),
  ).toEqual(['set', 'set', 'range', 'toggle', 'text', null])
})
