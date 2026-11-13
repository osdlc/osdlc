/**
 * A type index's state in the query string, so a filtered view can be linked.
 *
 *   ?q=hooks&status=current&status=disputed&observed=2026-01-01..2026-06-30&sort=-observed&page=2
 *
 * `q` is the search box, `sort` a field name with `-` for descending and `page` the page. Every
 * other key is a field: repeated for the values of a select or chips, `min..max` for a range
 * (either side may be empty), `true` or `false` for a toggle, and the text for a text filter. A
 * field named `q`, `sort` or `page` is written `f.q`, `f.sort` or `f.page`.
 *
 * A type may start with filters (`defaults`). The address leaves a filter out while it is the
 * default, and writes the field with no value, `status=`, when a reader has removed it.
 */
import type { DataField } from './data-types.ts'
import {
  emptyState,
  filterKind,
  isEmptyFilter,
  type FilterState,
  type FilterValue,
  type SortState,
} from './filter.ts'

const RESERVED = ['q', 'sort', 'page']
const keyOf = (field: string): string =>
  RESERVED.includes(field) || field.startsWith('f.') ? `f.${field}` : field

/** A sort as written in the query string and in a config: `field` or `-field`. */
export function parseSort(text: string | null | undefined): SortState | null {
  if (text === null || text === undefined || text === '' || text === '-') return null
  return text.startsWith('-')
    ? { field: text.slice(1), descending: true }
    : { field: text, descending: false }
}

export const formatSort = (sort: SortState): string => `${sort.descending ? '-' : ''}${sort.field}`

/**
 * The state a query string holds. Keys that name no filter field, and values a field's control
 * cannot hold, are ignored, so an old link still opens.
 */
export function parseState(
  search: string | URLSearchParams,
  fields: DataField[],
  defaultSort: SortState | null = null,
  defaults: Record<string, string[]> = {},
): FilterState {
  const given = typeof search === 'string' ? new URLSearchParams(search) : search
  // A default filter applies until the address names its field.
  const params = new URLSearchParams(given)
  for (const [name, values] of Object.entries(defaults))
    if (!given.has(keyOf(name))) for (const value of values) params.append(keyOf(name), value)
  const state = emptyState()
  state.query = params.get('q') ?? ''
  const sort = parseSort(params.get('sort'))
  const sortable = (name: string): boolean =>
    name === 'title' || fields.some((f) => f.name === name)
  state.sort = sort !== null && sortable(sort.field) ? sort : defaultSort
  const page = Number(params.get('page'))
  state.page = Number.isInteger(page) && page > 0 ? page : 1
  for (const field of fields) {
    if (!field.filter) continue
    const values = params.getAll(keyOf(field.name)).filter((v) => v !== '')
    const first = values[0]
    if (first === undefined) continue
    let filter: FilterValue | null = null
    switch (filterKind(field.control)) {
      case 'set':
        filter = { kind: 'set', values: [...new Set(values)] }
        break
      case 'range': {
        const at = first.indexOf('..')
        if (at === -1) filter = { kind: 'range', min: first, max: first }
        else
          filter = {
            kind: 'range',
            min: first.slice(0, at) || null,
            max: first.slice(at + 2) || null,
          }
        break
      }
      case 'toggle':
        if (first === 'true' || first === 'false')
          filter = { kind: 'toggle', value: first === 'true' }
        break
      case 'text':
        filter = { kind: 'text', value: first }
        break
      case null:
        break
    }
    if (filter !== null && !isEmptyFilter(filter)) state.filters[field.name] = filter
  }
  return state
}

/**
 * The query string for `state`, without the `?`, and `''` for the default view. The fields
 * come in `fields` order, so one view has one address. A sort equal to `defaultSort` is left out.
 */
export function formatState(
  state: FilterState,
  fields: DataField[],
  defaultSort: SortState | null = null,
  defaults: Record<string, string[]> = {},
): string {
  const params = new URLSearchParams()
  if (state.query.trim() !== '') params.set('q', state.query.trim())
  const initial = parseState('', fields, null, defaults).filters
  for (const field of fields) {
    const filter = state.filters[field.name]
    const key = keyOf(field.name)
    if (initial[field.name] !== undefined) {
      // The default is left out, and its removal is written as the field with no value.
      if (filter === undefined || isEmptyFilter(filter)) {
        params.set(key, '')
        continue
      }
      if (JSON.stringify(filter) === JSON.stringify(initial[field.name])) continue
    }
    if (filter === undefined || isEmptyFilter(filter)) continue
    if (filter.kind === 'set') for (const v of filter.values) params.append(key, v)
    else if (filter.kind === 'range') params.set(key, `${filter.min ?? ''}..${filter.max ?? ''}`)
    else if (filter.kind === 'toggle') params.set(key, String(filter.value))
    else params.set(key, filter.value.trim())
  }
  if (
    state.sort !== null &&
    (defaultSort === null || formatSort(state.sort) !== formatSort(defaultSort))
  )
    params.set('sort', formatSort(state.sort))
  if (state.page > 1) params.set('page', String(state.page))
  return params.toString()
}
