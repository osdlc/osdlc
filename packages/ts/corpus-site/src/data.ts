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
  type MatrixCell,
  type MatrixData,
  type MatrixItem,
  type RecordData,
  type RecordDataLink,
  type SearchData,
  type TableData,
  type TypeData,
} from './data-types.ts'
import { templateFields } from './config.ts'
import { displayPath, toTree } from './display.ts'
import { filterRecords } from './filter.ts'
import { plainText } from './markdown.ts'
import {
  parseWholeLink,
  slugify,
  valueAt,
  type Site,
  type SiteField,
  type SiteRecord,
  type SiteType,
  type SiteView,
} from './site.ts'
import { parseSort } from './url-state.ts'
import { keyLabel } from './value-text.ts'

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

/** A field as a data file holds it. */
const dataField = (f: SiteField, tree: boolean): DataField => ({
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
  options: f.options.map((o) => ({ ...o, count: 0 })),
  ...(tree ? { tree } : {}),
})

/** How many records hold each value of each enum field. */
function countOptions(fields: DataField[], records: DataRecord[]): void {
  for (const field of fields) {
    if (field.options.length === 0 || field.tree === true) continue
    const counts = new Map<string, number>()
    for (const record of records) {
      const value = record.values[field.name]
      const held = Array.isArray(value)
        ? value
        : value === null || value === undefined
          ? []
          : [value]
      for (const v of new Set(held.map(String))) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    for (const option of field.options) option.count = counts.get(option.value) ?? 0
  }
}

/** A column of a table: the field, and how a record's value for it is made. */
interface Column {
  field: DataField
  value: (record: SiteRecord, targets: Record<string, DataTarget>) => DataValue
}

const holdsLink = (value: unknown): boolean =>
  (Array.isArray(value) ? value : [value]).some(
    (v) => typeof v === 'string' && parseWholeLink(v) !== null,
  )

/**
 * The column `path` names for records of `type`. A field of scalars keeps them, so it can be
 * filtered and sorted. An object, a list of objects, text that holds links and a path that
 * leads through a reference become trees.
 */
function columnOf(
  site: Site,
  type: SiteType,
  path: string,
  records: SiteRecord[],
  help: boolean,
): Column {
  const known = site.field(type, path)
  const tree = (record: SiteRecord): DataValue => toTree(displayPath(site, record, path), help)
  if (known === undefined) {
    // A path through a reference: the label is the last field's, in the type it leads to.
    const last = records.flatMap((r) => site.follow(r, path))[0]
    const end = last === undefined ? undefined : site.field(last.record.type, last.path)
    return {
      field: {
        name: path,
        label: end?.label ?? keyLabel(path.split('.').pop() as string),
        kind: 'json',
        list: false,
        control: 'hidden',
        column: true,
        filter: false,
        help: end?.help ?? null,
        note: null,
        info: null,
        link: null,
        format: { kind: 'text' },
        options: [],
        tree: true,
      },
      value: tree,
    }
  }
  if (known.derived !== null)
    return { field: dataField(known, false), value: (r) => site.derivedValue(r, known.name) }
  const asTree =
    known.kind === 'json' ||
    ((known.kind === 'text' || known.kind === 'url') &&
      records.some((r) => holdsLink(valueAt(r.record.data, known.name))))
  return asTree
    ? { field: dataField(known, true), value: tree }
    : { field: dataField(known, false), value: (r, targets) => dataValue(site, r, known, targets) }
}

/** The rows of a table: one per record, with a value for each column. */
function tableRows(
  records: SiteRecord[],
  columns: Column[],
  targets: Record<string, DataTarget>,
  summary: boolean,
): DataRecord[] {
  return records.map((record) => {
    const values: Record<string, DataValue> = {}
    for (const column of columns) {
      const value = column.value(record, targets)
      if (value !== null) values[column.field.name] = value
    }
    return {
      id: record.record.id,
      url: record.url ?? '',
      title: record.title,
      summary: summary ? record.summary : null,
      values,
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
  const all = site.recordsOf(type)
  const columns = type.fields
    .filter((f) => f.column || f.filter)
    .sort((a, b) => rank(type.filters, a.name) - rank(type.filters, b.name) || a.order - b.order)
    .map((f) => columnOf(site, type, f.name, all, false))
  const targets: Record<string, DataTarget> = {}
  // A summary made only of the columns would say each row twice.
  const places = templateFields(type.summaryTemplate ?? '')
  const repeats = places.length > 0 && places.every((name) => type.columns.includes(name))
  const records = tableRows(all, columns, targets, !repeats)
  const fields = columns.map((c) => c.field)
  countOptions(fields, records)
  const data: TypeData = {
    version: DATA_VERSION,
    type: type.name,
    label: type.label,
    count: records.length,
    fields,
    columns: type.columns.filter((name) => name !== 'title'),
    ...(Object.keys(type.defaultFilters).length === 0 ? {} : { defaults: type.defaultFilters }),
    records,
    targets,
  }
  cache.set(type, data)
  return data
}

/** A table on a record's page: the records of another type that point at the record. */
export interface RelatedTable {
  label: string
  note: string | null
  /** The type of the listed records. */
  from: SiteType
  /** How many records the table lists. */
  total: number
  table: TableData
  /** The rows under each heading. One group with a null label when the table is not grouped. */
  groups: { label: string | null; rows: DataRecord[] }[]
  /** Whether the title is a column. Without it each row ends in a link to its record. */
  showTitle: boolean
}

/**
 * The related tables of a record's page, as its type's config asks for them. A table with no
 * rows is left out.
 */
export function relatedTables(site: Site, record: SiteRecord): RelatedTable[] {
  const out: RelatedTable[] = []
  for (const related of record.corpus === '' ? record.type.related : []) {
    const from = site.type(related.from)
    if (from === undefined) continue
    const found = site.incoming(record, related.from, related.via, related.where)
    if (found.length === 0) continue
    const columns = related.columns
      .filter((name) => name !== 'title')
      .map((name) => columnOf(site, from, name, found, true))
    const targets: Record<string, DataTarget> = {}
    const records = tableRows(found, columns, targets, false)
    // A column no row has a value for is left out.
    const held = columns.filter((c) => records.some((r) => r.values[c.field.name] !== undefined))
    const table: TableData = {
      fields: held.map((c) => ({ ...c.field, column: true })),
      columns: held.map((c) => c.field.name),
      records,
      targets,
    }
    const sorted = filterRecords(
      { version: DATA_VERSION, type: from.name, label: from.label, count: found.length, ...table },
      { query: '', filters: {}, sort: parseSort(related.sort ?? 'title'), page: 1 },
    )
    const groups = new Map<string, DataRecord[]>()
    const byRow = new Map(table.records.map((row, i) => [row, found[i] as SiteRecord]))
    for (const row of sorted) {
      const groupBy = related.groupBy
      const label =
        groupBy === undefined ? '' : site.textOf(byRow.get(row) as SiteRecord, groupBy).join(', ')
      groups.set(label, [...(groups.get(label) ?? []), row])
    }
    out.push({
      label: related.label,
      note: related.note ?? null,
      from,
      total: found.length,
      table,
      groups: [...groups.entries()]
        .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
        .map(([label, rows]) => ({
          label: related.groupBy === undefined ? null : label || 'Other',
          rows,
        })),
      showTitle: related.columns.includes('title'),
    })
  }
  return out
}

/** The values of one side of a matrix, and the keys of the ones a record holds. */
function matrixAxis(
  site: Site,
  type: SiteType,
  fieldName: string,
  records: SiteRecord[],
): {
  /** What the items are, in the plural: the label of the type a reference names, else the field's. */
  label: string
  items: (MatrixItem & { record: SiteRecord | null })[]
  keysOf: (r: SiteRecord) => string[]
} {
  const field = site.field(type, fieldName) as SiteField
  if (field.kind === 'reference') {
    const targets = (field.ref?.targets ?? [])
      .map((t) => site.type(t.type, t.corpus))
      .filter((t) => t !== undefined)
    const key = (r: SiteRecord): string => (targets.length > 1 ? r.key : r.slug)
    return {
      label: targets.length === 1 ? (targets[0] as SiteType).label : field.label,
      items: targets
        .flatMap((t) => site.recordsOf(t))
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((r) => ({ key: key(r), title: r.title, url: r.url, record: r })),
      keysOf: (r) =>
        site
          .referencesOf(r, fieldName)
          .flatMap((ref) => (ref.target === null ? [] : [key(ref.target)])),
    }
  }
  const seen = new Set(records.flatMap((r) => site.textOf(r, fieldName)))
  const order = field.options.map((o) => o.label)
  const titles = [...seen].sort(
    (a, b) => rank(order, a) - rank(order, b) || a.localeCompare(b, undefined, { numeric: true }),
  )
  return {
    label: field.label,
    items: titles.map((title) => ({ key: slugify(title), title, url: null, record: null })),
    keysOf: (r) => site.textOf(r, fieldName).map(slugify),
  }
}

const MATRICES = new WeakMap<SiteView, MatrixData>()

/**
 * A matrix view's table: a row per value of the `rows` field, a column per value of the
 * `columns` field that some record holds, and in each cell the records that hold both.
 */
export function matrixData(site: Site, view: SiteView): MatrixData {
  const done = MATRICES.get(view)
  if (done !== undefined) return done
  const { type } = view
  const records = site.recordsOf(type).filter((r) => site.matches(r, view.where))
  const rows = matrixAxis(site, type, view.rows, records)
  const columns = matrixAxis(site, type, view.columns, records)
  const cells = new Map<string, MatrixCell[]>()
  const usedColumns = new Set<string>()
  for (const record of records) {
    const value = view.cell.includes('{')
      ? site.fill(view.cell, record) || null
      : toTree(displayPath(site, record, view.cell), false)
    for (const row of rows.keysOf(record))
      for (const column of columns.keysOf(record)) {
        usedColumns.add(column)
        const key = `${row}\0${column}`
        cells.set(key, [...(cells.get(key) ?? []), { url: record.url, title: record.title, value }])
      }
  }
  const shown = columns.items.filter((c) => usedColumns.has(c.key))
  const groupOf = (record: SiteRecord | null): string | null => {
    if (view.groupRowsBy === undefined || record === null) return null
    return site.textOf(record, view.groupRowsBy).join(', ') || null
  }
  const withGroup = rows.items
    .map((item) => ({ item, group: groupOf(item.record) }))
    .sort((a, b) => (a.group ?? '\uffff').localeCompare(b.group ?? '\uffff'))
  const groups = new Map<string, { key: string; label: string; count: number }>()
  for (const { group } of withGroup) {
    if (group === null) continue
    const held = groups.get(group) ?? { key: slugify(group), label: group, count: 0 }
    held.count++
    groups.set(group, held)
  }
  const data: MatrixData = {
    version: DATA_VERSION,
    type: type.name,
    label: view.label,
    rowLabel: rows.label,
    columnLabel: columns.label,
    columns: shown.map(({ key, title, url }) => ({ key, title, url })),
    groups: [...groups.values()],
    rows: withGroup.map(({ item, group }) => ({
      key: item.key,
      title: item.title,
      url: item.url,
      summary:
        view.rowSummary === undefined || item.record === null
          ? null
          : site.fill(view.rowSummary, item.record) || null,
      group: group === null ? null : slugify(group),
      cells: shown.map((column) => cells.get(`${item.key}\0${column.key}`) ?? []),
    })),
  }
  MATRICES.set(view, data)
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
    views: site.views().map((view) => ({
      type: view.type.name,
      label: view.label,
      url: view.url,
      data: site.dataUrl(viewDataFile(view)),
    })),
    search: site.searchEnabled ? site.dataUrl('search.json') : null,
  }
}

/** The data file of a view: `views/<type>/<view>.json`. */
export const viewDataFile = (view: SiteView): string => `views/${view.type.slug}/${view.slug}.json`

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
  const weights: number[] = []
  const docs = site.pages().map((record): SearchData['docs'][number] => {
    let type = types.indexOf(record.type.singular)
    if (type === -1) {
      type = types.push(record.type.singular) - 1
      weights.push(record.type.searchWeight)
    }
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
    return [record.url as string, record.title, type, text, body, record.summary ?? '']
  })
  const synonyms = (site.config.searchSynonyms ?? []).map((group) =>
    group.map((word) => word.toLowerCase()),
  )
  return {
    version: DATA_VERSION,
    types,
    weights,
    ...(synonyms.length === 0 ? {} : { synonyms }),
    docs,
  }
}

/** A data file: its path under `data/` and its content, made when asked for. */
export interface DataFile {
  path: string
  content: () => string | Uint8Array
}

/**
 * Every file under `data/`: `corpus.json`, `search.json` when search is on, one
 * `types/<type>.json` per type, one `views/<type>/<view>.json` per view, one `records/<type>/<slug>.json` per record with a page, and
 * the files of record folders under `files/`.
 */
export function dataFiles(site: Site): DataFile[] {
  const json = (value: unknown): string => JSON.stringify(value)
  const files: DataFile[] = [{ path: 'corpus.json', content: () => json(corpusData(site)) }]
  if (site.searchEnabled) files.push({ path: 'search.json', content: () => json(searchData(site)) })
  for (const type of site.types)
    files.push({ path: `types/${type.slug}.json`, content: () => json(typeData(site, type)) })
  for (const view of site.views())
    files.push({ path: viewDataFile(view), content: () => json(matrixData(site, view)) })
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
