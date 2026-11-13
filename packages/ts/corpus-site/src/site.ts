/**
 * The site of a corpus: a loaded corpus and a config resolved into the types, fields, records
 * and addresses the pages and the data files are made from. Built once per build.
 */
import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import {
  loadCorpus,
  type CorpusField,
  type CorpusModel,
  type CorpusRecord,
  type CorpusType,
  type FieldRef,
  type LoadedCorpus,
  type RecordTarget,
} from '@osdlc/corpus-schema'
import { split } from '@osdlc/frontmatter-lossless'
import {
  templateFields,
  validateConfig,
  type BadgeColor,
  type CorpusSiteConfig,
  type FieldConfig,
  type SectionConfig,
  type TypeConfig,
} from './config.ts'
import type { DataField, DataOption } from './data-types.ts'
import { parseSort } from './url-state.ts'
import type { SortState } from './filter.ts'
import { defaultFormat, formatScalar } from './format.ts'
import {
  defaultColumns,
  defaultControl,
  defaultFilters,
  fieldSchemaAt,
  humanize,
  shapeOf,
  type FieldShape,
} from './schema.ts'

/** What `buildSite` needs beside the corpus. */
export interface SiteOptions {
  /** The path the site is served under, such as `/` or `/docs/corpus/`. Default `/`. */
  base?: string
  /** The publisher's config. */
  config?: CorpusSiteConfig
  /** The root file's Markdown body, for the home page. `loadSite` reads it. */
  rootBody?: string | null
  /** Whether the site has a search page and index. Default true. */
  search?: boolean
}

/** A field of a type as the site shows it. */
export interface SiteField extends Omit<DataField, 'options'> {
  /** The values of an enum field. Their counts are filled per type by the data files. */
  options: Omit<DataOption, 'count'>[]
  /** The field's `x-ref`, or null. */
  ref: FieldRef | null
  required: boolean
  /** Whether the config hides the field. */
  hidden: boolean
  /** Whether the name is dotted: a field inside an object, shown with its parent on a record page. */
  nested: boolean
  order: number
}

/** A type as the site shows it. */
export interface SiteType {
  /** The key of the type's corpus: `''` for the loaded one. */
  corpus: string
  name: string
  slug: string
  label: string
  singular: string
  icon: string | null
  blurb: string | null
  /** Markdown shown above the list. */
  intro: string | null
  description: string | null
  /** The index page, or null for a hidden type and for a type of another corpus. */
  url: string | null
  count: number
  /** Every field: the schema's top-level fields in order, then the dotted ones a config names. */
  fields: SiteField[]
  columns: string[]
  filters: string[]
  sort: SortState | null
  sections: SectionConfig[]
  titleTemplate: string | null
  summaryTemplate: string | null
  source: CorpusType
}

/** A record with what the site adds to it. */
export interface SiteRecord {
  corpus: string
  type: SiteType
  record: CorpusRecord
  slug: string
  /** The record's page, on this site or another, or null when it has none. */
  url: string | null
  /** Whether the page is one this site builds. */
  local: boolean
  title: string
  summary: string | null
  /** The record's key in a data file's `targets`. */
  key: string
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A path segment for an id: lower-case letters and digits, with `-` for every other run. */
export function slugify(id: string): string {
  const slug = id
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'record' : slug
}

/** The value at a dotted path in a record's data, or undefined. */
export function valueAt(data: unknown, path: string): unknown {
  let at = data
  for (const part of path.split('.')) {
    if (!isObject(at)) return undefined
    at = at[part]
  }
  return at
}

const firstSentence = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  const end = flat.search(/[.!?](\s|$)/)
  return end === -1 ? flat : flat.slice(0, end + 1)
}

const withSlash = (path: string): string => {
  const p = `/${path}/`.replace(/\/+/g, '/')
  return p
}

/** The Markdown body of a corpus's root file, or null when it has none or it cannot be read. */
export function readRootBody(model: CorpusModel): string | null {
  if (model.rootFile === null) return null
  try {
    return split(readFileSync(join(model.root, model.rootFile), 'utf8')).body
  } catch {
    return null
  }
}

/** The text of a body's first `# heading` and the body without it. */
function splitHeading(body: string): { heading: string | null; rest: string } {
  const m = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(body)
  return m === null
    ? { heading: null, rest: body }
    : { heading: m[1] as string, rest: body.slice(m[0].length) }
}

/**
 * The site of a loaded corpus. The constructor resolves the config against the corpus and
 * throws a `CorpusSiteConfigError` when it names a type or a field the corpus lacks.
 */
export class Site {
  readonly model: LoadedCorpus
  readonly config: CorpusSiteConfig
  /** The path the site is served under, with a leading and a trailing `/`. */
  readonly base: string
  readonly title: string
  readonly description: string | null
  /** Markdown for the home page, or null. */
  readonly intro: string | null
  readonly pageSize: number
  readonly locale: string
  readonly searchEnabled: boolean
  /** The loaded corpus's types that have pages, in navigation order. */
  readonly types: SiteType[]

  readonly #types = new Map<string, SiteType>()
  readonly #records = new Map<string, SiteRecord>()
  readonly #byType = new Map<SiteType, SiteRecord[]>()
  readonly #titles = new Map<SiteRecord, string>()

  constructor(model: LoadedCorpus, options: SiteOptions = {}) {
    const config = options.config ?? {}
    validateConfig(config, model)
    this.model = model
    this.config = config
    this.base = withSlash(options.base ?? '/')
    this.pageSize = config.pageSize ?? 50
    this.locale = config.locale ?? 'en'
    this.searchEnabled = options.search ?? true

    const root = splitHeading(options.rootBody ?? '')
    this.title = config.title ?? root.heading ?? model.name
    this.intro = config.intro ?? (root.rest.trim() === '' ? null : root.rest)
    this.description = config.description ?? null

    for (const corpus of [model, ...Object.values(model.corpora)])
      for (const type of corpus.types) {
        const siteType = this.#buildType(corpus, type)
        this.#types.set(`${corpus.key}\0${type.name}`, siteType)
        this.#byType.set(siteType, [])
      }
    for (const corpus of [model, ...Object.values(model.corpora)]) this.#addRecords(corpus)

    const order = config.typeOrder ?? []
    const rank = (t: SiteType): number => {
      const at = order.indexOf(t.name)
      return at === -1 ? order.length : at
    }
    this.types = model.types
      .map((t) => this.#types.get(`\0${t.name}`) as SiteType)
      .filter((t) => t.url !== null)
      .sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : 1))

    // Titles last: a title template may name a reference, whose title is another record's.
    for (const record of this.#records.values()) {
      record.title = this.#titleOf(record)
    }
    for (const record of this.#records.values()) {
      const template = record.type.summaryTemplate
      record.summary = template === null ? null : this.#fill(template, record) || null
    }
  }

  #buildType(corpus: CorpusModel, type: CorpusType): SiteType {
    const local = corpus.key === ''
    const config: TypeConfig = (local ? this.config.types?.[type.name] : undefined) ?? {}
    const hidden = config.hidden === true || !local
    const slug = config.slug ?? slugify(type.name)
    const label = config.label ?? humanize(type.name)

    const shapes = type.fields.map((field) => ({
      field,
      shape: shapeOf(field.schema, field.ref, type.schema),
    }))
    const fields: SiteField[] = shapes.map(({ field, shape }, i) =>
      siteField(field.name, shape, field, fieldSchemaAt(type, field.name), config.fields, i),
    )
    for (const name of Object.keys(config.fields ?? {})) {
      if (!name.includes('.')) continue
      const schema = fieldSchemaAt(type, name)
      const shape = shapeOf(schema, null, type.schema)
      fields.push(siteField(name, shape, null, schema, config.fields, fields.length))
    }
    const visible = shapes.filter(({ field }) => config.fields?.[field.name]?.hidden !== true)
    const columns = config.columns ?? defaultColumns(visible)
    const filters = (config.filters ?? defaultFilters(visible)).filter((name) => {
      const field = fields.find((f) => f.name === name)
      return field !== undefined && field.control !== 'hidden'
    })
    for (const field of fields) {
      field.column = columns.includes(field.name)
      field.filter = filters.includes(field.name)
    }

    return {
      corpus: corpus.key,
      name: type.name,
      slug,
      label,
      singular: config.singular ?? type.title ?? label,
      icon: config.icon ?? null,
      blurb: config.blurb ?? (type.description === null ? null : firstSentence(type.description)),
      intro: config.intro ?? type.description,
      description: type.description,
      url: hidden ? null : `${this.base}${slug}/`,
      count: 0,
      fields,
      columns,
      filters,
      sort: parseSort(config.sort),
      sections: config.sections ?? [],
      titleTemplate: config.title ?? null,
      summaryTemplate: config.summary ?? null,
      source: type,
    }
  }

  #addRecords(corpus: CorpusModel): void {
    const local = corpus.key === ''
    const other = local ? undefined : this.config.corpora?.[corpus.key]
    const taken = new Map<SiteType, Set<string>>()
    for (const record of corpus.records) {
      const type = this.#types.get(`${corpus.key}\0${record.type}`)
      if (type === undefined) continue
      const slugs = taken.get(type) ?? new Set<string>()
      taken.set(type, slugs)
      const stem = slugify(record.id)
      let slug = stem
      for (let n = 2; slugs.has(slug); n++) slug = `${stem}-${n}`
      slugs.add(slug)

      let url: string | null
      let isLocal = false
      if (local) {
        url = type.url === null ? null : `${type.url}${slug}/`
        isLocal = url !== null
      } else if (other?.hidden === true) url = null
      else if (other?.href !== undefined)
        url = `${other.href.replace(/\/*$/, '/')}${type.slug}/${slug}/`
      else {
        url = `${this.base}ref/${corpus.key}/${type.slug}/${slug}/`
        isLocal = true
      }
      const siteRecord: SiteRecord = {
        corpus: corpus.key,
        type,
        record,
        slug,
        url,
        local: isLocal,
        title: record.title,
        summary: null,
        key: `${local ? '' : `${corpus.key}:`}${type.slug}/${slug}`,
      }
      this.#records.set(`${corpus.key}\0${record.path}`, siteRecord)
      ;(this.#byType.get(type) as SiteRecord[]).push(siteRecord)
      type.count++
    }
  }

  #titleOf(record: SiteRecord, seen = new Set<SiteRecord>()): string {
    const done = this.#titles.get(record)
    if (done !== undefined) return done
    const template = record.type.titleTemplate
    // A record in the middle of its own title, through a chain of references, keeps its plain one.
    if (template === null || seen.has(record)) return record.record.title
    seen.add(record)
    const title = this.#fill(template, record, seen).trim() || record.record.title
    this.#titles.set(record, title)
    return title
  }

  /** `template` with each `{field}` replaced by the record's value as text. */
  #fill(template: string, record: SiteRecord, seen?: Set<SiteRecord>): string {
    let out = template
    for (const name of templateFields(template)) {
      let text: string
      if (name === 'id') text = record.record.id
      else if (name === 'name') text = record.record.name
      else if (name === 'title') text = record.record.title
      else text = this.textOf(record, name, seen).join(', ')
      out = out.split(`{${name}}`).join(text)
    }
    return out.replace(/\s+/g, ' ').trim()
  }

  /**
   * The values of a field of a record as a reader sees them: a reference's target title, an
   * enum's label, a date or a number in its format. Empty when the record lacks the field.
   */
  textOf(record: SiteRecord, fieldName: string, seen?: Set<SiteRecord>): string[] {
    const field = this.field(record.type, fieldName)
    if (field === undefined) return []
    if (field.kind === 'reference')
      return this.referencesOf(record, fieldName).map((r) =>
        r.target === null
          ? r.text
          : seen === undefined
            ? r.target.title
            : this.#titleOf(r.target, seen),
      )
    const value = valueAt(record.record.data, fieldName)
    const values = Array.isArray(value)
      ? value
      : value === undefined || value === null
        ? []
        : [value]
    return values
      .filter((v) => ['string', 'number', 'boolean'].includes(typeof v))
      .map((v) => {
        if (field.kind === 'enum')
          return field.options.find((o) => o.value === String(v))?.label ?? String(v)
        return formatScalar(v as string | number | boolean, field.format, this.locale)
      })
  }

  /**
   * The values of a reference field of a record, in order: the record each names, or null with
   * the value's own text when it names none.
   */
  referencesOf(
    record: SiteRecord,
    fieldName: string,
  ): { target: SiteRecord | null; text: string; unresolved: string | null }[] {
    return record.record.references
      .filter((r) => r.field === fieldName)
      .sort((a, b) => pointerIndex(a.pointer) - pointerIndex(b.pointer))
      .map((r) => ({
        target: r.target === null ? null : (this.record(r.target) ?? null),
        text: linkText(r.value),
        unresolved: r.unresolved,
      }))
  }

  /** The type named `name` in the corpus with key `corpus`, by default the loaded one. */
  type(name: string, corpus = ''): SiteType | undefined {
    return this.#types.get(`${corpus}\0${name}`)
  }

  /** The field of `type` named `name`, dotted names included. */
  field(type: SiteType, name: string): SiteField | undefined {
    return type.fields.find((f) => f.name === name)
  }

  /** The site record a `RecordTarget` names, in any corpus of the graph. */
  record(target: Pick<RecordTarget, 'corpus' | 'path'>): SiteRecord | undefined {
    return this.#records.get(`${target.corpus}\0${target.path}`)
  }

  /** The records of a type, by id. */
  recordsOf(type: SiteType): SiteRecord[] {
    return this.#byType.get(type) ?? []
  }

  /** Every record that has a page on this site: the loaded corpus's, then the referenced ones'. */
  pages(): SiteRecord[] {
    return [...this.#records.values()].filter((r) => r.local)
  }

  /** Every record of every corpus. */
  records(): SiteRecord[] {
    return [...this.#records.values()]
  }

  get homeUrl(): string {
    return this.base
  }

  get searchUrl(): string {
    return `${this.base}search/`
  }

  /** The address of a data file, such as `corpus.json` or `types/tasks.json`. */
  dataUrl(file: string): string {
    return `${this.base}data/${file}`
  }

  /** The address the site serves a file of a record folder at. */
  fileUrl(corpus: string, path: string): string {
    const encoded = path.split('/').map(encodeURIComponent).join('/')
    return this.dataUrl(`files/${corpus === '' ? '' : `${corpus}/`}${encoded}`)
  }

  /**
   * What a link written in a file of a corpus points at on this site: a record's page, a
   * type's index for its schema file, or a file of a record folder. `target` is the path as
   * written, percent-decoded, without its fragment. Null when it names none of those.
   */
  resolveLink(
    corpus: string,
    fromPath: string,
    target: string,
  ): { url: string | null; title: string } | null {
    const from = this.#records.get(`${corpus}\0${fromPath}`)
    // The loader has resolved the links of a record's body, wikilinks by id included.
    const known = from?.record.links.find((l) => l.href === target || safeDecode(l.href) === target)
    if (known !== undefined) {
      const to = this.record(known.target)
      if (to !== undefined) return { url: to.url, title: to.title }
    }
    let path = posix.normalize(posix.join(posix.dirname(fromPath), target))
    let key = corpus
    const copy = /^_references\/([^/]+)\/(.+)$/.exec(path)
    const model = corpus === '' ? this.model : this.model.corpora[corpus]
    if (copy !== null && model !== undefined) {
      const named = model.references[copy[1] as string]
      if (named === undefined) return null
      key = named
      path = copy[2] as string
    }
    if (path.startsWith('../')) return null
    const record = this.#records.get(`${key}\0${path}`)
    if (record !== undefined) return { url: record.url, title: record.title }
    const corpusModel = key === '' ? this.model : this.model.corpora[key]
    const type = corpusModel?.types.find((t) => t.schemaFile === path)
    if (type !== undefined) {
      const siteType = this.type(type.name, key) as SiteType
      return { url: siteType.url, title: siteType.label }
    }
    if (this.fileRecords().has(`${key}\0${path}`))
      return { url: this.fileUrl(key, path), title: posix.basename(path) }
    return null
  }

  #files: Map<string, SiteRecord> | undefined

  /** The files of record folders the site serves, as `<corpus key>\0<path>`, with their record. */
  fileRecords(): Map<string, SiteRecord> {
    if (this.#files === undefined) {
      this.#files = new Map()
      for (const record of this.#records.values())
        if (record.local)
          for (const file of record.record.files)
            this.#files.set(`${record.corpus}\0${file}`, record)
    }
    return this.#files
  }
}

const pointerIndex = (pointer: string): number => {
  const m = /\/(\d+)$/.exec(pointer)
  return m === null ? 0 : Number(m[1])
}

export const safeDecode = (text: string): string => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** A string that is one whole Markdown link or wikilink, as a reference or a frontmatter link is. */
export function parseWholeLink(value: string): { text: string; href: string } | null {
  const md = /^\[([^\]]*)\]\(\s*<?([^)>]+?)>?\s*\)$/.exec(value.trim())
  if (md !== null) return { text: md[1] as string, href: md[2] as string }
  const wiki = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/.exec(value.trim())
  if (wiki !== null) return { text: wiki[2] ?? (wiki[1] as string), href: wiki[1] as string }
  return null
}

/** The text of a reference value: a link's text, or the value. */
function linkText(value: unknown): string {
  if (typeof value !== 'string') return String(value)
  return parseWholeLink(value)?.text || value
}

function siteField(
  name: string,
  shape: FieldShape,
  field: CorpusField | null,
  schema: Record<string, unknown> | undefined,
  configs: Record<string, FieldConfig> | undefined,
  index: number,
): SiteField {
  const config = configs?.[name] ?? {}
  const text = (keyword: string): string | null =>
    typeof schema?.[keyword] === 'string' ? (schema[keyword] as string) : null
  const format =
    config.format === undefined
      ? defaultFormat(shape.kind)
      : typeof config.format === 'string'
        ? { kind: config.format }
        : config.format
  const options = shape.options.map((o) => {
    const value = config.values?.[o.value]
    return {
      value: o.value,
      label: value?.label ?? o.label,
      description: value?.description ?? o.description,
      color: (value?.color ?? null) as BadgeColor | null,
    }
  })
  return {
    name,
    label: config.label ?? text('title') ?? humanize(name),
    kind: shape.kind,
    list: shape.list,
    control: config.hidden === true ? 'hidden' : (config.control ?? defaultControl(shape)),
    column: false,
    filter: false,
    help: config.help ?? text('description'),
    note: config.note ?? null,
    info: config.info ?? null,
    link: config.link ?? null,
    format,
    options,
    ref: field?.ref ?? null,
    required: field?.required ?? false,
    hidden: config.hidden === true,
    nested: name.includes('.'),
    order: config.order ?? index,
  }
}

/**
 * Load the corpus at `root` and build its site: `loadCorpus`, the root file's body, then
 * `new Site`. Throws a `CorpusSiteConfigError` for a config that does not fit the corpus.
 */
export function loadSite(root: string, options: SiteOptions = {}): Site {
  const model = loadCorpus(root)
  return new Site(model, { rootBody: readRootBody(model), ...options })
}
