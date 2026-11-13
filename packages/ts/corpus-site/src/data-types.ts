/**
 * The JSON the build writes under `data/`: the shapes other code can fetch. They hold no
 * imports from Node, so the browser code shares them.
 */
import type { BadgeColor, ControlKind, DocLink, FieldFormat } from './config.ts'
import type { FieldKind } from './schema.ts'

/** The version of the data files' layout. It changes when a shape here changes incompatibly. */
export const DATA_VERSION = 1

/** One value of an enum field, with how many records of the type hold it. */
export interface DataOption {
  value: string
  label: string
  description: string | null
  color: BadgeColor | null
  count: number
}

/** A field as the site shows it: the schema's facts with the config's on top. */
export interface DataField {
  /** The field name, dotted for a field inside an object. */
  name: string
  label: string
  kind: FieldKind
  /** Whether a record holds a list of values. */
  list: boolean
  control: ControlKind
  /** Whether the field is a table column, and whether it has a filter. */
  column: boolean
  filter: boolean
  help: string | null
  note: string | null
  info: string | null
  link: DocLink | null
  format: FieldFormat
  /** The values of an enum field. Empty for other kinds. */
  options: DataOption[]
  /** Whether a record's value is a `DataTree`: an object, a list of them, or text with links. */
  tree?: boolean
}

/** A value in a type's data file. A reference is the key of its target in `targets`. */
export type DataScalar = string | number | boolean

/** A piece of text in a tree that is a link, code or a badge. */
export interface DataTreeText {
  text: string
  /** The address the text links to. */
  url?: string
  /** Draw it in the monospace face. */
  code?: boolean
  /** Draw it as a badge of this colour. */
  color?: BadgeColor
}

/** One key of an object in a tree, with its label and what the key means. */
export interface DataTreeEntry {
  label: string
  value: DataTree
  help?: string
}

/** An object in a tree: its keys in order. */
export interface DataTreeObject {
  entries: DataTreeEntry[]
}

/**
 * A value that is not one scalar, ready to draw: text, a link, a list, or an object with a
 * label for each key. Dates, numbers and booleans are already text.
 */
export type DataTree = string | DataTreeText | DataTree[] | DataTreeObject | null

/** A field's value: scalars for most fields, and a tree for a field with `tree` set. */
export type DataValue = DataScalar | DataScalar[] | DataTree

/** One record in a type's data file: what the columns and filters need, and no body. */
export interface DataRecord {
  id: string
  /** The record's page, as an absolute path. */
  url: string
  title: string
  summary: string | null
  /** The value of each field in `fields`, by field name. A field the record lacks is absent. */
  values: Record<string, DataValue>
}

/** A record that a reference in a type's data file points at. */
export interface DataTarget {
  title: string
  /** The target's page, or null when it has none. */
  url: string | null
}

/** `data/types/<type>.json`: the records of one type, for filtering and listing. */
export interface TypeData {
  version: number
  type: string
  label: string
  count: number
  /** The filters, in the order they are drawn, then the fields that are only columns. */
  fields: DataField[]
  /** The names of the column fields, in column order. */
  columns: string[]
  /** The filters a reader starts with, by field name, as the page's address writes them. */
  defaults?: Record<string, string[]>
  records: DataRecord[]
  /** The records the reference values point at, by key: `<type>/<slug>`, or `<corpus>:<type>/<slug>`. */
  targets: Record<string, DataTarget>
}

/** The parts of a type's data file a table is drawn from. */
export type TableData = Pick<TypeData, 'fields' | 'columns' | 'records' | 'targets'>

/** A row or a column of a matrix: a record, or a value of a field. */
export interface MatrixItem {
  /** The item's key in the page's address. */
  key: string
  title: string
  /** The record's page, or null. */
  url: string | null
}

/** One record in a cell of a matrix. */
export interface MatrixCell {
  url: string | null
  title: string
  value: DataTree
}

/** A row of a matrix. `cells[i]` holds the records for the column `columns[i]`. */
export interface MatrixRow extends MatrixItem {
  summary: string | null
  /** The key of the row's group, or null. */
  group: string | null
  cells: MatrixCell[][]
}

/** `data/views/<type>/<view>.json`: a matrix view. */
export interface MatrixData {
  version: number
  type: string
  label: string
  /** What the rows and the columns are, in the plural: `Questions`, `Harnesses`. */
  rowLabel: string
  columnLabel: string
  columns: MatrixItem[]
  /** The groups of the rows, in order, with how many rows each has. */
  groups: { key: string; label: string; count: number }[]
  rows: MatrixRow[]
}

/** A record named from another record's data file. */
export interface RecordDataLink {
  /** The field that holds the reference, or null for a link in a Markdown body. */
  field: string | null
  /** The record's key, `<type>/<slug>` or `<corpus>:<type>/<slug>`, or null when the value names none. */
  key: string | null
  title: string
  url: string | null
}

/** `data/records/<type>/<slug>.json`: one record, whole. */
export interface RecordData {
  version: number
  id: string
  type: string
  /** The record's file, relative to the corpus root. */
  path: string
  identity: string | null
  url: string
  title: string
  summary: string | null
  valid: boolean
  /** The record's data as its file holds it. */
  data: Record<string, unknown>
  /** The Markdown body, or null. */
  body: string | null
  /** Each value of each reference field, and each body link to a record. */
  references: RecordDataLink[]
  /** Each record that points at this one. */
  backlinks: RecordDataLink[]
  /** The other files of the record's folder, as absolute paths. */
  files: string[]
}

/** A type in `data/corpus.json`. */
export interface CorpusDataType {
  name: string
  label: string
  singular: string
  description: string | null
  count: number
  /** The type's index page and its data file, as absolute paths. */
  url: string
  data: string
}

/** `data/corpus.json`: the corpus and its types. */
export interface CorpusData {
  version: number
  name: string
  title: string
  description: string | null
  identity: string | null
  corpusVersion: string | null
  records: number
  errors: number
  warnings: number
  types: CorpusDataType[]
  /** The views of the types, with the page and the data file of each as absolute paths. */
  views: { type: string; label: string; url: string; data: string }[]
  /** The search index, as an absolute path, or null when search is off. */
  search: string | null
}

/**
 * `data/search.json`: one row per record. `docs[i]` is
 * `[url, title, type index, key field text, body text, summary]`.
 */
export interface SearchData {
  version: number
  types: string[]
  /** How much a match in a record of each type counts, by type index. */
  weights: number[]
  /** Groups of words that find each other, lower-cased. */
  synonyms?: string[][]
  docs: [string, string, number, string, string, string][]
}
