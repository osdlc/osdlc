/**
 * A record as a page shows it: each field's value as a small tree the templates draw, the
 * record folder's files, and the records that point at it.
 */
import type { BadgeColor } from './config.ts'
import { formatScalar } from './format.ts'
import { fieldSchemaAt, humanize, shapeOf } from './schema.ts'
import {
  parseWholeLink,
  safeDecode,
  type Site,
  type SiteField,
  type SiteRecord,
  type SiteType,
} from './site.ts'

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

/** What the schemas and the config say about the field at `path`, top-level or nested. */
function fieldAt(
  site: Site,
  type: SiteType,
  path: string,
): Pick<SiteField, 'label' | 'help' | 'kind' | 'format' | 'options'> {
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
  }
}

function scalar(
  site: Site,
  record: SiteRecord,
  field: Pick<SiteField, 'kind' | 'format' | 'options'>,
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
      return { kind: 'link', text: link.text || link.href, href: link.href, external: true }
    if (/^https?:\/\/\S+$/.test(value))
      return { kind: 'link', text: value, href: value, external: true }
    if (field.format.kind === 'date' || field.format.kind === 'datetime')
      return { kind: 'date', text: formatScalar(value, field.format, site.locale), iso: value }
  }
  return {
    kind: 'text',
    text: formatScalar(value, field.format, site.locale),
    code: field.format.kind === 'code',
  }
}

/** The value at `path` of a record as a display tree. */
function display(site: Site, record: SiteRecord, path: string, value: unknown): Display {
  const field = fieldAt(site, record.type, path)
  if (value === undefined || value === null || value === '') return { kind: 'empty' }
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'empty' }
    return { kind: 'list', items: value.map((v) => display(site, record, path, v)) }
  }
  if (isObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return { kind: 'empty' }
    return {
      kind: 'object',
      entries: entries.map(([key, v]) => {
        const at = fieldAt(site, record.type, `${path}.${key}`)
        return { label: at.label, help: at.help, value: display(site, record, `${path}.${key}`, v) }
      }),
    }
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return scalar(site, record, field, value)
  return { kind: 'text', text: String(value), code: false }
}

/** The value of a top-level field of a record as a display tree. */
export function displayField(site: Site, record: SiteRecord, field: SiteField): Display {
  if (field.kind === 'reference') {
    const items = site.referencesOf(record, field.name).map((r): Display => {
      if (r.target === null) return { kind: 'missing', text: r.text, reason: r.unresolved }
      if (r.target.url === null) return { kind: 'text', text: r.target.title, code: false }
      return { kind: 'link', text: r.target.title, href: r.target.url, external: !r.target.local }
    })
    if (items.length === 0) return { kind: 'empty' }
    return field.list ? { kind: 'list', items } : (items[0] as Display)
  }
  return display(site, record, field.name, record.record.data[field.name])
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
  for (const incoming of record.record.incoming) {
    const from = site.record(incoming.from)
    if (from === undefined || from === record) continue
    const fieldName =
      incoming.pointer === null
        ? null
        : (incoming.pointer.split('/')[1] ?? '').replace(/~1/g, '/').replace(/~0/g, '~')
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
