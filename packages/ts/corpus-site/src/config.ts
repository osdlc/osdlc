/**
 * The publisher's config: what a site says about a corpus that its schemas do not hold. Every
 * value is JSON, so a config can live in a `.json` file as well as in a module.
 */
import type { CorpusType, LoadedCorpus } from '@osdlc/corpus-schema'
import { fieldSchemaAt } from './schema.ts'

/** How a filter is drawn. `hidden` keeps a field out of the filters. */
export type ControlKind = 'select' | 'chips' | 'range' | 'toggle' | 'search' | 'hidden'

/** A badge colour. Each is a pair of custom properties in the stylesheet, so a theme can change it. */
export type BadgeColor = 'neutral' | 'accent' | 'green' | 'amber' | 'red' | 'blue' | 'purple'

/** How a field's values are written. */
export interface FieldFormat {
  /**
   * `date` and `datetime` write an ISO date in the site's locale. `number` groups digits.
   * `badge` draws each value as a badge. `code` uses the monospace face. `link` makes a URL a
   * link. `text` writes the value as it is.
   */
  kind: 'text' | 'date' | 'datetime' | 'number' | 'badge' | 'code' | 'link'
  /** For `date` and `datetime`: the `dateStyle` passed to `Intl.DateTimeFormat`. Default `medium`. */
  dateStyle?: 'short' | 'medium' | 'long'
  /** For `number`: the most fraction digits. */
  digits?: number
  /** For `number`: a unit written after the value, such as `ms` or `%`. */
  unit?: string
}

/** What a config says about one value of an enum field. */
export interface ValueConfig {
  /** The label shown in place of the value. */
  label?: string
  /** One sentence on what the value means, shown beside the option and on the badge. */
  description?: string
  /** The badge colour. */
  color?: BadgeColor
}

/** A link to a longer explanation. */
export interface DocLink {
  href: string
  /** The link text. Default `Learn more`. */
  label?: string
}

/** What a config says about one field of a type. */
export interface FieldConfig {
  /** The label. Default: the field schema's `title`, else the field name in words. */
  label?: string
  /** One or two sentences on what the field holds. Default: the field schema's `description`. */
  help?: string
  /** A short note shown under the filter control, always visible. */
  note?: string
  /** A longer explanation, opened from a "what is this" button beside the label. Plain text. */
  info?: string
  /** A link to a document about the field, shown with `info` and on the record page. */
  link?: DocLink
  /** The filter control. Default: chosen from the field's schema. */
  control?: ControlKind
  /** The field's place among the filters and on the record page. Lower comes first. */
  order?: number
  /** Keep the field off the record page, the columns and the filters. */
  hidden?: boolean
  /** How values are written: a format, or the name of its kind. */
  format?: FieldFormat | FieldFormat['kind']
  /** A label, an explanation and a badge colour for each value of an enum field. */
  values?: Record<string, ValueConfig>
  /** For a field that holds an object: where the labels and help of its keys come from. */
  keysFrom?: KeysFrom
  /**
   * For a field that names records, by reference or as Markdown links: what to show of each
   * record beside its link. A list names fields of the record, shown after the link:
   * `['urls', 'publisher']`. Text with `{field}` places is written out in full, and `{title}`
   * in it is the link: `'{title} ({urls})'`.
   */
  show?: string[] | string
  /**
   * For a field that names records: the text of each link, with `{field}` places filled from
   * the record it names, such as `'{observed} · {kind}'`. Default: the record's title.
   */
  linkText?: string
  /** A badge shown after the field's value on the records that hold certain values. */
  mark?: MarkConfig
}

/** A badge after a field's value, on the records that hold the values `when` asks for. */
export interface MarkConfig {
  when: WhereConfig
  label: string
  /** The badge colour. Default `neutral`. */
  color?: BadgeColor
}

/** What a related table changes about one of its columns. */
export type RelatedFieldConfig = Pick<FieldConfig, 'label' | 'show' | 'linkText'>

/**
 * Labels for the keys of an object value, taken from a JSON Schema another record holds. `ref`
 * is a reference field of the same record. `schemaAt` is the path, in the record it names, of a
 * JSON Schema for the object. A key's label is its `title` there, and its help its `description`.
 */
export interface KeysFrom {
  ref: string
  schemaAt: string
}

/** Field values a record must hold, by field path: one value, or a list of which one must match. */
export type WhereConfig = Record<string, string | number | boolean | (string | number | boolean)[]>

/** A field the site works out at build time. */
export interface DerivedConfig {
  label: string
  /** One or two sentences on what the number means. */
  help?: string
  /**
   * How many records of the type `from` name this record in their reference field `via`. With
   * `distinct`, how many different values of that field those records hold.
   */
  count: { from: string; via: string; where?: WhereConfig; distinct?: string }
}

/** A table, on a record's page, of the records of another type that point at it. */
export interface RelatedConfig {
  /** The table's heading. */
  label: string
  /** A line under the heading. */
  note?: string
  /** The type whose records are listed. */
  from: string
  /**
   * The field of `from` that names this record: a reference field, or a path to Markdown links
   * inside an object or a list, such as `hasEvidenceLines.hasEvidenceItems`.
   */
  via: string
  /** Keep only the records that hold these values. */
  where?: WhereConfig
  /**
   * The columns: fields of `from`, in order. A dotted path reaches into an object, a list or,
   * through a reference field, the record it names (`subject.category`). Without `title`, each
   * row ends in a link to its record.
   */
  columns: string[]
  /** The sort: a column, with a leading `-` for descending. Default `title`. */
  sort?: string
  /** A field path. Rows that share its value sit under one heading. */
  groupBy?: string
  /** For a column of this table only: another label, `show` or `linkText`. */
  fields?: Record<string, RelatedFieldConfig>
}

/** A table that crosses two fields of a type: one row per value of one, one column per value of the other. */
export interface MatrixViewConfig {
  kind: 'matrix'
  /** The page's title. */
  label: string
  /** The page's path segment under the type: `/<type>/<slug>/`. */
  slug: string
  /** Markdown shown above the table. */
  intro?: string
  /** The field whose values are the rows. A reference field gives one row per record it can name. */
  rows: string
  /** The field whose values are the columns. */
  columns: string
  /** What a cell shows: a field path, or text with `{field}` places. */
  cell: string
  /** Keep only the records that hold these values. */
  where?: WhereConfig
  /** A field path on the row's record. Rows that share its value form a group a reader can pick. */
  groupRowsBy?: string
  /** A line under each row's title: text with `{field}` places, filled from the row's record. */
  rowSummary?: string
}

/** A page of a type beside its index. */
export type ViewConfig = MatrixViewConfig

/** A named group of fields on the record page. */
export interface SectionConfig {
  label: string
  fields: string[]
  /** A line under the heading. */
  note?: string
}

/** What a config says about one type. */
export interface TypeConfig {
  /** The name of the type's list, such as `Statements`. Default: the type name in words. */
  label?: string
  /** The name of one record, such as `Statement`. Default: the schema's `title`. */
  singular?: string
  /** A short glyph shown beside the label: an emoji or one or two letters. */
  icon?: string
  /** One line for the home page. Default: the first sentence of the schema's `description`. */
  blurb?: string
  /** Markdown shown above the list. Default: the schema's `description`. */
  intro?: string
  /** Leave the type's index and record pages out of the site. References to its records become text. */
  hidden?: boolean
  /** The type's path segment. Default: the type name. */
  slug?: string
  /**
   * How a record's title is formed: text with `{field}` places, such as
   * `{harness}: {subject}`. Default: the record's `title` field, else its file name.
   */
  title?: string
  /** A line under the title, formed the same way. */
  summary?: string
  /** The fields shown as table columns, in order. Default: chosen from the schema. */
  columns?: string[]
  /** The fields that get a filter, in order. Default: chosen from the schema. */
  filters?: string[]
  /** The default sort: a field name, with a leading `-` for descending. `title` sorts by title. */
  sort?: string
  /**
   * The filters a reader starts with, by field name, written as in the page's address:
   * `{ status: 'current' }`. A reader can remove them.
   */
  defaultFilters?: Record<string, string | string[]>
  /** Groups of fields on the record page. Fields in no group follow under `Details`. */
  sections?: SectionConfig[]
  /** Fields worked out at build time, by name. Each can be a column, a filter and a sort. */
  derived?: Record<string, DerivedConfig>
  /** Tables of the records of other types that point at a record, on its page. */
  related?: RelatedConfig[]
  /** Pages beside the index, such as a matrix. */
  views?: ViewConfig[]
  /** How much a match in this type counts in search, against 1 for other types. */
  searchWeight?: number
  /**
   * Field metadata by field name. A dotted name such as `scope.platform` names a field inside
   * an object, and makes it usable as a column or a filter.
   */
  fields?: Record<string, FieldConfig>
}

/** A corpus the loaded one references or extends, and what the site does with its records. */
export interface ReferencedCorpusConfig {
  /**
   * The address of another corpus-site that publishes the corpus, with a trailing `/`. Its
   * records are then linked there and get no page here.
   */
  href?: string
  /** Give its records no page and no link. */
  hidden?: boolean
}

/** What a publisher adds to a corpus. Pass it to `defineCorpusSite`. */
export interface CorpusSiteConfig {
  /** The site's title. Default: the first heading of the root file, else the corpus name. */
  title?: string
  /** One line under the title on the home page, and the pages' meta description. */
  description?: string
  /** Markdown for the home page. Default: the root file's body. */
  intro?: string
  /** The order of the types in the navigation. Types not named follow by name. */
  typeOrder?: string[]
  /** Rows per page of a type index. Default 50. */
  pageSize?: number
  /** The locale dates and numbers are written in, as a BCP 47 tag. Default `en`. */
  locale?: string
  /**
   * Words search treats as one: a query word in a group finds a record that holds any word of
   * the group. `[['call', 'invoke', 'run']]` lets "called" find "invocation".
   */
  searchSynonyms?: string[][]
  /** Type metadata by type name. */
  types?: Record<string, TypeConfig>
  /** The corpora the loaded one names, by key (`org`, `org/base`). Default: record pages under `ref/`. */
  corpora?: Record<string, ReferencedCorpusConfig>
}

/** Returns its argument: it gives a config file types and completion. */
export function defineCorpusSite(config: CorpusSiteConfig): CorpusSiteConfig {
  return config
}

/** A config that names something the corpus does not have, or holds a value of the wrong kind. */
export class CorpusSiteConfigError extends Error {
  /** Every problem found, one per line of `message`. */
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`corpus-site config:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    this.name = 'CorpusSiteConfigError'
    this.problems = problems
  }
}

const CONTROLS: ControlKind[] = ['select', 'chips', 'range', 'toggle', 'search', 'hidden']
const COLORS: BadgeColor[] = ['neutral', 'accent', 'green', 'amber', 'red', 'blue', 'purple']
const FORMATS: FieldFormat['kind'][] = [
  'text',
  'date',
  'datetime',
  'number',
  'badge',
  'code',
  'link',
]

const TOP_KEYS = [
  'title',
  'description',
  'intro',
  'typeOrder',
  'pageSize',
  'locale',
  'searchSynonyms',
  'types',
  'corpora',
]
const TYPE_KEYS = [
  'label',
  'singular',
  'icon',
  'blurb',
  'intro',
  'hidden',
  'slug',
  'title',
  'summary',
  'columns',
  'filters',
  'sort',
  'sections',
  'fields',
  'defaultFilters',
  'derived',
  'related',
  'views',
  'searchWeight',
]
const RELATED_KEYS = [
  'label',
  'note',
  'from',
  'via',
  'where',
  'columns',
  'sort',
  'groupBy',
  'fields',
]
const VIEW_KEYS = [
  'kind',
  'label',
  'slug',
  'intro',
  'rows',
  'columns',
  'cell',
  'where',
  'groupRowsBy',
  'rowSummary',
]
const FIELD_KEYS = [
  'label',
  'help',
  'note',
  'info',
  'link',
  'control',
  'order',
  'hidden',
  'format',
  'values',
  'keysFrom',
  'show',
  'linkText',
  'mark',
]

const list = (names: Iterable<string>): string => [...names].join(', ') || '(none)'

/** The `{field}` places of a title or summary template. */
export function templateFields(template: string): string[] {
  return [...template.matchAll(/\{([^{}]+)\}/g)].map((m) => (m[1] as string).trim())
}

/**
 * The problems in `config` for `model`: unknown keys, types and fields, with the names that
 * exist, and values outside what a setting allows. Empty when the config is fine.
 */
export function configProblems(config: CorpusSiteConfig, model: LoadedCorpus): string[] {
  const problems: string[] = []
  const unknownKeys = (where: string, value: object, known: string[]): void => {
    for (const key of Object.keys(value))
      if (!known.includes(key))
        problems.push(`${where}: unknown setting "${key}". Settings: ${list(known)}`)
  }
  unknownKeys('config', config, TOP_KEYS)
  if (config.pageSize !== undefined && !(Number.isInteger(config.pageSize) && config.pageSize > 0))
    problems.push(`pageSize: must be a whole number above 0, not ${String(config.pageSize)}`)

  if (
    config.searchSynonyms !== undefined &&
    !(
      Array.isArray(config.searchSynonyms) &&
      config.searchSynonyms.every(
        (group) => Array.isArray(group) && group.every((word) => typeof word === 'string'),
      )
    )
  )
    problems.push('searchSynonyms: must be a list of lists of words')

  const typeNames = model.types.map((t) => t.name)
  for (const name of config.typeOrder ?? [])
    if (!typeNames.includes(name))
      problems.push(`typeOrder: the corpus has no type "${name}". Types: ${list(typeNames)}`)
  for (const key of Object.keys(config.corpora ?? {}))
    if (!Object.hasOwn(model.corpora, key))
      problems.push(
        `corpora: the corpus names no corpus "${key}". Corpora: ${list(Object.keys(model.corpora))}`,
      )

  const slugs = new Map<string, string>()
  for (const [typeName, type] of Object.entries(config.types ?? {})) {
    const where = `types.${typeName}`
    const corpusType = model.types.find((t) => t.name === typeName)
    if (corpusType === undefined) {
      problems.push(`${where}: the corpus has no type "${typeName}". Types: ${list(typeNames)}`)
      continue
    }
    unknownKeys(where, type, TYPE_KEYS)
    const derivedNames = Object.keys(type.derived ?? {})
    const fieldNames = [...corpusType.fields.map((f) => f.name), ...derivedNames]
    const known = (field: string): boolean =>
      field === 'title' ||
      derivedNames.includes(field) ||
      fieldSchemaAt(corpusType, field) !== undefined
    const checkField = (setting: string, field: string, allowTitle: boolean): void => {
      if (known(field) && (allowTitle || field !== 'title' || fieldNames.includes('title'))) return
      problems.push(
        `${where}.${setting}: type "${typeName}" has no field "${field}". Fields: ${list(fieldNames)}`,
      )
    }
    for (const field of type.columns ?? []) checkField('columns', field, true)
    for (const field of type.filters ?? []) checkField('filters', field, false)
    if (type.sort !== undefined) checkField('sort', type.sort.replace(/^-/, ''), true)
    for (const [i, section] of (type.sections ?? []).entries())
      for (const field of section.fields ?? []) checkField(`sections[${i}].fields`, field, false)
    for (const setting of ['title', 'summary'] as const)
      for (const field of templateFields(type[setting] ?? ''))
        if (field !== 'id' && field !== 'name') checkField(setting, field, true)
    if (type.slug !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(type.slug))
      problems.push(`${where}.slug: "${type.slug}" must be lower-case letters, digits and "-"`)

    const referenceFields = corpusType.fields.filter((f) => f.ref !== null).map((f) => f.name)
    for (const field of Object.keys(type.defaultFilters ?? {}))
      if (type.filters !== undefined && !type.filters.includes(field))
        problems.push(
          `${where}.defaultFilters: "${field}" is not one of the type's filters. Filters: ${list(type.filters)}`,
        )
      else checkField('defaultFilters', field, false)
    if (
      type.searchWeight !== undefined &&
      !(typeof type.searchWeight === 'number' && type.searchWeight > 0)
    )
      problems.push(`${where}.searchWeight: must be a number above 0`)

    // A type and one of its reference fields, as `derived` and `related` name them.
    const incoming = (at: string, from: unknown, via: unknown): CorpusType | undefined => {
      const fromType = model.types.find((t) => t.name === from)
      if (fromType === undefined) {
        problems.push(
          `${at}.from: the corpus has no type "${String(from)}". Types: ${list(typeNames)}`,
        )
        return undefined
      }
      const refs = fromType.fields.filter((f) => f.ref !== null).map((f) => f.name)
      // A path into an object or a list may hold Markdown links to records.
      const nested = String(via).includes('.') && holdsText(fieldSchemaAt(fromType, String(via)))
      if (!refs.includes(String(via)) && !nested) {
        problems.push(
          `${at}.via: type "${fromType.name}" has no reference field "${String(via)}". Reference fields: ${list(refs)}`,
        )
        return undefined
      }
      return fromType
    }
    const checkPaths = (
      at: string,
      of: CorpusType,
      paths: string[],
      extra: string[] = [],
    ): void => {
      for (const path of paths)
        if (!extra.includes(path) && !pathExists(model, of, path))
          problems.push(
            `${at}: type "${of.name}" has no field "${path}". Fields: ${list(of.fields.map((f) => f.name))}`,
          )
    }
    const derivedOf = (t: CorpusType): string[] =>
      Object.keys(config.types?.[t.name]?.derived ?? {})
    // `show` and `linkText` name fields of the records a field points at. `targets` are their
    // types when the schema says them: a reference field's.
    const checkShow = (
      at: string,
      field: Pick<FieldConfig, 'show' | 'linkText'>,
      targets: CorpusType[],
    ): void => {
      const { show, linkText } = field
      if (
        show !== undefined &&
        typeof show !== 'string' &&
        !(Array.isArray(show) && show.every((path) => typeof path === 'string'))
      ) {
        problems.push(`${at}.show: must be a list of fields, or text with {field} places`)
        return
      }
      if (linkText !== undefined && typeof linkText !== 'string') {
        problems.push(`${at}.linkText: must be text with {field} places`)
        return
      }
      const named = [
        ...(typeof show === 'string' ? templateFields(show) : (show ?? [])).map(
          (path) => ['show', path] as const,
        ),
        ...templateFields(linkText ?? '').map((path) => ['linkText', path] as const),
      ]
      for (const [setting, path] of named)
        for (const target of targets)
          checkPaths(
            `${at}.${setting}`,
            target,
            [path],
            ['title', 'id', 'name', ...derivedOf(target)],
          )
    }

    for (const [name, derived] of Object.entries(type.derived ?? {})) {
      const at = `${where}.derived.${name}`
      if (corpusType.fields.some((f) => f.name === name))
        problems.push(`${at}: type "${typeName}" already has a field "${name}"`)
      if (typeof derived.count !== 'object' || derived.count === null) {
        problems.push(`${at}: needs "count", with "from" and "via"`)
        continue
      }
      const from = incoming(`${at}.count`, derived.count.from, derived.count.via)
      if (from === undefined) continue
      checkPaths(`${at}.count.where`, from, Object.keys(derived.count.where ?? {}))
      if (derived.count.distinct !== undefined)
        checkPaths(`${at}.count.distinct`, from, [derived.count.distinct])
    }

    for (const [i, related] of (type.related ?? []).entries()) {
      const at = `${where}.related[${i}]`
      unknownKeys(at, related, RELATED_KEYS)
      if (typeof related.label !== 'string' || related.label === '')
        problems.push(`${at}.label: a related table needs a label`)
      const from = incoming(at, related.from, related.via)
      if (from === undefined) continue
      const extra = ['title', ...derivedOf(from)]
      if (!Array.isArray(related.columns) || related.columns.length === 0)
        problems.push(`${at}.columns: name at least one column`)
      else checkPaths(`${at}.columns`, from, related.columns, extra)
      checkPaths(`${at}.where`, from, Object.keys(related.where ?? {}))
      if (related.groupBy !== undefined) checkPaths(`${at}.groupBy`, from, [related.groupBy])
      for (const [name, over] of Object.entries(related.fields ?? {})) {
        if (!(related.columns ?? []).includes(name))
          problems.push(
            `${at}.fields: "${name}" is not a column of the table. Columns: ${list(related.columns ?? [])}`,
          )
        unknownKeys(`${at}.fields.${name}`, over, ['label', 'show', 'linkText'])
        checkShow(`${at}.fields.${name}`, over, [])
      }
      if (related.sort !== undefined) {
        const column = related.sort.replace(/^-/, '')
        if (column !== 'title' && !(related.columns ?? []).includes(column))
          problems.push(
            `${at}.sort: "${column}" is not a column of the table. Columns: ${list(['title', ...(related.columns ?? [])])}`,
          )
      }
    }

    const viewSlugs = new Set<string>()
    for (const [i, view] of (type.views ?? []).entries()) {
      const at = `${where}.views[${i}]`
      unknownKeys(at, view, VIEW_KEYS)
      if (view.kind !== 'matrix') {
        problems.push(`${at}.kind: "${String(view.kind)}" is not a view. Views: matrix`)
        continue
      }
      if (typeof view.label !== 'string' || view.label === '')
        problems.push(`${at}.label: a view needs a label`)
      if (typeof view.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(view.slug))
        problems.push(
          `${at}.slug: "${String(view.slug)}" must be lower-case letters, digits and "-"`,
        )
      else if (viewSlugs.has(view.slug))
        problems.push(`${at}.slug: "${view.slug}" is also the path of another view`)
      else viewSlugs.add(view.slug)
      for (const axis of ['rows', 'columns'] as const)
        if (typeof view[axis] !== 'string' || !fieldNames.includes(view[axis]))
          problems.push(
            `${at}.${axis}: type "${typeName}" has no field "${String(view[axis])}". Fields: ${list(fieldNames)}`,
          )
      if (typeof view.cell !== 'string' || view.cell === '')
        problems.push(`${at}.cell: name a field, or write text with {field} places`)
      else
        checkPaths(
          `${at}.cell`,
          corpusType,
          view.cell.includes('{') ? templateFields(view.cell) : [view.cell],
          ['title', 'id', 'name', ...derivedNames],
        )
      checkPaths(`${at}.where`, corpusType, Object.keys(view.where ?? {}))
      // The row's record is of the type the `rows` field names.
      const rowTypes = (corpusType.fields.find((f) => f.name === view.rows)?.ref?.targets ?? [])
        .filter((t) => t.corpus === '')
        .map((t) => model.types.find((m) => m.name === t.type))
        .filter((t) => t !== undefined)
      const onRow = [
        ...(view.groupRowsBy === undefined ? [] : [['groupRowsBy', view.groupRowsBy] as const]),
        ...templateFields(view.rowSummary ?? '').map((f) => ['rowSummary', f] as const),
      ]
      for (const [setting, path] of onRow) {
        if (rowTypes.length === 0)
          problems.push(
            `${at}.${setting}: needs "rows" to be a reference field. Reference fields: ${list(referenceFields)}`,
          )
        else
          for (const rowType of rowTypes)
            checkPaths(`${at}.${setting}`, rowType, [path], ['title', 'id', 'name'])
      }
    }

    for (const [fieldName, field] of Object.entries(type.fields ?? {})) {
      const at = `${where}.fields.${fieldName}`
      if (fieldSchemaAt(corpusType, fieldName) === undefined) {
        problems.push(
          `${at}: type "${typeName}" has no field "${fieldName}". Fields: ${list(fieldNames)}`,
        )
        continue
      }
      unknownKeys(at, field, FIELD_KEYS)
      if (field.control !== undefined && !CONTROLS.includes(field.control))
        problems.push(
          `${at}.control: "${String(field.control)}" is not a control. Controls: ${list(CONTROLS)}`,
        )
      const format = typeof field.format === 'string' ? field.format : field.format?.kind
      if (field.format !== undefined && !FORMATS.includes(format as FieldFormat['kind']))
        problems.push(
          `${at}.format: "${String(format)}" is not a format. Formats: ${list(FORMATS)}`,
        )
      if (field.keysFrom !== undefined) {
        const { ref, schemaAt } = field.keysFrom
        if (!referenceFields.includes(ref))
          problems.push(
            `${at}.keysFrom.ref: type "${typeName}" has no reference field "${String(ref)}". Reference fields: ${list(referenceFields)}`,
          )
        if (typeof schemaAt !== 'string' || schemaAt === '')
          problems.push(`${at}.keysFrom.schemaAt: name the field that holds the JSON Schema`)
      }
      const own = corpusType.fields.find((f) => f.name === fieldName)
      if (
        (field.show !== undefined || field.linkText !== undefined) &&
        (own === undefined || own.ref === null) &&
        !holdsText(fieldSchemaAt(corpusType, fieldName))
      )
        problems.push(
          `${at}: "show" and "linkText" are for a field that names records. Reference fields: ${list(referenceFields)}`,
        )
      else
        checkShow(
          at,
          field,
          (own?.ref?.targets ?? [])
            .map((t) =>
              (t.corpus === '' ? model : model.corpora[t.corpus])?.types.find(
                (m) => m.name === t.type,
              ),
            )
            .filter((t) => t !== undefined),
        )
      if (field.mark !== undefined) {
        unknownKeys(`${at}.mark`, field.mark, ['when', 'label', 'color'])
        if (typeof field.mark.label !== 'string' || field.mark.label === '')
          problems.push(`${at}.mark.label: a mark needs a label`)
        if (field.mark.color !== undefined && !COLORS.includes(field.mark.color))
          problems.push(
            `${at}.mark.color: "${String(field.mark.color)}" is not a badge colour. Colours: ${list(COLORS)}`,
          )
        if (typeof field.mark.when !== 'object' || field.mark.when === null)
          problems.push(`${at}.mark.when: name the field values that set the mark`)
        else checkPaths(`${at}.mark.when`, corpusType, Object.keys(field.mark.when))
      }
      for (const [value, valueConfig] of Object.entries(field.values ?? {}))
        if (valueConfig.color !== undefined && !COLORS.includes(valueConfig.color))
          problems.push(
            `${at}.values.${value}.color: "${String(valueConfig.color)}" is not a badge colour. Colours: ${list(COLORS)}`,
          )
    }
  }

  // Two types may not share a path segment, and `data`, `search` and `ref` are the site's own.
  for (const t of model.types) {
    const typeConfig = config.types?.[t.name]
    if (typeConfig?.hidden === true) continue
    const slug = typeConfig?.slug ?? t.name
    if (['data', 'search', 'ref'].includes(slug))
      problems.push(
        `types.${t.name}: its path "${slug}" is one the site uses. Set types.${t.name}.slug`,
      )
    const other = slugs.get(slug)
    if (other !== undefined)
      problems.push(`types.${t.name}.slug: "${slug}" is also the path of type "${other}"`)
    slugs.set(slug, t.name)
  }
  return problems
}

/**
 * Whether `path` names something in a record of `type`: a field, a place inside an object or a
 * list field, or, through a reference field, a field of a record it names.
 */
function pathExists(model: LoadedCorpus, type: CorpusType, path: string): boolean {
  if (fieldSchemaAt(type, path) !== undefined) return true
  const parts = path.split('.')
  const field = type.fields.find((f) => f.name === parts[0])
  if (field === undefined || parts.length < 2) return false
  const targets = (field.ref?.targets ?? []).map((t) =>
    (t.corpus === '' ? model : model.corpora[t.corpus])?.types.find((m) => m.name === t.type),
  )
  if (targets.some((t) => t !== undefined && pathExists(model, t, parts.slice(1).join('.'))))
    return true
  // Text inside an object or a list may be a Markdown link to a record of any type.
  for (let i = 2; i < parts.length; i++)
    if (holdsText(fieldSchemaAt(type, parts.slice(0, i).join('.')))) {
      const rest = parts.slice(i).join('.')
      return rest === 'title' || model.types.some((t) => pathExists(model, t, rest))
    }
  return false
}

/** Whether a field schema is for a string, or for a list of strings. */
function holdsText(schema: Record<string, unknown> | undefined): boolean {
  if (schema === undefined) return false
  const items = schema['items']
  if (schema['type'] === 'array' && typeof items === 'object' && items !== null)
    return (items as Record<string, unknown>)['type'] === 'string'
  return schema['type'] === 'string'
}

/** Throw a `CorpusSiteConfigError` when `configProblems` finds any. */
export function validateConfig(config: CorpusSiteConfig, model: LoadedCorpus): void {
  const problems = configProblems(config, model)
  if (problems.length > 0) throw new CorpusSiteConfigError(problems)
}
