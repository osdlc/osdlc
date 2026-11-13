/**
 * What a field's JSON Schema says about how to show it: its kind, its enum values, and the
 * control, columns and filters a type gets when its config names none.
 */
import type { CorpusField, CorpusType, FieldRef } from '@osdlc/corpus-schema'
import type { ControlKind } from './config.ts'

/**
 * What a field holds. `reference` is an `x-ref` field. `enum` has a fixed set of values.
 * `json` is an object or a mixed value, which gets no column and no filter.
 */
export type FieldKind =
  'reference' | 'enum' | 'boolean' | 'number' | 'date' | 'datetime' | 'url' | 'text' | 'json'

/** One value of an enum field, with the `title` a `oneOf` `const` gives it. */
export interface EnumOption {
  value: string
  label: string
  description: string | null
}

/** What a field's schema says. */
export interface FieldShape {
  kind: FieldKind
  /** Whether the field holds a list of such values. */
  list: boolean
  /** The values of an `enum` field, in schema order. Empty for other kinds. */
  options: EnumOption[]
}

type Schema = Record<string, unknown>

const isObject = (v: unknown): v is Schema =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A field name in words: `version_basis` and `reportedIn` become `Version basis` and `Reported in`. */
export function humanize(name: string): string {
  const words = name
    .split('.')
    .pop()!
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A local `#/$defs/x` reference followed in `root`, or the schema itself. */
function deref(schema: unknown, root: Schema | null): Schema | undefined {
  if (!isObject(schema)) return undefined
  const ref = schema['$ref']
  if (typeof ref !== 'string' || !ref.startsWith('#/') || root === null) return schema
  let at: unknown = root
  for (const part of ref.slice(2).split('/')) {
    if (!isObject(at)) return schema
    at = at[part.replace(/~1/g, '/').replace(/~0/g, '~')]
  }
  // Keywords beside `$ref`, such as a description, still apply.
  return isObject(at) ? { ...at, ...schema, $ref: undefined } : schema
}

/**
 * The schema of the field `path` names in `type`: a top-level field, or with dots a property
 * inside an object field (`scope.platform`) or inside the items of a list field. Undefined when the schemas declare no such field.
 */
export function fieldSchemaAt(type: CorpusType, path: string): Schema | undefined {
  const [head, ...rest] = path.split('.')
  const field = type.fields.find((f) => f.name === head)
  if (field === undefined) return undefined
  let schema = deref(field.schema, type.schema)
  for (const part of rest) {
    // A path steps through a list to the fields of its items.
    if (schema?.['properties'] === undefined && isObject(schema?.['items']))
      schema = deref(schema['items'], type.schema)
    const properties = schema?.['properties']
    if (!isObject(properties) || !Object.hasOwn(properties, part)) return undefined
    schema = deref(properties[part], type.schema)
  }
  return schema
}

/** The JSON types a schema allows, without `null`. */
function typesOf(schema: Schema): string[] {
  const type = schema['type']
  const types = Array.isArray(type) ? type : typeof type === 'string' ? [type] : []
  return types.filter((t): t is string => typeof t === 'string' && t !== 'null')
}

/** The enum values of a schema: `enum`, a `const`, or `oneOf`/`anyOf` of `const` with `title`. */
function enumOptions(schema: Schema): EnumOption[] | null {
  const option = (value: unknown, from?: Schema): EnumOption | null =>
    typeof value === 'string' || typeof value === 'number'
      ? {
          value: String(value),
          label: typeof from?.['title'] === 'string' ? from['title'] : String(value),
          description: typeof from?.['description'] === 'string' ? from['description'] : null,
        }
      : null
  if (Array.isArray(schema['enum'])) {
    const options = schema['enum'].filter((v) => v !== null).map((v) => option(v))
    return options.every((o) => o !== null) && options.length > 0 ? (options as EnumOption[]) : null
  }
  for (const keyword of ['oneOf', 'anyOf']) {
    const branches = schema[keyword]
    if (!Array.isArray(branches) || branches.length === 0) continue
    const options = branches
      .filter((b) => !(isObject(b) && b['type'] === 'null'))
      .map((b) => (isObject(b) && 'const' in b ? option(b['const'], b) : null))
    if (options.length > 0 && options.every((o) => o !== null)) return options as EnumOption[]
  }
  return null
}

function scalarShape(schema: Schema): Omit<FieldShape, 'list'> {
  const options = enumOptions(schema)
  if (options !== null) return { kind: 'enum', options }
  const types = typesOf(schema)
  const only = types.length === 1 ? types[0] : undefined
  if (only === 'boolean') return { kind: 'boolean', options: [] }
  if (only === 'number' || only === 'integer') return { kind: 'number', options: [] }
  if (only === 'string') {
    const format = schema['format']
    if (format === 'date') return { kind: 'date', options: [] }
    if (format === 'date-time') return { kind: 'datetime', options: [] }
    if (format === 'uri' || format === 'url' || format === 'iri')
      return { kind: 'url', options: [] }
    return { kind: 'text', options: [] }
  }
  return { kind: 'json', options: [] }
}

/**
 * What `schema` says about a field: its kind, whether it is a list, and its enum values. `ref`
 * is the field's `x-ref`, which makes it a reference whatever its type.
 */
export function shapeOf(
  schema: unknown,
  ref: FieldRef | null,
  root: Schema | null = null,
): FieldShape {
  if (ref !== null) return { kind: 'reference', list: ref.items, options: [] }
  const resolved = deref(schema, root)
  if (resolved === undefined) return { kind: 'json', list: false, options: [] }
  if (typesOf(resolved).join() === 'array') {
    const items = deref(resolved['items'], root)
    if (items === undefined) return { kind: 'json', list: true, options: [] }
    const shape = scalarShape(items)
    // A list of objects is one value to show, not a list of values to filter by.
    return shape.kind === 'json'
      ? { kind: 'json', list: false, options: [] }
      : { ...shape, list: true }
  }
  return { ...scalarShape(resolved), list: false }
}

/** The shape of the field `path` names in `type`. Json when the schemas declare no such field. */
export function fieldShape(type: CorpusType, path: string): FieldShape {
  const top = type.fields.find((f) => f.name === path)
  return shapeOf(fieldSchemaAt(type, path), top?.ref ?? null, type.schema)
}

/** The most enum values that are drawn as chips. More become a select. */
export const MAX_CHIPS = 6

/**
 * The control a field gets when its config names none: chips or a select for an enum, a toggle
 * for a boolean, a range for a number or a date, a select for a reference and a text box for
 * text. A json field gets none.
 */
export function defaultControl(shape: FieldShape): ControlKind {
  switch (shape.kind) {
    case 'enum':
      return shape.options.length <= MAX_CHIPS ? 'chips' : 'select'
    case 'boolean':
      return 'toggle'
    case 'number':
    case 'date':
    case 'datetime':
      return 'range'
    case 'reference':
      return 'select'
    case 'text':
    case 'url':
      return 'search'
    case 'json':
      return 'hidden'
  }
}

/** The most columns and filters a type gets by default. */
export const MAX_DEFAULT_COLUMNS = 5
export const MAX_DEFAULT_FILTERS = 6

const COLUMN_RANK: Record<FieldKind, number> = {
  enum: 0,
  reference: 1,
  date: 2,
  datetime: 2,
  boolean: 3,
  number: 3,
  text: 4,
  url: 5,
  json: 9,
}

/**
 * The columns a type gets when its config names none: `title` first, then up to four fields.
 * Required fields come before optional ones, then enums, references, dates, booleans and
 * numbers, then text. Lists of references, json fields and a `title` field are left out.
 */
export function defaultColumns(fields: { field: CorpusField; shape: FieldShape }[]): string[] {
  const ranked = fields
    .filter(({ field, shape }) => {
      if (field.name === 'title' || shape.kind === 'json' || shape.kind === 'url') return false
      return !(shape.list && shape.kind !== 'enum')
    })
    .map((f, index) => ({ ...f, index }))
    .sort(
      (a, b) =>
        Number(b.field.required) - Number(a.field.required) ||
        COLUMN_RANK[a.shape.kind] - COLUMN_RANK[b.shape.kind] ||
        a.index - b.index,
    )
  return ['title', ...ranked.slice(0, MAX_DEFAULT_COLUMNS - 1).map((f) => f.field.name)]
}

/**
 * The filters a type gets when its config names none: its enum, boolean, reference, date and
 * number fields in schema order, up to six. Text fields get none: the search box covers them.
 */
export function defaultFilters(fields: { field: CorpusField; shape: FieldShape }[]): string[] {
  return fields
    .filter(({ shape }) => !['text', 'url', 'json'].includes(shape.kind))
    .slice(0, MAX_DEFAULT_FILTERS)
    .map((f) => f.field.name)
}
