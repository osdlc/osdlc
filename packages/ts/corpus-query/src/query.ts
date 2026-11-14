/** Queries: filter, search, sort, page and project the records of a loaded corpus, and count values. */
import type { CorpusModel, CorpusRecord, CorpusType, LoadedCorpus } from '@osdlc/corpus-schema'

import { isNumeric, valuesOf } from './describe.ts'
import { type Filter, filtersOf } from './filter.ts'
import {
  corporaOf,
  fold,
  headerOf,
  less,
  QueryError,
  stringList,
  type RecordHeader,
  recordsOfType,
  refOf,
  seenFields,
  typeOf,
} from './model.ts'
import { score, searchTerms, snippet } from './search.ts'

/**
 * A query, as plain JSON. Every key is optional: `{}` is the first 50 records of the loaded
 * corpus.
 *
 * @experimental
 */
export interface Query {
  /**
   * The type or types to read. `<prefix>/<type>` names a type of a corpus the loaded one extends
   * or references, such as `org/principles`. Absent: every type.
   */
  type?: string | string[]
  /** The key of the corpus to read: absent or `''` for the loaded one, `*` for every corpus of the graph. */
  corpus?: string
  /** Conditions that must all hold: filters, terms of the string form, or one string of terms. */
  where?: string | (string | Filter)[]
  /** Words every match must hold, in its title, id, string fields or body. Quote a phrase. */
  search?: string
  /** Fields to sort by, first one first; `-` in front for descending. A string may join them with commas. */
  sort?: string | string[]
  /** How many records to return. Default 50. 0 returns none, with `total`. */
  limit?: number
  /** How many matches to skip. Default 0. */
  offset?: number
  /** The data fields to return with each record: names, paths, or `*` for all. Default none. */
  fields?: string | string[]
  /** Whether to return each record's Markdown body. Default false. */
  body?: boolean
}

/**
 * One record of a result: its header, and what the query asked for.
 *
 * @experimental
 */
export interface RecordHit extends RecordHeader {
  /** The record's identity, a package URL, or null when its corpus is in no package. */
  identity: string | null
  /** The fields the query's `fields` names. Absent when it names none. */
  data?: Record<string, unknown>
  /** The Markdown body, with `body: true`. Null for a `.yaml` or `.json` record. */
  body?: string | null
  /** With `search`: how well the record matches. Higher is better. */
  score?: number
  /** With `search`: the text around the first match in the body, else in a field. */
  snippet?: string
}

/**
 * What `findRecords` returns.
 *
 * @experimental
 */
export interface QueryResult {
  /** How many records match, before `offset` and `limit`. */
  total: number
  /** The `offset` the query asked for. */
  offset: number
  /** The `limit` in force. */
  limit: number
  /** The `offset` of the next page, or null when this is the last one. */
  next: number | null
  /** The page of records. */
  records: RecordHit[]
}

/**
 * What to count: a query's `type`, `corpus`, `where` and `search`, and the fields to count the
 * values of.
 *
 * @experimental
 */
export interface FacetQuery extends Pick<Query, 'type' | 'corpus' | 'where' | 'search'> {
  /** The fields to count: names or paths. A string may join them with commas. */
  fields: string | string[]
  /** How many values to return for each field, the most frequent first. Default 20. */
  top?: number
}

/**
 * The values of one field over the matching records.
 *
 * @experimental
 */
export interface Facet {
  /** The field, as the query names it. */
  field: string
  /** How many different values the field has. */
  distinct: number
  /** How many matching records have no value for the field. */
  missing: number
  /** The values, most frequent first, then by value. A reference counts as its target's `ref`. */
  values: { value: unknown; count: number }[]
}

/**
 * What `countFacets` returns.
 *
 * @experimental
 */
export interface FacetResult {
  /** How many records match. */
  total: number
  /** One entry for each field asked for, in that order. */
  facets: Facet[]
}

const FACTS = [
  'id',
  'type',
  'title',
  'path',
  'corpus',
  'ref',
  'name',
  'format',
  'valid',
  'identity',
  'body',
] as const
type Fact = (typeof FACTS)[number]

type Selector =
  { fact: Fact; name: string } | { fact?: undefined; name: string; top: string; path: string[] }

interface Scope {
  corpus: CorpusModel
  type: CorpusType
}

interface Match {
  key: string
  record: CorpusRecord
  score: number
}

const strings = (key: string, v: unknown): string[] =>
  (stringList(key, v) ?? [])
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter((s) => s !== '')

function scopeOf(model: LoadedCorpus, query: Pick<Query, 'type' | 'corpus'>): Scope[] {
  const corpora = corporaOf(model, query.corpus)
  const names = stringList('type', query.type) ?? []
  if (names.length === 0)
    return corpora.flatMap((corpus) => corpus.types.map((type) => ({ corpus, type })))
  const out = new Map<string, Scope>()
  for (const name of names) {
    let found: Scope[] = []
    let failure: unknown
    for (const corpus of corpora)
      try {
        found.push(typeOf(model, name, corpus))
      } catch (e) {
        failure ??= e
      }
    // With `*`, a type is read in each corpus that has it, and must be in one.
    if (found.length === 0 || (query.corpus !== '*' && failure !== undefined)) throw failure
    for (const s of found) out.set(`${s.corpus.key}\0${s.type.name}`, s)
    found = []
  }
  return [...out.values()].sort(
    (a, b) => less(a.corpus.key, b.corpus.key) || less(a.type.name, b.type.name),
  )
}

function selectorOf(model: LoadedCorpus, scope: readonly Scope[], name: string): Selector {
  if (name.startsWith('@')) {
    const fact = FACTS.find((f) => f === name.slice(1))
    if (fact === undefined)
      throw new QueryError(
        'unknown-field',
        `no record fact '${name}'; facts: ${FACTS.map((f) => `@${f}`).join(', ')}`,
      )
    return { fact, name }
  }
  const has = (field: string): boolean =>
    scope.some(
      (s) =>
        s.type.fields.some((f) => f.name === field) ||
        seenFields(model, s.corpus.key, s.type.name).has(field),
    )
  if (has(name)) return { name, top: name, path: [] }
  const [top = '', ...path] = name.split('.')
  if (has(top)) return { name, top, path }
  const fact = FACTS.find((f) => f === name)
  if (fact !== undefined) return { fact, name }
  const fields = new Set<string>()
  for (const s of scope) {
    for (const f of s.type.fields) fields.add(f.name)
    for (const f of seenFields(model, s.corpus.key, s.type.name)) fields.add(f)
  }
  const types = scope.map((s) => s.type.name)
  throw new QueryError(
    'unknown-field',
    `no field '${top}' in ${types.length === 1 ? `type '${types[0]}'` : `types ${[...new Set(types)].join(', ')}`}; fields: ${[...fields].join(', ') || 'none'}`,
  )
}

/** The value at `path` below `value`. A list on the way gives the values of each of its items. */
function at(value: unknown, path: readonly string[], i: number): unknown {
  if (i === path.length || value === null || value === undefined) return value
  const step = path[i] as string
  if (Array.isArray(value)) {
    if (/^\d+$/.test(step)) return at(value[Number(step)], path, i + 1)
    return value.flatMap((v) => {
      const found = at(v, path, i)
      return found === undefined ? [] : Array.isArray(found) ? found : [found]
    })
  }
  if (typeof value !== 'object') return undefined
  return Object.hasOwn(value, step)
    ? at((value as Record<string, unknown>)[step], path, i + 1)
    : undefined
}

function valueOf(sel: Selector, m: Match): unknown {
  if (sel.fact === undefined) return at(m.record.data[sel.top], sel.path, 0)
  if (sel.fact === 'corpus') return m.key
  if (sel.fact === 'ref') return refOf({ corpus: m.key, type: m.record.type, id: m.record.id })
  return m.record[sel.fact]
}

const flat = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/** Whether a record's value `have` is the value a query asks for. A string from the string form stands for a number, a boolean or null. */
function same(have: unknown, want: unknown): boolean {
  if (have === want) return true
  if (have === null) return want === 'null'
  if (typeof want === 'string') {
    if (typeof have === 'number') return want.trim() !== '' && Number(want) === have
    if (typeof have === 'boolean') return want === String(have)
    return false
  }
  if (typeof have === 'string')
    return (typeof want === 'number' || typeof want === 'boolean') && String(want) === have
  if (typeof have === 'object' && typeof want === 'object' && want !== null)
    return JSON.stringify(have) === JSON.stringify(want)
  return false
}

/** Whether `want` names the record a reference points at: by id, `<type>/<id>`, `ref` or path. */
function names(
  want: unknown,
  target: { corpus: string; type: string; id: string; path: string },
): boolean {
  if (typeof want === 'object' && want !== null) {
    const w = want as { corpus?: unknown; type?: unknown; id?: unknown }
    return (
      typeof w.id === 'string' &&
      fold(w.id) === fold(target.id) &&
      (w.type === undefined || w.type === target.type) &&
      (w.corpus === undefined || w.corpus === target.corpus)
    )
  }
  if (typeof want !== 'string') return false
  const w = fold(want)
  return (
    w === fold(target.id) ||
    w === fold(`${target.type}/${target.id}`) ||
    w === fold(refOf(target)) ||
    want === target.path
  )
}

function leaves(value: unknown, out: unknown[]): unknown[] {
  if (Array.isArray(value)) for (const v of value) leaves(v, out)
  else if (typeof value === 'object' && value !== null)
    for (const v of Object.values(value)) leaves(v, out)
  else if (value !== undefined && value !== null) out.push(value)
  return out
}

function compare(have: unknown, want: unknown): number | undefined {
  if (typeof have === 'number') {
    const n = typeof want === 'number' ? want : typeof want === 'string' ? Number(want) : NaN
    return Number.isNaN(n) || want === '' ? undefined : have - n
  }
  if (typeof have === 'string' && (typeof want === 'string' || typeof want === 'number'))
    return less(have, String(want))
  return undefined
}

function holds(filter: Filter, sel: Selector, m: Match): boolean {
  const value = valueOf(sel, m)
  const is = (want: unknown): boolean =>
    flat(value).some((v) => same(v, want)) ||
    (value === undefined && want === null) ||
    (sel.fact === undefined &&
      sel.path.length === 0 &&
      m.record.references.some(
        (r) => r.field === sel.top && r.target !== null && names(want, r.target),
      ))
  switch (filter.op) {
    case 'eq':
      return is(filter.value)
    case 'ne':
      return !is(filter.value)
    case 'in':
      return (filter.value as unknown[]).some(is)
    case 'nin':
      return !(filter.value as unknown[]).some(is)
    case 'exists': {
      const there =
        value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)
      return there === (filter.value !== false)
    }
    case 'contains':
    case 'ncontains': {
      const want = String(filter.value).toLowerCase()
      const found = leaves(value, []).some((v) => String(v).toLowerCase().includes(want))
      return found === (filter.op === 'contains')
    }
    default: {
      const op = filter.op
      return flat(value).some((v) => {
        const c = compare(v, filter.value)
        if (c === undefined) return false
        return op === 'gt' ? c > 0 : op === 'gte' ? c >= 0 : op === 'lt' ? c < 0 : c <= 0
      })
    }
  }
}

/** Refuse a value the schema of every queried type rules out: a word for a number, a value outside an enum. */
function checkValue(scope: readonly Scope[], filter: Filter, sel: Selector): void {
  if (sel.fact !== undefined || sel.path.length > 0) return
  if (filter.op === 'exists' || filter.op === 'contains' || filter.op === 'ncontains') return
  const declared = scope.flatMap((s) => {
    const field = s.type.fields.find((f) => f.name === sel.top)
    return field === undefined ? [] : [{ type: s.type.name, field }]
  })
  const first = declared[0]
  if (first === undefined || declared.some((d) => d.field.ref !== null)) return
  const wanted = filter.op === 'in' || filter.op === 'nin' ? flat(filter.value) : [filter.value]
  if (declared.every((d) => isNumeric(d.field.schema))) {
    const word = wanted.find(
      (w) =>
        w !== null &&
        w !== 'null' &&
        typeof w !== 'number' &&
        !(typeof w === 'string' && compare(0, w) !== undefined),
    )
    if (word !== undefined)
      throw new QueryError(
        'bad-value',
        `'${String(word)}' is not a number; field '${sel.top}' of type '${first.type}' holds numbers`,
      )
  }
  if (filter.op !== 'eq' && filter.op !== 'in') return
  const allowed = declared.map((d) => valuesOf(d.field.schema))
  if (allowed.some((a) => a === null)) return
  const values = allowed.flatMap((a) => a ?? []).map((a) => a.value)
  const stray = wanted.find((w) => !values.some((v) => same(v, w)))
  if (stray !== undefined)
    throw new QueryError(
      'bad-value',
      `'${String(stray)}' is not a value of field '${sel.top}' in type '${first.type}'; values: ${[...new Set(values.map(String))].join(', ')}`,
    )
}

/** The records a query's `type`, `corpus`, `where` and `search` select, in the model's order. */
function select(
  model: LoadedCorpus,
  query: Pick<Query, 'type' | 'corpus' | 'where' | 'search'>,
): { scope: Scope[]; matches: Match[]; terms: string[] } {
  const scope = scopeOf(model, query)
  const filters = filtersOf(query.where).map((filter) => {
    const sel = selectorOf(model, scope, filter.field)
    checkValue(scope, filter, sel)
    return { filter, sel }
  })
  if (query.search !== undefined && typeof query.search !== 'string')
    throw new QueryError('bad-query', `search: expected a string, got ${typeof query.search}`)
  const terms = searchTerms(query.search ?? '')
  const matches: Match[] = []
  for (const s of scope)
    for (const record of recordsOfType(model, s.corpus.key, s.type.name)) {
      const m: Match = { key: s.corpus.key, record, score: 0 }
      if (!filters.every(({ filter, sel }) => holds(filter, sel, m))) continue
      if (terms.length > 0) {
        m.score = score(record, terms)
        if (m.score === 0) continue
      }
      matches.push(m)
    }
  return { scope, matches, terms }
}

const sortable = (v: unknown): string | number | undefined => {
  const first = flat(v).find((x) => x !== null && x !== undefined)
  if (first === undefined) return undefined
  return typeof first === 'number' || typeof first === 'string' ? first : JSON.stringify(first)
}

function order(a: string | number | undefined, b: string | number | undefined): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return less(String(a), String(b))
}

function count(name: string, value: unknown, otherwise: number): number {
  if (value === undefined) return otherwise
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new QueryError(
      'bad-query',
      `${name}: expected a whole number, 0 or more, got ${JSON.stringify(value)}`,
    )
  return value
}

const QUERY_KEYS = [
  'type',
  'corpus',
  'where',
  'search',
  'sort',
  'limit',
  'offset',
  'fields',
  'body',
]
const FACET_KEYS = ['type', 'corpus', 'where', 'search', 'fields', 'top']

function checkKeys(what: string, query: unknown, keys: readonly string[]): void {
  if (typeof query !== 'object' || query === null || Array.isArray(query))
    throw new QueryError('bad-query', `${what}: expected a JSON object`)
  const stray = Object.keys(query).find((k) => !keys.includes(k))
  if (stray !== undefined)
    throw new QueryError('bad-query', `no ${what} key '${stray}'; keys: ${keys.join(', ')}`)
}

/**
 * The records of a loaded corpus that a query selects: by type and corpus, by filters, by
 * full-text search; sorted, paged and cut down to the fields asked for.
 *
 * Without `sort`, a search is ordered by score, best first, and anything else by corpus key,
 * type, id and path. Those four also break every tie, so the order is the same on every run.
 * A filter on a reference field compares the record it points at: `harness=Claude Code`,
 * `harness=harnesses/Claude Code`. A filter on a list field holds when one item does.
 *
 * @throws QueryError `unknown-type`, `unknown-corpus` and `unknown-field` with the names that
 *   exist; `bad-value` for a value the field's schema rules out; `bad-filter` for a term that
 *   does not parse; `bad-query` for a key or a value of the wrong shape.
 * @experimental
 */
export function findRecords(model: LoadedCorpus, query: Query = {}): QueryResult {
  checkKeys('query', query, QUERY_KEYS)
  const limit = count('limit', query.limit, 50)
  const offset = count('offset', query.offset, 0)
  const { scope, matches, terms } = select(model, query)

  const sorts = strings('sort', query.sort).map((spec) => {
    const desc = spec.startsWith('-')
    return { sel: selectorOf(model, scope, desc ? spec.slice(1) : spec), desc }
  })
  if (sorts.length > 0) {
    const keyed = matches.map((m, i) => ({
      m,
      i,
      keys: sorts.map((s) => sortable(valueOf(s.sel, m))),
    }))
    keyed.sort((a, b) => {
      for (const [n, s] of sorts.entries()) {
        const c = order(a.keys[n], b.keys[n])
        // A record with no value sorts last in both directions.
        if (c !== 0) return s.desc && a.keys[n] !== undefined && b.keys[n] !== undefined ? -c : c
      }
      return a.i - b.i
    })
    matches.splice(0, matches.length, ...keyed.map((k) => k.m))
  } else if (terms.length > 0) {
    const at = new Map(matches.map((m, i) => [m, i]))
    matches.sort((a, b) => b.score - a.score || (at.get(a) as number) - (at.get(b) as number))
  }

  const fields = strings('fields', query.fields)
  const all = fields.includes('*')
  const picked = fields.filter((f) => f !== '*').map((f) => selectorOf(model, scope, f))
  const records = matches.slice(offset, offset + limit).map((m): RecordHit => {
    const hit: RecordHit = { ...headerOf(m.key, m.record), identity: m.record.identity }
    if (fields.length > 0) {
      const data: Record<string, unknown> = all ? { ...m.record.data } : {}
      for (const sel of picked) {
        const value = valueOf(sel, m)
        if (value !== undefined) data[sel.name] = value
      }
      hit.data = data
    }
    if (query.body === true) hit.body = m.record.body
    if (terms.length > 0) {
      hit.score = m.score
      hit.snippet = snippet(m.record, terms)
    }
    return hit
  })
  const end = offset + records.length
  return { total: matches.length, offset, limit, next: end < matches.length ? end : null, records }
}

/**
 * How often each value of the fields occurs in the records a query selects: what a filter shows
 * as its choices. An item of a list counts once for its record. A reference counts as the `ref`
 * of the record it points at.
 *
 * @throws QueryError as `findRecords`, and `bad-query` when `fields` names none.
 * @experimental
 */
export function countFacets(model: LoadedCorpus, query: FacetQuery): FacetResult {
  checkKeys('facet query', query, FACET_KEYS)
  const top = count('top', query.top, 20)
  const fields = strings('fields', query.fields)
  if (fields.length === 0)
    throw new QueryError('bad-query', 'fields: name at least one field to count')
  const { scope, matches } = select(model, query)
  const facets = fields.map((field): Facet => {
    const sel = selectorOf(model, scope, field)
    const counts = new Map<string, { value: unknown; count: number }>()
    let missing = 0
    for (const m of matches) {
      const refs =
        sel.fact === undefined && sel.path.length === 0
          ? m.record.references.filter((r) => r.field === sel.top)
          : []
      const values =
        refs.length > 0
          ? refs.map((r) => (r.target === null ? r.value : refOf(r.target)))
          : flat(valueOf(sel, m)).filter((v) => v !== null)
      if (values.length === 0) missing++
      for (const [key, value] of new Map(values.map((v) => [JSON.stringify(v), v]))) {
        const seen = counts.get(key)
        if (seen === undefined) counts.set(key, { value, count: 1 })
        else seen.count++
      }
    }
    const values = [...counts.entries()]
      .sort(([a, x], [b, y]) => y.count - x.count || less(a, b))
      .map(([, v]) => v)
    return { field, distinct: values.length, missing, values: values.slice(0, top) }
  })
  return { total: matches.length, facets }
}
