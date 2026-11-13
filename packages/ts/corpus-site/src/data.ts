/**
 * The data files of a site: the JSON under `data/` that the pages fetch and that other code
 * may fetch too. See the README for the layout.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DATA_VERSION,
  type CorpusData,
  type DataField,
  type DataRecord,
  type DataScalar,
  type DataTarget,
  type DataValue,
  type RecordData,
  type RecordDataLink,
  type SearchData,
  type TypeData,
} from './data-types.ts'
import { plainText } from './markdown.ts'
import { valueAt, type Site, type SiteField, type SiteRecord, type SiteType } from './site.ts'

/** The longest text value a type's data file keeps whole. Longer text is cut with `…`. */
export const MAX_TEXT = 160

/** How much of a record's body the search index keeps, in characters. */
export const SEARCH_BODY_CHARS = 4000

const isScalar = (v: unknown): v is DataScalar =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

const cut = (text: string): string =>
  text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1).trimEnd()}…` : text

/** A field's value in a type's data file, and the targets its references name. */
function dataValue(
  site: Site,
  record: SiteRecord,
  field: SiteField,
  targets: Record<string, DataTarget>,
): DataValue {
  let values: DataScalar[]
  if (field.kind === 'reference') {
    values = []
    for (const { target } of site.referencesOf(record, field.name)) {
      if (target === null) continue
      targets[target.key] = { title: target.title, url: target.url }
      values.push(target.key)
    }
  } else {
    const value = valueAt(record.record.data, field.name)
    values = (Array.isArray(value) ? value : [value])
      .filter(isScalar)
      .filter((v) => (field.kind === 'boolean' ? typeof v === 'boolean' : true))
      .filter((v) => (field.kind === 'number' ? typeof v === 'number' : true))
      .map((v) => (typeof v === 'string' ? cut(v) : v))
      .filter((v) => v !== '')
  }
  if (values.length === 0) return null
  return field.list ? values : (values[0] as DataScalar)
}

const rank = (names: string[], name: string): number => {
  const at = names.indexOf(name)
  return at === -1 ? names.length : at
}

/** The fields of a type's data file: its columns and filters, with counts on enum values. */
function dataFields(type: SiteType, records: DataRecord[]): DataField[] {
  return type.fields
    .filter((f) => f.column || f.filter)
    .sort((a, b) => rank(type.filters, a.name) - rank(type.filters, b.name) || a.order - b.order)
    .map((f): DataField => {
      const counts = new Map<string, number>()
      if (f.options.length > 0)
        for (const record of records) {
          const value = record.values[f.name]
          for (const v of new Set(
            Array.isArray(value) ? value : value === null || value === undefined ? [] : [value],
          ))
            counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
        }
      return {
        name: f.name,
        label: f.label,
        kind: f.kind,
        list: f.list,
        control: f.control,
        column: f.column,
        filter: f.filter,
        help: f.help,
        note: f.note,
        info: f.info,
        link: f.link,
        format: f.format,
        options: f.options.map((o) => ({ ...o, count: counts.get(o.value) ?? 0 })),
      }
    })
}

const CACHE = new WeakMap<Site, Map<SiteType, TypeData>>()

/** `data/types/<type>.json` for a type: its records' columns and filters, and no bodies. */
export function typeData(site: Site, type: SiteType): TypeData {
  const cache = CACHE.get(site) ?? new Map<SiteType, TypeData>()
  CACHE.set(site, cache)
  const done = cache.get(type)
  if (done !== undefined) return done
  const fields = type.fields.filter((f) => f.column || f.filter)
  const targets: Record<string, DataTarget> = {}
  const records = site.recordsOf(type).map((record): DataRecord => {
    const values: Record<string, DataValue> = {}
    for (const field of fields) {
      const value = dataValue(site, record, field, targets)
      if (value !== null) values[field.name] = value
    }
    return {
      id: record.record.id,
      url: record.url ?? '',
      title: record.title,
      summary: record.summary,
      values,
    }
  })
  const data: TypeData = {
    version: DATA_VERSION,
    type: type.name,
    label: type.label,
    count: records.length,
    fields: dataFields(type, records),
    columns: type.columns.filter((name) => name !== 'title'),
    records,
    targets,
  }
  cache.set(type, data)
  return data
}

/** `data/corpus.json`: the corpus and the types that have pages. */
export function corpusData(site: Site): CorpusData {
  return {
    version: DATA_VERSION,
    name: site.model.name,
    title: site.title,
    description: site.description,
    identity: site.model.identity,
    corpusVersion: site.model.version,
    records: site.types.reduce((n, t) => n + t.count, 0),
    errors: site.model.errors.length,
    warnings: site.model.warnings.length,
    types: site.types.map((t) => ({
      name: t.name,
      label: t.label,
      singular: t.singular,
      description: t.description,
      count: t.count,
      url: t.url as string,
      data: site.dataUrl(`types/${t.slug}.json`),
    })),
    search: site.searchEnabled ? site.dataUrl('search.json') : null,
  }
}

/** The data file of a record's page: `records/<type>/<slug>.json`. */
export function recordDataFile(site: Site, record: SiteRecord): string {
  const page = (record.url as string).slice(site.base.length).replace(/\/$/, '')
  return `records/${page}.json`
}

/** `data/records/<type>/<slug>.json`: one record, whole, with what it points at and what points at it. */
export function recordData(site: Site, record: SiteRecord): RecordData {
  const link = (
    field: string | null,
    to: SiteRecord | undefined,
    text: string,
  ): RecordDataLink => ({
    field,
    key: to?.key ?? null,
    title: to?.title ?? text,
    url: to?.url ?? null,
  })
  const pointerField = (pointer: string | null): string | null =>
    pointer === null ? null : (pointer.split('/')[1] ?? null)
  const r = record.record
  return {
    version: DATA_VERSION,
    id: r.id,
    type: r.type,
    path: r.path,
    identity: r.identity,
    url: record.url as string,
    title: record.title,
    summary: record.summary,
    valid: r.valid,
    data: r.data,
    body: r.body,
    references: [
      ...r.references.map((ref) =>
        link(
          ref.field,
          ref.target === null ? undefined : site.record(ref.target),
          String(ref.value),
        ),
      ),
      ...r.links.map((l) => link(null, site.record(l.target), l.text)),
    ],
    backlinks: r.incoming.map((b) => link(pointerField(b.pointer), site.record(b.from), b.from.id)),
    files: r.files.map((f) => site.fileUrl(record.corpus, f)),
  }
}

/** `data/search.json`: a row of text per record that has a page. */
export function searchData(site: Site, bodyChars = SEARCH_BODY_CHARS): SearchData {
  const types: string[] = []
  const docs = site.pages().map((record): SearchData['docs'][number] => {
    let type = types.indexOf(record.type.singular)
    if (type === -1) type = types.push(record.type.singular) - 1
    const fields = record.type.fields.filter((f) => (f.column || f.filter) && f.kind !== 'boolean')
    const text = [
      ...new Set([
        ...fields.flatMap((f) => site.textOf(record, f.name)),
        record.record.id === record.title ? '' : record.record.id,
      ]),
    ]
      .filter(Boolean)
      .join(' · ')
    const body = plainText(record.record.body ?? '').slice(0, bodyChars)
    return [record.url as string, record.title, type, text, body]
  })
  return { version: DATA_VERSION, types, docs }
}

/** A data file: its path under `data/` and its content, made when asked for. */
export interface DataFile {
  path: string
  content: () => string | Uint8Array
}

/**
 * Every file under `data/`: `corpus.json`, `search.json` when search is on, one
 * `types/<type>.json` per type, one `records/<type>/<slug>.json` per record with a page, and
 * the files of record folders under `files/`.
 */
export function dataFiles(site: Site): DataFile[] {
  const json = (value: unknown): string => JSON.stringify(value)
  const files: DataFile[] = [{ path: 'corpus.json', content: () => json(corpusData(site)) }]
  if (site.searchEnabled) files.push({ path: 'search.json', content: () => json(searchData(site)) })
  for (const type of site.types)
    files.push({ path: `types/${type.slug}.json`, content: () => json(typeData(site, type)) })
  for (const record of site.pages())
    files.push({
      path: recordDataFile(site, record),
      content: () => json(recordData(site, record)),
    })
  for (const key of site.fileRecords().keys()) {
    const [corpus = '', path = ''] = key.split('\0')
    const root = corpus === '' ? site.model.root : (site.model.corpora[corpus]?.root ?? '')
    files.push({
      path: `files/${corpus === '' ? '' : `${corpus}/`}${path}`,
      content: () => readFileSync(join(root, path)),
    })
  }
  return files
}
