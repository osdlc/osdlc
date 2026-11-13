/**
 * A record as a page shows it: each field's value as a small tree the templates draw, the
 * record folder's files, and the records that point at it.
 */
import type { BadgeColor } from './config.ts'
import type { DataTree } from './data-types.ts'
import { formatScalar } from './format.ts'
import { fieldSchemaAt, humanize, shapeOf } from './schema.ts'
import {
  parseWholeLink,
  safeDecode,
  valueAt,
  type Site,
  type SiteField,
  type SiteRecord,
  type SiteType,
} from './site.ts'
import { templateFields } from './config.ts'
import { keyLabel, looksLikeCode, shortUrl } from './value-text.ts'

/** A value as a page shows it. */
export type Display =
  | { kind: 'empty' }
  | { kind: 'text'; text: string; code: boolean }
  | { kind: 'link'; text: string; href: string; external: boolean }
  /** A reference or a link that names no record, with the reason when the validator gave one. */
  | { kind: 'missing'; text: string; reason: string | null }
  | { kind: 'badge'; text: string; color: BadgeColor; description: string | null }
  | { kind: 'date'; text: string; iso: string }
  | { kind: 'list'; items: Display[] }
  | { kind: 'object'; entries: { label: string; help: string | null; value: Display }[] }
  /** Values on one line: a link to a record with what is shown of it, or a value and its mark. */
  | { kind: 'group'; items: Display[] }

/** One field of a record page. */
export interface FieldRow {
  field: SiteField
  value: Display
}

/** A group of fields on a record page. `label` is null for the only group. */
export interface FieldSection {
  label: string | null
  note: string | null
  rows: FieldRow[]
}

/** The records that point at a record through one field of one type, or from their bodies. */
export interface BacklinkGroup {
  type: SiteType
  /** The field's label, or null for links in Markdown bodies. */
  field: string | null
  records: SiteRecord[]
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

type Schema = Record<string, unknown>

/** What a value is shown by: a field's label, help, kind, format and enum values. */
type Shown = Pick<SiteField, 'label' | 'help' | 'kind' | 'format' | 'options'> &
  Partial<Pick<SiteField, 'show' | 'linkText'>> & {
    /** Nothing says how to write a string here, so one that reads as code is drawn as code. */
    guess?: boolean
  }

/** What a column of one table changes about a field. */
export type ShownOver = { show?: string[] | string; linkText?: string }

/** How deep `show` goes: a record shown beside a link may show the records it names, once. */
const MAX_SHOW_DEPTH = 2
let showDepth = 0

/**
 * A link to a record a field names, with what the field's `show` asks for beside it. `text` is
 * the link's text when the field has no `linkText`.
 */
function named(site: Site, target: SiteRecord, field: Shown, text = target.title): Display {
  const label =
    field.linkText === undefined || field.linkText === null
      ? text
      : site.fill(field.linkText, target) || text
  const link: Display =
    target.url === null
      ? { kind: 'text', text: label, code: false }
      : { kind: 'link', text: label, href: target.url, external: !target.local }
  const show = field.show
  if (show === undefined || show === null || show.length === 0 || showDepth >= MAX_SHOW_DEPTH)
    return link
  showDepth++
  try {
    // A list's items sit on the line one by one.
    const flat = (value: Display): Display[] =>
      value.kind === 'empty'
        ? []
        : value.kind === 'list' || value.kind === 'group'
          ? value.items.flatMap(flat)
          : [value]
    const of = (path: string): Display[] =>
      path === 'title' ? [link] : flat(displayPath(site, target, path))
    let items: Display[]
    if (typeof show !== 'string') items = [link, ...show.flatMap(of)]
    else {
      items = []
      const places = templateFields(show)
      const pieces = show.split(/\{[^{}]+\}/)
      for (const [i, piece] of pieces.entries()) {
        const next = places[i] === undefined ? null : of(places[i])
        // Text that leads up to an empty place goes with it.
        if (piece.trim() !== '' && !(next !== null && next.length === 0))
          items.push({ kind: 'text', text: piece.trim(), code: false })
        items.push(...(next ?? []))
      }
    }
    return items.length === 1 ? (items[0] as Display) : { kind: 'group', items }
  } finally {
    showDepth--
  }
}

/** `value` with the field's mark after it, when the record holds what the mark asks for. */
function marked(site: Site, record: SiteRecord, field: SiteField, value: Display): Display {
  if (field.mark === null || value.kind === 'empty' || !site.matches(record, field.mark.when))
    return value
  const badge: Display = {
    kind: 'badge',
    text: field.mark.label,
    color: field.mark.color ?? 'neutral',
    description: null,
  }
  const one = (item: Display): Display => ({ kind: 'group', items: [item, badge] })
  return value.kind === 'list' ? { kind: 'list', items: value.items.map(one) } : one(value)
}

/** What the schemas and the config say about the field at `path`, top-level or nested. */
function fieldAt(site: Site, type: SiteType, path: string): Shown {
  const known = site.field(type, path)
  if (known !== undefined) return known
  const schema = fieldSchemaAt(type.source, path)
  const shape = shapeOf(schema, null, type.source.schema)
  return {
    label: typeof schema?.['title'] === 'string' ? schema['title'] : humanize(path),
    help: typeof schema?.['description'] === 'string' ? schema['description'] : null,
    kind: shape.kind,
    format:
      shape.kind === 'date' || shape.kind === 'datetime'
        ? { kind: shape.kind }
        : shape.kind === 'enum'
          ? { kind: 'badge' }
          : { kind: 'text' },
    options: shape.options.map((o) => ({ ...o, color: null })),
    guess: shape.kind === 'text' || shape.kind === 'json',
  }
}

/** What a JSON Schema taken from a record says about the key `key` of an object it describes. */
function keyAt(schema: Schema | undefined, key: string): { shown: Shown; schema?: Schema } {
  const properties = schema?.['properties']
  const own = isObject(properties) && isObject(properties[key]) ? properties[key] : undefined
  return {
    shown: {
      label: typeof own?.['title'] === 'string' ? own['title'] : keyLabel(key),
      help: typeof own?.['description'] === 'string' ? own['description'] : null,
      kind: 'text',
      format: { kind: 'text' },
      options: [],
      guess: true,
    },
    ...(own === undefined ? {} : { schema: own }),
  }
}

/** The JSON Schema a field's `keysFrom` names for a record's value, or undefined. */
function keysSchema(site: Site, record: SiteRecord, path: string): Schema | undefined {
  const from = site.field(record.type, path)?.keysFrom
  if (from === null || from === undefined) return undefined
  const target = site.referencesOf(record, from.ref)[0]?.target
  const schema =
    target === null || target === undefined ? undefined : valueAt(target.record.data, from.schemaAt)
  return isObject(schema) ? schema : undefined
}

function scalar(
  site: Site,
  record: SiteRecord,
  field: Shown,
  value: string | number | boolean,
): Display {
  if (field.kind === 'enum' || field.format.kind === 'badge') {
    const option = field.options.find((o) => o.value === String(value))
    return {
      kind: 'badge',
      text: option?.label ?? String(value),
      color: option?.color ?? 'neutral',
      description: option?.description ?? null,
    }
  }
  if (typeof value === 'string') {
    const link = parseWholeLink(value)
    if (link !== null && !/^[a-z][a-z0-9+.-]*:/i.test(link.href)) {
      const [path = '', fragment] = link.href.split('#')
      const target = site.linked(record, link.href)
      const shows = (field.show ?? null) !== null || (field.linkText ?? null) !== null
      if (shows && target !== undefined && target.url !== null)
        return named(site, target, field, link.text || target.title)
      const found = site.resolveLink(record.corpus, record.record.path, safeDecode(path))
      const text = link.text || found?.title || path
      if (found === null || found.url === null) return { kind: 'missing', text, reason: null }
      return {
        kind: 'link',
        text,
        href: fragment === undefined ? found.url : `${found.url}#${fragment}`,
        external: false,
      }
    }
    if (link !== null)
      return {
        kind: 'link',
        text: link.text || shortUrl(link.href),
        href: link.href,
        external: true,
      }
    if (/^https?:\/\/\S+$/.test(value))
      return { kind: 'link', text: shortUrl(value), href: value, external: true }
    if (field.format.kind === 'date' || field.format.kind === 'datetime')
      return { kind: 'date', text: formatScalar(value, field.format, site.locale), iso: value }
  }
  return {
    kind: 'text',
    text: formatScalar(value, field.format, site.locale),
    code:
      field.format.kind === 'code' ||
      (field.guess === true && typeof value === 'string' && looksLikeCode(value)),
  }
}

/**
 * The value at `path` of a record as a display tree. `keys` is a JSON Schema for the value that
 * a record holds (`keysFrom`), which then names its keys in place of the type's schema. `shown`
 * is what that schema says about the value itself.
 */
function display(
  site: Site,
  record: SiteRecord,
  path: string,
  value: unknown,
  keys: Schema | undefined = keysSchema(site, record, path),
  shown?: Shown,
): Display {
  if (value === undefined || value === null || value === '') return { kind: 'empty' }
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'empty' }
    const items = isObject(keys?.['items']) ? keys['items'] : keys
    return {
      kind: 'list',
      items: value.map((v) => display(site, record, path, v, items, shown)),
    }
  }
  if (isObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return { kind: 'empty' }
    return {
      kind: 'object',
      entries: entries.map(([key, v]) => {
        const at = `${path}.${key}`
        if (keys !== undefined) {
          const own = keyAt(keys, key)
          return {
            label: own.shown.label,
            help: own.shown.help,
            value: display(site, record, at, v, own.schema ?? {}, own.shown),
          }
        }
        const field = fieldAt(site, record.type, at)
        return { label: field.label, help: field.help, value: display(site, record, at, v) }
      }),
    }
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return scalar(site, record, shown ?? fieldAt(site, record.type, path), value)
  return { kind: 'text', text: String(value), code: false }
}

/**
 * The value a field path of a record leads to, as a display tree. The path may be `title`, a
 * derived field, a place inside an object or a list, or lead through a reference field to a
 * field of the record it names.
 */
export function displayPath(
  site: Site,
  record: SiteRecord,
  path: string,
  over: ShownOver = {},
): Display {
  const items = site
    .follow(record, path)
    .map((at): Display => {
      if (at.path === 'title')
        return at.record.url === null
          ? { kind: 'text', text: at.record.title, code: false }
          : { kind: 'link', text: at.record.title, href: at.record.url, external: !at.record.local }
      const field = site.field(at.record.type, at.path)
      if (field !== undefined && field.derived !== null)
        return { kind: 'text', text: String(site.derivedValue(at.record, at.path)), code: false }
      if (field !== undefined && !field.nested)
        return displayField(site, at.record, { ...field, ...over })
      return display(
        site,
        at.record,
        at.path,
        valueAt(at.record.record.data, at.path),
        undefined,
        Object.keys(over).length === 0
          ? undefined
          : { ...fieldAt(site, at.record.type, at.path), ...over },
      )
    })
    .filter((item) => item.kind !== 'empty')
  if (items.length === 0) return { kind: 'empty' }
  return items.length === 1 ? (items[0] as Display) : { kind: 'list', items }
}

/** The longest text a tree keeps whole. Longer text is cut with `…`. */
export const MAX_TREE_TEXT = 400

/**
 * A display tree in the slim form the data files and the table cells use. `help` keeps what
 * each key of an object means, for a tooltip. A file of many records leaves it out.
 */
export function toTree(value: Display, help = true): DataTree {
  const cut = (text: string): string =>
    text.length > MAX_TREE_TEXT ? `${text.slice(0, MAX_TREE_TEXT - 1).trimEnd()}…` : text
  switch (value.kind) {
    case 'empty':
      return null
    case 'text':
      return value.code ? { text: cut(value.text), code: true } : cut(value.text)
    case 'missing':
    case 'date':
      return value.text
    case 'link':
      return { text: value.text, url: value.href, ...(value.external ? { external: true } : {}) }
    case 'group': {
      const group = value.items.map((item) => toTree(item, help)).filter((item) => item !== null)
      return group.length === 0 ? null : group.length === 1 ? (group[0] as DataTree) : { group }
    }
    case 'badge':
      return { text: value.text, color: value.color }
    case 'list': {
      const items = value.items.map((item) => toTree(item, help)).filter((item) => item !== null)
      return items.length === 0 ? null : items
    }
    case 'object': {
      const entries = value.entries
        .map((entry) => ({
          label: entry.label,
          value: toTree(entry.value, help),
          ...(entry.help === null || !help ? {} : { help: entry.help }),
        }))
        .filter((entry) => entry.value !== null)
      return entries.length === 0 ? null : { entries }
    }
  }
}

/** The value of a top-level field of a record as a display tree. */
export function displayField(site: Site, record: SiteRecord, field: SiteField): Display {
  if (field.kind === 'reference') {
    const items = site
      .referencesOf(record, field.name)
      .map((r): Display =>
        r.target === null
          ? { kind: 'missing', text: r.text, reason: r.unresolved }
          : named(site, r.target, field),
      )
    if (items.length === 0) return { kind: 'empty' }
    return marked(site, record, field, field.list ? { kind: 'list', items } : (items[0] as Display))
  }
  return marked(
    site,
    record,
    field,
    display(site, record, field.name, record.record.data[field.name], undefined, field),
  )
}

/**
 * The fields of a record page in order: the config's sections, then the remaining fields under
 * `Details`, or alone with no heading when the config has no sections. Hidden fields, a `title`
 * field (the page's heading) and fields the record lacks are left out.
 */
export function fieldSections(site: Site, record: SiteRecord): FieldSection[] {
  const fields = record.type.fields
    .filter((f) => !f.nested && !f.hidden && f.name !== 'title')
    .sort((a, b) => a.order - b.order)
  const row = (field: SiteField): FieldRow | null => {
    const value = displayField(site, record, field)
    return value.kind === 'empty' ? null : { field, value }
  }
  const rows = (names: SiteField[]): FieldRow[] => names.map(row).filter((r) => r !== null)
  const sections: FieldSection[] = []
  const placed = new Set<string>()
  for (const section of record.type.sections) {
    const own = section.fields
      .map((name) => fields.find((f) => f.name === name))
      .filter((f) => f !== undefined)
    for (const f of own) placed.add(f.name)
    sections.push({ label: section.label, note: section.note ?? null, rows: rows(own) })
  }
  const rest = rows(fields.filter((f) => !placed.has(f.name)))
  if (rest.length > 0)
    sections.push({ label: sections.length === 0 ? null : 'Details', note: null, rows: rest })
  return sections.filter((s) => s.rows.length > 0)
}

/** The other files of a record's folder, with the address each is served at. */
export function recordFiles(site: Site, record: SiteRecord): { name: string; url: string }[] {
  const folder = record.record.folder
  return record.record.files.map((path) => ({
    name: folder !== null && path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path,
    url: site.fileUrl(record.corpus, path),
  }))
}

/**
 * The records that point at `record`, grouped by their type and then by the field that holds
 * the reference, with links from Markdown bodies last in each type. A record is in a group once.
 */
export function backlinkGroups(site: Site, record: SiteRecord): BacklinkGroup[] {
  const groups = new Map<string, BacklinkGroup>()
  // A related table lists these records already.
  const listed = (from: SiteRecord, fieldName: string | null): boolean =>
    record.type.related.some(
      (related) =>
        from.corpus === '' &&
        related.from === from.type.name &&
        related.via.split('.')[0] === fieldName &&
        site.matches(from, related.where),
    )
  for (const incoming of record.record.incoming) {
    const from = site.record(incoming.from)
    if (from === undefined || from === record) continue
    const fieldName =
      incoming.pointer === null
        ? null
        : (incoming.pointer.split('/')[1] ?? '').replace(/~1/g, '/').replace(/~0/g, '~')
    if (listed(from, fieldName)) continue
    const key = `${from.corpus}\0${from.type.name}\0${fieldName ?? '\0body'}`
    let group = groups.get(key)
    if (group === undefined) {
      const field = fieldName === null ? null : site.field(from.type, fieldName)
      group = {
        type: from.type,
        field: fieldName === null ? null : (field?.label ?? fieldName),
        records: [],
      }
      groups.set(key, group)
    }
    if (!group.records.includes(from)) group.records.push(from)
  }
  const less = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
  return [...groups.values()].sort(
    (a, b) =>
      less(a.type.label, b.type.label) ||
      Number(a.field === null) - Number(b.field === null) ||
      less(a.field ?? '', b.field ?? ''),
  )
}
