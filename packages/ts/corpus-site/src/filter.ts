/**
 * Filtering, sorting and counting the records of a type's data file. It is the one place the
 * browser's query logic lives, with no import but types, so another query core can replace it.
 */
import type { ControlKind } from './config.ts'
import type { DataField, DataRecord, DataScalar, DataValue, TypeData } from './data-types.ts'

/** One field's filter. Which kind applies follows the field's control (`filterKind`). */
export type FilterValue =
  | { kind: 'set'; values: string[] }
  | { kind: 'range'; min: string | null; max: string | null }
  | { kind: 'toggle'; value: boolean }
  | { kind: 'text'; value: string }

/** A sort: a field name, or `title`. */
export interface SortState {
  field: string
  descending: boolean
}

/** What a reader asked a type index for. */
export interface FilterState {
  /** The search box: every word must appear in a record's title or values. */
  query: string
  filters: Record<string, FilterValue>
  sort: SortState | null
  /** The page, from 1. */
  page: number
}

export const emptyState = (): FilterState => ({ query: '', filters: {}, sort: null, page: 1 })

/** The kind of filter a control gives, or null for `hidden`. */
export function filterKind(control: ControlKind): FilterValue['kind'] | null {
  switch (control) {
    case 'select':
    case 'chips':
      return 'set'
    case 'range':
      return 'range'
    case 'toggle':
      return 'toggle'
    case 'search':
      return 'text'
    case 'hidden':
      return null
  }
}

/** Whether a filter value filters nothing, so it can be dropped from the state. */
export function isEmptyFilter(value: FilterValue): boolean {
  switch (value.kind) {
    case 'set':
      return value.values.length === 0
    case 'range':
      return value.min === null && value.max === null
    case 'toggle':
      return false
    case 'text':
      return value.value.trim() === ''
  }
}

const scalars = (value: DataValue | undefined): DataScalar[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]

/** A value as a reader sees it: an enum's label, a reference's title, else the value. */
export function displayText(value: DataScalar, field: DataField, data: TypeData | null): string {
  if (field.kind === 'reference') return data?.targets[String(value)]?.title ?? String(value)
  if (field.kind === 'enum')
    return field.options.find((o) => o.value === String(value))?.label ?? String(value)
  return String(value)
}

/** Whether `value` is in the range. A date compares by as many characters as the bound has. */
function inRange(value: DataScalar, min: string | null, max: string | null): boolean {
  if (typeof value === 'number') {
    return (min === null || value >= Number(min)) && (max === null || value <= Number(max))
  }
  const text = String(value)
  return (min === null || text >= min) && (max === null || text.slice(0, max.length) <= max)
}

function matchesFilter(
  record: DataRecord,
  field: DataField,
  filter: FilterValue,
  data: TypeData | null,
): boolean {
  const values = scalars(record.values[field.name])
  switch (filter.kind) {
    case 'set':
      return filter.values.length === 0 || values.some((v) => filter.values.includes(String(v)))
    case 'range':
      return values.some((v) => inRange(v, filter.min, filter.max))
    case 'toggle':
      return values.includes(true) === filter.value
    case 'text': {
      const needle = filter.value.trim().toLowerCase()
      return (
        needle === '' ||
        values.some((v) => displayText(v, field, data).toLowerCase().includes(needle))
      )
    }
  }
}

/** The lower-cased text the search box looks in: the title, the id and every value as shown. */
function searchText(record: DataRecord, fields: DataField[], data: TypeData | null): string {
  const parts = [record.title, record.id, record.summary ?? '']
  for (const field of fields)
    for (const value of scalars(record.values[field.name]))
      parts.push(displayText(value, field, data))
  return parts.join('\n').toLowerCase()
}

/** The words of a query, lower-cased. */
export const queryWords = (query: string): string[] =>
  query.toLowerCase().split(/\s+/).filter(Boolean)

/**
 * A predicate for `state` over the records of `data`, leaving out the filter of the field
 * `except` names. `facetCounts` uses that to count a field's values under the other filters.
 */
function matcher(
  data: TypeData,
  state: FilterState,
  except?: string,
): (record: DataRecord) => boolean {
  const active = Object.entries(state.filters)
    .filter(([name, filter]) => name !== except && !isEmptyFilter(filter))
    .map(([name, filter]) => ({ field: data.fields.find((f) => f.name === name), filter }))
    .filter((f): f is { field: DataField; filter: FilterValue } => f.field !== undefined)
  const words = queryWords(state.query)
  const texts = words.length > 0 ? textsOf(data) : null
  return (record) => {
    for (const { field, filter } of active)
      if (!matchesFilter(record, field, filter, data)) return false
    if (texts !== null) {
      const text = texts.get(record) as string
      for (const word of words) if (!text.includes(word)) return false
    }
    return true
  }
}

// The search text of each record, built once per data file.
const TEXTS = new WeakMap<TypeData, WeakMap<DataRecord, string>>()

function textsOf(data: TypeData): WeakMap<DataRecord, string> {
  let texts = TEXTS.get(data)
  if (texts === undefined) {
    texts = new WeakMap()
    for (const record of data.records) texts.set(record, searchText(record, data.fields, data))
    TEXTS.set(data, texts)
  }
  return texts
}

/** The key a record sorts by for `field`: a number, or text as shown. Null sorts last. */
function sortKey(
  record: DataRecord,
  field: DataField | 'title',
  data: TypeData,
): number | string | null {
  if (field === 'title') return record.title.toLowerCase()
  const first = scalars(record.values[field.name])[0]
  if (first === undefined) return null
  if (typeof first === 'number') return first
  if (typeof first === 'boolean') return first ? 1 : 0
  if (field.kind === 'enum') {
    // Schema order, which is often a scale, not the alphabet.
    const index = field.options.findIndex((o) => o.value === first)
    return index === -1 ? field.options.length : index
  }
  return displayText(first, field, data).toLowerCase()
}

/** The records of `data` that pass `state`, sorted by it. The order is stable. */
export function filterRecords(data: TypeData, state: FilterState): DataRecord[] {
  const out = data.records.filter(matcher(data, state))
  const sort = state.sort
  if (sort === null) return out
  const field = sort.field === 'title' ? 'title' : data.fields.find((f) => f.name === sort.field)
  if (field === undefined) return out
  const keys = new Map(out.map((r) => [r, sortKey(r, field, data)]))
  const sign = sort.descending ? -1 : 1
  return out.sort((a, b) => {
    const x = keys.get(a) as number | string | null
    const y = keys.get(b) as number | string | null
    if (x === y) return 0
    if (x === null) return 1
    if (y === null) return -1
    return (x < y ? -1 : 1) * sign
  })
}

/**
 * For each field with a `select` or `chips` control, how many records hold each value under
 * every filter but the field's own. A value no record holds is absent.
 */
export function facetCounts(
  data: TypeData,
  state: FilterState,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const field of data.fields) {
    if (!field.filter || filterKind(field.control) !== 'set') continue
    const counts: Record<string, number> = {}
    const matches = matcher(data, state, field.name)
    for (const record of data.records) {
      if (!matches(record)) continue
      for (const value of new Set(scalars(record.values[field.name]).map(String)))
        counts[value] = (counts[value] ?? 0) + 1
    }
    out[field.name] = counts
  }
  return out
}

/** The lowest and highest value of a field over all records, as text, or null with no values. */
export function fieldBounds(data: TypeData, name: string): { min: string; max: string } | null {
  let min: DataScalar | null = null
  let max: DataScalar | null = null
  for (const record of data.records)
    for (const value of scalars(record.values[name])) {
      if (min === null || value < min) min = value
      if (max === null || value > max) max = value
    }
  return min === null || max === null ? null : { min: String(min), max: String(max) }
}

/** One page of `records`, and how many pages there are. `page` is clamped to them. */
export function paginate<T>(
  records: T[],
  page: number,
  pageSize: number,
): { page: number; pages: number; start: number; rows: T[] } {
  const pages = Math.max(1, Math.ceil(records.length / pageSize))
  const at = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const start = (at - 1) * pageSize
  return { page: at, pages, start, rows: records.slice(start, start + pageSize) }
}

/** An active filter as a reader sees it, for a chip that removes it. */
export interface ActiveFilter {
  field: string
  label: string
  text: string
  /** The value a `set` chip stands for. Null for a filter that goes as a whole. */
  value: string | null
}

/** The active filters of `state`, one per chosen value, in field order. */
export function activeFilters(
  fields: DataField[],
  state: FilterState,
  data: TypeData | null,
): ActiveFilter[] {
  const out: ActiveFilter[] = []
  for (const field of fields) {
    const filter = state.filters[field.name]
    if (filter === undefined || isEmptyFilter(filter)) continue
    const one = (text: string, value: string | null = null): void => {
      out.push({ field: field.name, label: field.label, text, value })
    }
    if (filter.kind === 'set') for (const v of filter.values) one(displayText(v, field, data), v)
    else if (filter.kind === 'range')
      one(
        filter.min !== null && filter.max !== null
          ? `${filter.min} to ${filter.max}`
          : filter.min !== null
            ? `from ${filter.min}`
            : `up to ${filter.max as string}`,
      )
    else if (filter.kind === 'toggle') one(filter.value ? 'yes' : 'no')
    else one(`"${filter.value.trim()}"`)
  }
  return out
}

/** `state` without one active filter: one value of a set, or the whole filter. Back on page 1. */
export function removeFilter(state: FilterState, active: ActiveFilter): FilterState {
  const filters = { ...state.filters }
  const filter = filters[active.field]
  if (filter?.kind === 'set' && active.value !== null) {
    const values = filter.values.filter((v) => v !== active.value)
    if (values.length > 0) filters[active.field] = { kind: 'set', values }
    else delete filters[active.field]
  } else delete filters[active.field]
  return { ...state, filters, page: 1 }
}

/** `state` with the filter of `field` set, or removed when `value` is null or filters nothing. */
export function setFilter(
  state: FilterState,
  field: string,
  value: FilterValue | null,
): FilterState {
  const filters = { ...state.filters }
  if (value === null || isEmptyFilter(value)) delete filters[field]
  else filters[field] = value
  return { ...state, filters, page: 1 }
}

/** A value a `select` or `chips` control offers. */
export interface FilterOption {
  value: string
  label: string
  description: string | null
  color: string | null
}

/**
 * The values a `select` or `chips` control offers for `field`: an enum's values in schema
 * order, else the values the records of `data` hold, by label. Without data, an enum's values
 * and nothing for other kinds.
 */
export function filterOptions(field: DataField, data: TypeData | null): FilterOption[] {
  if (field.options.length > 0) return field.options
  if (data === null) return []
  const seen = new Map<string, FilterOption>()
  for (const record of data.records)
    for (const value of scalars(record.values[field.name])) {
      const key = String(value)
      if (!seen.has(key))
        seen.set(key, {
          value: key,
          label: displayText(value, field, data),
          description: null,
          color: null,
        })
    }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
}
