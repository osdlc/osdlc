/** What a corpus holds: its summary, its types, and one type's fields as a caller needs them. */
import type { CorpusField, CorpusModel, CorpusType, LoadedCorpus } from '@osdlc/corpus-schema'

import { corporaOf, indexOf, recordsOfType, typeOf } from './model.ts'

/**
 * One type in a list: its name and how many records it has.
 *
 * @experimental
 */
export interface TypeSummary {
  /** The key of the type's corpus: `''` for the loaded corpus. */
  corpus: string
  /** The type's name: its folder name. */
  name: string
  /** The `title` of the type's schema, or null. */
  title: string | null
  /** The `description` of the type's schema, or null. */
  description: string | null
  /** How many records the type has. */
  records: number
}

/**
 * A corpus the loaded one extends or references.
 *
 * @experimental
 */
export interface CorpusLink {
  /** The corpus's key: what a query's `corpus` and a record's `ref` name it by. */
  key: string
  /** The corpus's name. */
  name: string
  /** The corpus's identity, a package URL, or null when it is in no package. */
  identity: string | null
  /** The package's version, or null. */
  version: string | null
  /** How the loaded corpus names it: `indirect` when only a corpus it names does. */
  relation: 'extends' | 'references' | 'extends and references' | 'indirect'
  /** How many records the corpus has. */
  records: number
  /** The names of the corpus's types. */
  types: string[]
}

/**
 * A corpus at a glance.
 *
 * @experimental
 */
export interface CorpusSummary {
  /** The corpus's name: the `<name>` of its root file. */
  name: string
  /** The root file's `id`, or null. */
  id: string | null
  /** The corpus's identity, a package URL, or null when it is in no package. */
  identity: string | null
  /** The package's version, or null. */
  version: string | null
  /** The root file's `level`, or null. */
  level: 1 | 2 | null
  /** How many records the loaded corpus has. */
  records: number
  /** The types of the loaded corpus, by name. */
  types: TypeSummary[]
  /** The corpora it extends or references, at any depth, by key. */
  corpora: CorpusLink[]
  /** How many errors the validator reports for the loaded corpus. */
  errors: number
  /** How many warnings the validator reports for the loaded corpus. */
  warnings: number
}

/**
 * One value a field may hold, with the title its schema gives it.
 *
 * @experimental
 */
export interface FieldValue {
  /** The value, as a record holds it. */
  value: unknown
  /** The `title` the schema gives the value. */
  title?: string
  /** The `description` the schema gives the value. */
  description?: string
}

/**
 * One field of a type.
 *
 * @experimental
 */
export interface FieldDescription {
  /** The property name. */
  name: string
  /** The value's kind in a few words: `string`, `number`, `list of string`, `enum`, `object`. */
  kind: string
  /** The `description` of the field's schema, or null. */
  description: string | null
  /** Whether a record must have the field. */
  required: boolean
  /** The schema's `format`, such as `date`, or null. */
  format: string | null
  /** The values the schema allows, or null when it does not list them. */
  values: FieldValue[] | null
  /** The types the field's values name records of, or null when it is not a reference. */
  ref: { types: string[]; form: 'link' | 'id' | 'wikilink'; list: boolean } | null
  /** The type that declares the field, as the corpus names it. */
  declaredBy: string
}

/**
 * One type in full.
 *
 * @experimental
 */
export interface TypeDescription extends TypeSummary {
  /** Where the type's rules come from: its own schema, a schema that extends another type, or a parent's type used as it is. */
  origin: 'local' | 'extends' | 'uses'
  /** The type's identity, `<corpus identity>#<type>`, or null. */
  identity: string | null
  /** The type, then each type it builds on, as the corpus names them. */
  chain: string[]
  /** The type's top-level fields, in schema order. */
  fields: FieldDescription[]
}

type Schema = Record<string, unknown>
const isSchema = (v: unknown): v is Schema =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

/** The values a schema lists: its `enum`, its `const`, or the `const` of each `oneOf` or `anyOf`. */
function listed(schema: Schema): FieldValue[] | null {
  if (Array.isArray(schema['enum'])) return schema['enum'].map((value: unknown) => ({ value }))
  if ('const' in schema) return [{ value: schema['const'] }]
  const options = schema['oneOf'] ?? schema['anyOf']
  if (!Array.isArray(options) || options.length === 0) return null
  const out: FieldValue[] = []
  for (const o of options) {
    if (!isSchema(o)) return null
    const inner = listed(o)
    if (inner === null) return null
    const title = text(o['title'])
    const description = text(o['description'])
    for (const v of inner)
      out.push({
        ...v,
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description }),
      })
  }
  return out
}

/** The values a field's schema allows, or its items' for a list. Null when it lists none. */
export function valuesOf(schema: unknown): FieldValue[] | null {
  if (!isSchema(schema)) return null
  return listed(schema) ?? (isSchema(schema['items']) ? listed(schema['items']) : null)
}

/** Whether a field's schema allows numbers only. */
export function isNumeric(schema: unknown): boolean {
  if (!isSchema(schema)) return false
  const type = schema['type']
  return type === 'number' || type === 'integer'
}

function kindOf(schema: unknown): string {
  if (!isSchema(schema)) return 'any'
  if (listed(schema) !== null) return 'enum'
  const type = schema['type']
  if (type === 'array')
    return schema['items'] === undefined ? 'list' : `list of ${kindOf(schema['items'])}`
  if (Array.isArray(type)) return type.join(' or ')
  return text(type) ?? 'any'
}

function fieldOf(field: CorpusField): FieldDescription {
  const schema = isSchema(field.schema) ? field.schema : {}
  const items = isSchema(schema['items']) ? schema['items'] : {}
  return {
    name: field.name,
    kind: kindOf(field.schema),
    description: text(schema['description']) ?? null,
    required: field.required,
    format: text(schema['format']) ?? text(items['format']) ?? null,
    values: valuesOf(field.schema),
    ref:
      field.ref === null
        ? null
        : { types: field.ref.types, form: field.ref.form, list: field.ref.items },
    declaredBy: field.declaredBy.name,
  }
}

const summaryOf = (model: LoadedCorpus, corpus: CorpusModel, type: CorpusType): TypeSummary => ({
  corpus: corpus.key,
  name: type.name,
  title: type.title,
  description: type.description,
  records: recordsOfType(model, corpus.key, type.name).length,
})

/**
 * The types of the loaded corpus, of the corpus with key `corpus`, or of every corpus of the
 * graph for `*`, each with its record count.
 *
 * @throws QueryError `unknown-corpus`.
 * @experimental
 */
export function listTypes(model: LoadedCorpus, corpus?: string): TypeSummary[] {
  return corporaOf(model, corpus).flatMap((c) => c.types.map((t) => summaryOf(model, c, t)))
}

/**
 * The loaded corpus at a glance: its name, identity and version, its types with their record
 * counts, and the corpora it extends or references.
 *
 * @experimental
 */
export function describeCorpus(model: LoadedCorpus): CorpusSummary {
  const extended = new Set(Object.values(model.extends))
  const referenced = new Set(Object.values(model.references))
  const corpora: CorpusLink[] = []
  for (const [key, c] of indexOf(model).corpora) {
    if (key === '') continue
    corpora.push({
      key,
      name: c.name,
      identity: c.identity,
      version: c.version,
      relation:
        extended.has(key) && referenced.has(key)
          ? 'extends and references'
          : extended.has(key)
            ? 'extends'
            : referenced.has(key)
              ? 'references'
              : 'indirect',
      records: c.records.length,
      types: c.types.map((t) => t.name),
    })
  }
  return {
    name: model.name,
    id: model.id,
    identity: model.identity,
    version: model.version,
    level: model.level,
    records: model.records.length,
    types: listTypes(model),
    corpora,
    errors: model.errors.length,
    warnings: model.warnings.length,
  }
}

/**
 * One type: its fields with their kinds, descriptions and allowed values, and which fields are
 * references and to what. `name` is a type of the loaded corpus, of the corpus with key
 * `corpus`, or `<prefix>/<type>` for a type of a corpus it extends or references.
 *
 * @throws QueryError `unknown-type` or `unknown-corpus`, with the names that exist.
 * @experimental
 */
export function describeType(model: LoadedCorpus, name: string, corpus?: string): TypeDescription {
  const found = typeOf(model, name, corporaOf(model, corpus === '*' ? '' : corpus)[0])
  return {
    ...summaryOf(model, found.corpus, found.type),
    origin: found.type.origin,
    identity: found.type.identity,
    chain: found.type.chain.map((t) => t.name),
    fields: found.type.fields.map(fieldOf),
  }
}
