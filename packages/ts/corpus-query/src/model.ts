/**
 * Lookups over a `LoadedCorpus`: corpora by key, types and records by name, and the string that
 * names one record. Only types are imported from `@osdlc/corpus-schema`, so nothing here loads a
 * `node:` module.
 */
import type {
  CorpusModel,
  CorpusRecord,
  CorpusType,
  LoadedCorpus,
  RecordTarget,
} from '@osdlc/corpus-schema'

/**
 * What a query can get wrong. `code` is stable; `message` is one line that says what exists.
 *
 * @experimental
 */
export type QueryErrorCode =
  | 'bad-filter'
  | 'bad-query'
  | 'unknown-corpus'
  | 'unknown-type'
  | 'unknown-field'
  | 'bad-value'
  | 'not-found'
  | 'ambiguous'

/**
 * Every error the query functions throw for a query or a record name they cannot answer.
 * `not-found` and `ambiguous` are about the corpus; every other code is about the query.
 *
 * @experimental
 */
export class QueryError extends Error {
  readonly code: QueryErrorCode
  constructor(code: QueryErrorCode, message: string) {
    super(message)
    this.name = 'QueryError'
    this.code = code
  }
}

/**
 * A record by name: `<type>/<id>`, `<corpus key>/<type>/<id>` for a record of a referenced
 * corpus, the record's path in the loaded corpus, or a bare `<id>` when one type has it. An
 * object with `type` and `id`, such as a `RecordTarget`, names one too.
 *
 * @experimental
 */
export type RecordRef = string | { corpus?: string; type: string; id: string; path?: string }

/**
 * What every result says about a record: where it is, and `ref`, the string that names it to
 * every function, command, route and tool here.
 *
 * @experimental
 */
export interface RecordHeader extends RecordTarget {
  /** `<type>/<id>`, with the corpus key in front for a record of a referenced corpus. */
  ref: string
  /** The record's `title` field, else its file name. */
  title: string
}

/** The key ids and type names are compared by, as `@osdlc/corpus-schema`'s `fold`. */
export const fold = (s: string): string =>
  s.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC')

export const less = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

interface Index {
  corpora: Map<string, CorpusModel>
  types: Map<string, CorpusType>
  byType: Map<string, CorpusRecord[]>
  byId: Map<string, CorpusRecord>
  byPath: Map<string, CorpusRecord>
  keyOf: Map<CorpusRecord, string>
  /** The top-level data keys the records of a type hold, by `<key>\0<type>`. */
  seen: Map<string, Set<string>>
}

const INDEXES = new WeakMap<LoadedCorpus, Index>()

export function indexOf(model: LoadedCorpus): Index {
  const cached = INDEXES.get(model)
  if (cached !== undefined) return cached
  const index: Index = {
    corpora: new Map<string, CorpusModel>([['', model]]),
    types: new Map(),
    byType: new Map(),
    byId: new Map(),
    byPath: new Map(),
    keyOf: new Map(),
    seen: new Map(),
  }
  for (const [key, m] of Object.entries(model.corpora)) index.corpora.set(key, m)
  for (const [key, m] of index.corpora) {
    for (const t of m.types) {
      index.types.set(`${key}\0${fold(t.name)}`, t)
      index.byType.set(`${key}\0${t.name}`, [])
    }
    for (const r of m.records) {
      index.keyOf.set(r, key)
      const list = index.byType.get(`${key}\0${r.type}`)
      if (list === undefined) index.byType.set(`${key}\0${r.type}`, [r])
      else list.push(r)
      index.byPath.set(`${key}\0${r.path}`, r)
      // The record the validator finds by this id: the first file by path.
      const id = `${key}\0${r.type}\0${fold(r.id)}`
      const other = index.byId.get(id)
      if (other === undefined || r.path < other.path) index.byId.set(id, r)
    }
  }
  INDEXES.set(model, index)
  return index
}

const named = (m: CorpusModel): string => (m.key === '' ? m.name : `${m.name} (${m.key})`)
const list = (names: readonly string[]): string => (names.length === 0 ? 'none' : names.join(', '))

/**
 * The corpus a key or a chain of prefixes names: `''` for the loaded corpus, a key of
 * `model.corpora`, or prefixes followed through `extends` and `references`, such as `b/c`.
 */
export function corpusOf(
  model: LoadedCorpus,
  name: string,
  from: CorpusModel = model,
): CorpusModel {
  const { corpora } = indexOf(model)
  const direct = from === model ? corpora.get(name) : undefined
  if (direct !== undefined) return direct
  let at: CorpusModel | undefined = from
  for (const prefix of name.split('/')) {
    const key: string | undefined = at.references[prefix] ?? at.extends[prefix]
    at = key === undefined ? undefined : corpora.get(key)
    if (at === undefined) break
  }
  if (at !== undefined) return at
  const keys = [...corpora.keys()].filter((k) => k !== '')
  throw new QueryError(
    'unknown-corpus',
    `no corpus '${name}' in the graph of '${model.name}'; corpus keys: ${list(keys)}`,
  )
}

/** The corpora a query's `corpus` names: one, or every corpus of the graph for `*`. */
export function corporaOf(model: LoadedCorpus, corpus: string | undefined): CorpusModel[] {
  if (corpus === '*') return [...indexOf(model).corpora.values()]
  return [corpusOf(model, corpus ?? '')]
}

/**
 * The type `name` names: a type of `corpus`, or `<prefix>/<type>` for a type of a corpus that
 * `corpus` extends or references.
 */
export function typeOf(
  model: LoadedCorpus,
  name: string,
  corpus: CorpusModel = model,
): { corpus: CorpusModel; type: CorpusType } {
  const { types } = indexOf(model)
  const cut = name.lastIndexOf('/')
  const home = cut === -1 ? corpus : corpusOf(model, name.slice(0, cut), corpus)
  const type = types.get(`${home.key}\0${fold(name.slice(cut + 1))}`)
  if (type === undefined)
    throw new QueryError(
      'unknown-type',
      `no type '${name.slice(cut + 1)}' in corpus '${named(home)}'; types: ${list(home.types.map((t) => t.name))}`,
    )
  return { corpus: home, type }
}

/** The records of one type of one corpus, by id. */
export const recordsOfType = (model: LoadedCorpus, key: string, type: string): CorpusRecord[] =>
  indexOf(model).byType.get(`${key}\0${type}`) ?? []

/** The key of the corpus that holds `record`. */
export const keyOfRecord = (model: LoadedCorpus, record: CorpusRecord): string =>
  indexOf(model).keyOf.get(record) ?? ''

/** The top-level data keys the records of a type hold. */
export function seenFields(model: LoadedCorpus, key: string, type: string): Set<string> {
  const { seen } = indexOf(model)
  const at = `${key}\0${type}`
  let found = seen.get(at)
  if (found === undefined) {
    found = new Set()
    for (const r of recordsOfType(model, key, type))
      for (const k of Object.keys(r.data)) found.add(k)
    seen.set(at, found)
  }
  return found
}

/** The string that names a record: `<type>/<id>`, with its corpus key in front when it has one. */
export const refOf = (target: { corpus: string; type: string; id: string }): string =>
  target.corpus === ''
    ? `${target.type}/${target.id}`
    : `${target.corpus}/${target.type}/${target.id}`

/** The header of a record of the corpus with `key`. */
export const headerOf = (key: string, record: CorpusRecord): RecordHeader => ({
  ref: refOf({ corpus: key, type: record.type, id: record.id }),
  corpus: key,
  type: record.type,
  id: record.id,
  path: record.path,
  title: record.title,
})

/** The header of the record a target names. The title is the id when the graph lacks the record. */
export function headerOfTarget(model: LoadedCorpus, target: RecordTarget): RecordHeader {
  const record = indexOf(model).byPath.get(`${target.corpus}\0${target.path}`)
  return {
    ref: refOf(target),
    corpus: target.corpus,
    type: target.type,
    id: target.id,
    path: target.path,
    title: record?.title ?? target.id,
  }
}

/** The record a target names, or undefined. */
export const recordOfTarget = (
  model: LoadedCorpus,
  target: RecordTarget,
): CorpusRecord | undefined => indexOf(model).byPath.get(`${target.corpus}\0${target.path}`)

/** Up to five ids of `records` that hold `id` or are held by it, for a "did you mean". */
function near(records: readonly CorpusRecord[], id: string): string[] {
  const want = fold(id)
  const out: string[] = []
  for (const r of records) {
    const have = fold(r.id)
    if (have.includes(want) || want.includes(have)) out.push(r.id)
    if (out.length === 5) break
  }
  return out
}

/**
 * The record `ref` names, with the key of its corpus.
 *
 * @throws QueryError `not-found` when no record has the name, `ambiguous` when a bare id is in
 *   more than one type, `unknown-type` or `unknown-corpus` when the name's type or corpus is not
 *   in the graph.
 */
export function resolveRef(
  model: LoadedCorpus,
  ref: RecordRef,
): { key: string; record: CorpusRecord } {
  const index = indexOf(model)
  if (typeof ref !== 'string') {
    const key = corpusOf(model, ref.corpus ?? '').key
    const byPath = ref.path === undefined ? undefined : index.byPath.get(`${key}\0${ref.path}`)
    if (byPath !== undefined) return { key, record: byPath }
    return resolveRef(model, refOf({ corpus: key, type: ref.type, id: ref.id }))
  }
  const byPath = index.byPath.get(`\0${ref}`)
  if (byPath !== undefined) return { key: '', record: byPath }
  const parts = ref.split('/')
  const id = parts.pop() ?? ''
  if (parts.length === 0) {
    const found = model.types
      .map((t) => index.byId.get(`\0${t.name}\0${fold(id)}`))
      .filter((r) => r !== undefined)
    if (found.length === 1) return { key: '', record: found[0] as CorpusRecord }
    if (found.length > 1)
      throw new QueryError(
        'ambiguous',
        `'${id}' is the id of ${found.length} records; name one: ${found.map((r) => `${r.type}/${r.id}`).join(', ')}`,
      )
    throw new QueryError(
      'not-found',
      `no record with id '${id}' in corpus '${model.name}'${didYouMean(near(model.records, id))}; name a record as <type>/<id>`,
    )
  }
  const { corpus, type } = typeOf(model, parts.join('/'))
  const record = index.byId.get(`${corpus.key}\0${type.name}\0${fold(id)}`)
  if (record === undefined)
    throw new QueryError(
      'not-found',
      `no record '${id}' of type '${type.name}' in corpus '${named(corpus)}'${didYouMean(near(recordsOfType(model, corpus.key, type.name), id))}`,
    )
  return { key: corpus.key, record }
}

const didYouMean = (ids: readonly string[]): string =>
  ids.length === 0 ? '' : `; did you mean: ${ids.join(', ')}`
