/**
 * The publisher's config: what a site says about a corpus that its schemas do not hold. Every
 * value is JSON, so a config can live in a `.json` file as well as in a module.
 */
import type { LoadedCorpus } from '@osdlc/corpus-schema'
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
}

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
  /** Groups of fields on the record page. Fields in no group follow under `Details`. */
  sections?: SectionConfig[]
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
    const fieldNames = corpusType.fields.map((f) => f.name)
    const known = (field: string): boolean =>
      field === 'title' || fieldSchemaAt(corpusType, field) !== undefined
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

/** Throw a `CorpusSiteConfigError` when `configProblems` finds any. */
export function validateConfig(config: CorpusSiteConfig, model: LoadedCorpus): void {
  const problems = configProblems(config, model)
  if (problems.length > 0) throw new CorpusSiteConfigError(problems)
}
