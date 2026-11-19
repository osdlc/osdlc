/** Generates TypeScript types for a corpus's records from its type schemas. See `generateTypes`. */
import type { CorpusField, CorpusType, LoadedCorpus } from './load.ts'

type Schema = Record<string, unknown>

const isSchema = (v: unknown): v is Schema =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const key = (name: string): string => (IDENT.test(name) ? name : JSON.stringify(name))
const union = (parts: string[]): string =>
  parts.length === 0 ? 'never' : [...new Set(parts)].join(' | ')
const lit = (v: unknown): string => (v === undefined ? 'unknown' : (JSON.stringify(v) ?? 'unknown'))
const paren = (t: string): string => (/[|&]/.test(t) ? `(${t})` : t)

/** The TypeScript type of the values a JSON Schema accepts. A keyword it does not model gives `unknown`. */
function schemaType(schema: unknown): string {
  if (!isSchema(schema)) return 'unknown'
  if ('const' in schema) return lit(schema.const)
  if (Array.isArray(schema.enum)) return union(schema.enum.map(lit))
  const types = typeof schema.type === 'string' ? [schema.type] : list(schema.type)
  // A combinator is intersected with the `type` beside it.
  const parts: string[] = []
  if (types.length > 0) parts.push(union(types.map((t) => named(String(t), schema))))
  const combined = ['anyOf', 'oneOf', 'allOf'].some((k) => k in schema)
  // With no `type`, `properties` constrain only objects, so beside a combinator they are left out.
  if (types.length === 0 && !combined && isSchema(schema.properties)) parts.push(object(schema))
  for (const k of ['anyOf', 'oneOf']) {
    const alternatives = schema[k]
    if (Array.isArray(alternatives) && alternatives.length > 0)
      parts.push(union(alternatives.map(branchType)))
  }
  if (Array.isArray(schema.allOf)) parts.push(...schema.allOf.map(branchType))
  const known = parts.filter((p) => p !== 'unknown')
  return known.length === 0
    ? 'unknown'
    : (known.length === 1 ? known : known.map(paren)).join(' & ')
}

/** A combinator's branch. One with only `properties` accepts every non-object, so it is `unknown`. */
const branchType = (branch: unknown): string =>
  isSchema(branch) && branch.type === undefined && isSchema(branch.properties)
    ? 'unknown'
    : schemaType(branch)

function named(type: string, schema: Schema): string {
  switch (type) {
    case 'string':
      return 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'array': {
      const prefix = list(schema.prefixItems)
      if (prefix.length > 0) {
        const head = prefix.map(schemaType).join(', ')
        return schema.items === false
          ? `[${head}]`
          : `[${head}, ...${paren(schemaType(schema.items))}[]]`
      }
      return `${paren(schemaType(schema.items))}[]`
    }
    case 'object':
      return object(schema)
    default:
      return 'unknown'
  }
}

function object(schema: Schema): string {
  const props = isSchema(schema.properties) ? schema.properties : {}
  const required = new Set(list(schema.required))
  const members = Object.entries(props).map(
    ([name, s]) => `${key(name)}${required.has(name) ? '' : '?'}: ${schemaType(s)}`,
  )
  const extra = schema.additionalProperties
  if (extra === false)
    return members.length === 0 ? 'Record<string, never>' : `{ ${members.join('; ')} }`
  const rest = extra === undefined || extra === true ? 'unknown' : schemaType(extra)
  if (members.length === 0) return `Record<string, ${rest}>`
  // Each member must be assignable to the index type.
  const optional = Object.keys(props).some((name) => !required.has(name))
  const index =
    rest === 'unknown'
      ? rest
      : union([rest, ...Object.values(props).map(schemaType), ...(optional ? ['undefined'] : [])])
  return `{ ${members.join('; ')}; [key: string]: ${index} }`
}

const fieldType = (f: CorpusField): string => {
  if (f.ref === null) return schemaType(f.schema)
  const ref = `Ref<${union(f.ref.types.map(lit))}>`
  // A null is a value the schema may allow; it names no record.
  const nullable = isSchema(f.schema) && list([f.schema.type].flat()).includes('null')
  const type = f.ref.items ? `${ref}[]` : ref
  return nullable ? `${type} | null` : type
}

/** `notes-and-more` as `NotesAndMore`, never empty and never starting with a digit. */
const pascal = (name: string): string => {
  const s = name
    .split(/[^A-Za-z0-9]+/)
    .filter((p) => p !== '')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
  return /^[A-Za-z]/.test(s) ? s : `T${s}`
}

/** Names the generated module declares or uses itself, so no type's interface may take one. */
const RESERVED_NAMES = ['Ref', 'CorpusTypes', 'Record', 'Array']

/** The interface name of each type: its folder name in PascalCase, made unique with a number. */
function names(types: CorpusType[]): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set(RESERVED_NAMES)
  for (const t of types) {
    let n = pascal(t.name)
    for (let i = 2; taken.has(n); i++) n = `${pascal(t.name)}${i}`
    taken.add(n)
    out.set(t.name, n)
  }
  return out
}

/**
 * The source of a TypeScript module typing the records of `model`: an interface per type holding
 * the record's data, with the fields of its whole `x-extends` chain; `Ref<T>` for a field that
 * names a record; and `CorpusTypes`, mapping each type name to its interface. The types of the
 * corpora it extends or references are not emitted, but a field that names one is a `Ref` of its
 * name.
 *
 * @experimental
 */
export function generateTypes(model: LoadedCorpus): string {
  const ids = names(model.types)
  const out = [
    '// Generated by `corpus-schema types`. Do not edit.',
    '',
    '/** A link, id or wikilink to a record of a type named in `T`. */',
    'export type Ref<T extends string = string> = string & { readonly __ref?: T }',
  ]
  for (const t of model.types) {
    out.push('')
    if (t.description !== null)
      out.push(
        '/**',
        ...t.description.split('\n').map((l) => ` * ${l.replace(/\*\//g, '* /')}`.trimEnd()),
        ' */',
      )
    out.push(`export interface ${ids.get(t.name)} {`)
    for (const f of t.fields) out.push(`  ${key(f.name)}${f.required ? '' : '?'}: ${fieldType(f)}`)
    out.push('}')
  }
  out.push(
    '',
    "/** The data type of each type's records, by name. */",
    'export interface CorpusTypes {',
  )
  for (const t of model.types) out.push(`  ${key(t.name)}: ${ids.get(t.name)}`)
  out.push('}', '')
  return out.join('\n')
}
