/**
 * Reads a tool's config keys from its schema. A `config list|explain` command
 * and the generated reference are built on these functions.
 *
 * Everything is derived at call time from the tool's config schema and its
 * per-key `.meta()` ({@link readConfigMeta}). Nothing here names a key, so a
 * new or changed key shows up everywhere without an edit. Functions take the
 * schema's top-level `shape` as an argument. The tool passes its own schema.
 *
 *   - {@link resolveKeyPath} walks a dotted path (`server.limits.timeout`,
 *     `hooks.build`) through object fields and record values to the field's
 *     schema. It returns the schema with its own description and its top-level
 *     section's meta (nested fields inherit their section's).
 *   - {@link describeShape} renders a field's value shape as a short type string
 *     (`map<string, list<string>>`, `integer >= 0`, `'rebase' | 'merge'`)
 *     from its JSON Schema (Zod 4's `z.toJSONSchema`).
 *   - {@link defaultOf} is the value a field takes when unset: the schema's
 *     own parse of `undefined`, so `.default()`, `.prefault()` and
 *     `.optional()` all answer the same way the loader would.
 *   - {@link nestedFields} lists an object field's children.
 *   - {@link omitPath} removes a value from a plain object by path; `getIn`
 *     (`./value.ts`) reads one. A lookup of where a value came from is built
 *     from them.
 */

import { z } from 'zod'

import { closestMatches, didYouMean } from './did-you-mean.ts'
import {
  readConfigMeta,
  type MetaTerms,
  type MetaValidator,
  type RegisteredKeyMeta,
} from './meta.ts'
import { kindOf, shapeOf, unwrapSchema, walkKeyPath } from './schema.ts'

/**
 * The parsed meta of every top-level key of `shape`, in declaration order,
 * checked against `vocabulary` when one is given (`./vocabulary.ts`).
 * @experimental
 */
export function topLevelKeys<T extends MetaTerms = MetaTerms>(
  shape: Record<string, z.ZodType>,
  vocabulary?: MetaValidator<T>,
): Record<string, RegisteredKeyMeta<T>> {
  return readConfigMeta(shape, vocabulary)
}

/**
 * A resolved dotted key path.
 *
 * @experimental
 */
export interface ResolvedKey<T extends MetaTerms = MetaTerms> {
  /** The path segments, e.g. `['server', 'limits', 'timeout']`. */
  path: string[]
  /** The top-level section the path starts in. */
  section: string
  /** The field's own schema (wrappers intact, so defaults resolve). */
  schema: z.ZodType
  /** The field's own `.describe()` text; empty when it carries none. */
  description: string
  /** The section's meta. A nested field inherits it. */
  meta: RegisteredKeyMeta<T>
}

/**
 * Split `a.b.c` into segments; rejects empty segments.
 *
 * @experimental
 */
export function splitKeyPath(key: string): string[] {
  const path = key.trim().split('.')
  if (path.length === 0 || path.some((s) => s === '')) {
    throw new Error(`invalid key path '${key}': use dotted segments like 'server.limits.timeout'`)
  }
  return path
}

/**
 * Options for resolving a dotted key path against a section schema.
 * @experimental
 */
export interface ResolveKeyPathOptions<T extends MetaTerms = MetaTerms> {
  /** The config file's name, used in {@link resolveKeyPath}'s messages, e.g. `tooly.yaml`. */
  file?: string
  /** The vocabulary the section meta is checked against and typed by. */
  vocabulary?: MetaValidator<T>
}

/**
 * Walk `path` through the config `shape`: object fields by name, record
 * (`z.record`) values by any key. Throws an `Error` that names the first
 * segment that does not resolve. The message lists the closest keys when any
 * are close, and otherwise the keys that would have resolved.
 * @experimental
 */
export function resolveKeyPath<T extends MetaTerms = MetaTerms>(
  shape: Record<string, z.ZodType>,
  path: readonly string[],
  opts: ResolveKeyPathOptions<T> = {},
): ResolvedKey<T> {
  const metas = topLevelKeys(shape, opts.vocabulary)
  const [section, ...rest] = path as [string, ...string[]]
  const top = shape[section]
  if (top === undefined) {
    const hint = didYouMean(section, Object.keys(metas))
    throw new Error(
      `unknown ${opts.file ?? 'config'} key '${section}'` +
        (hint !== null ? `; ${hint}` : ` (known: ${Object.keys(metas).join(', ')})`),
    )
  }
  const walk = walkKeyPath(top as z.ZodTypeAny, rest)
  if (!walk.ok) {
    const walked = [section, ...rest.slice(0, walk.at)]
    const seg = rest[walk.at]!
    if (walk.reason === 'not_mapping') {
      throw new Error(`'${walked.join('.')}' is not a mapping, so '${seg}' cannot be under it`)
    }
    const known = Object.keys(shapeOf(unwrapSchema(walk.parent)))
    const bad = [...walked, seg].join('.')
    const prefix = `${walked.join('.')}.`
    const close = closestMatches(seg, known)
    const hint =
      close.length > 0 ? `did you mean: ${close.map((k) => prefix + k).join(', ')}?` : null
    throw new Error(
      `unknown key '${bad}'` +
        (hint !== null
          ? `; ${hint}`
          : known.length > 0
            ? ` (known under ${walked.join('.')}: ${known.join(', ')})`
            : ` (${walked.join('.')} defines no fields)`),
    )
  }
  const schema = walk.schema as z.ZodType
  return {
    path: [...path],
    section,
    schema,
    description: descriptionOf(schema),
    meta: metas[section]!,
  }
}

/**
 * A schema's `.describe()` text, trimmed; empty when absent.
 *
 * @experimental
 */
export function descriptionOf(schema: z.ZodType): string {
  return String(schema.description ?? '').trim()
}

/**
 * The value a field takes when unset (`undefined` when it has none).
 *
 * @experimental
 */
export function defaultOf(schema: z.ZodType): unknown {
  const r = schema.safeParse(undefined)
  return r.success ? r.data : undefined
}

/**
 * One child of an object-valued field.
 *
 * @experimental
 */
export interface NestedField {
  name: string
  description: string
  shape: string
  default: unknown
}

/**
 * The children of an object-valued field; empty for any other shape.
 *
 * @experimental
 */
export function nestedFields(schema: z.ZodType): NestedField[] {
  if (kindOf(schema as z.ZodTypeAny) !== 'object') return []
  return Object.entries(shapeOf(unwrapSchema(schema as z.ZodTypeAny))).map(([name, child]) => ({
    name,
    description: descriptionOf(child),
    shape: describeShape(child),
    default: defaultOf(child),
  }))
}

/** Keys `z.toJSONSchema` emits that describe prose/meta, not shape. */
const NON_SHAPE_KEYS = new Set([
  '$schema',
  'description',
  'default',
  'category',
  'consumers',
  'layers',
  'applies_via',
  'runs_in',
])

/**
 * The field's JSON Schema (input side, so defaults read as optional), with
 * prose and meta stripped at every level so only the shape remains.
 * @experimental
 */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }) as Record<
    string,
    unknown
  >
  return stripNonShape(raw) as Record<string, unknown>
}

function stripNonShape(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNonShape)
  if (v === null || typeof v !== 'object') return v
  const out: Record<string, unknown> = {}
  for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
    if (NON_SHAPE_KEYS.has(k)) continue
    // `properties` maps field names to schemas. Never strip a name.
    if (k === 'properties' && child !== null && typeof child === 'object') {
      out[k] = Object.fromEntries(
        Object.entries(child as Record<string, unknown>).map(([name, s]) => [
          name,
          stripNonShape(s),
        ]),
      )
      continue
    }
    out[k] = stripNonShape(child)
  }
  return out
}

/**
 * A short, human-readable type string for a field's value.
 *
 * @experimental
 */
export function describeShape(schema: z.ZodType): string {
  return renderShape(jsonSchemaOf(schema))
}

function renderShape(s: Record<string, unknown>): string {
  if (Array.isArray(s['enum'])) return (s['enum'] as unknown[]).map(literal).join(' | ')
  if ('const' in s) return literal(s['const'])
  const alts = (s['anyOf'] ?? s['oneOf']) as Record<string, unknown>[] | undefined
  if (Array.isArray(alts)) {
    const parts = [...new Set(alts.map(renderShape))]
    return parts.join(' | ')
  }
  if (Array.isArray(s['allOf']))
    return (s['allOf'] as Record<string, unknown>[]).map(renderShape).join(' & ')
  const type = s['type']
  if (Array.isArray(type)) return type.map((t) => renderShape({ ...s, type: t })).join(' | ')
  switch (type) {
    case 'string': {
      if (typeof s['pattern'] === 'string') return `string /${s['pattern']}/`
      if (typeof s['format'] === 'string') return `string (${s['format']})`
      return 'string'
    }
    case 'integer':
    case 'number':
      return `${type}${bounds(s)}`
    case 'boolean':
    case 'null':
      return type
    case 'array': {
      const items = s['items']
      return items !== null && typeof items === 'object' && !Array.isArray(items)
        ? `list<${renderShape(items as Record<string, unknown>)}>`
        : 'list'
    }
    case 'object': {
      const props = s['properties'] as Record<string, unknown> | undefined
      const extra = s['additionalProperties']
      if (props !== undefined && Object.keys(props).length > 0) return 'object'
      const names = s['propertyNames'] as Record<string, unknown> | undefined
      const keyShape = names !== undefined ? renderShape(names) : 'string'
      if (extra !== null && typeof extra === 'object') {
        return `map<${keyShape}, ${renderShape(extra as Record<string, unknown>)}>`
      }
      if (extra === false) return 'object (no fields)'
      return `map<${keyShape}, any>`
    }
    default:
      return 'any'
  }
}

/** `.int()` alone emits the safe-integer range as bounds; that is not a constraint worth printing. */
function bounds(s: Record<string, unknown>): string {
  const parts: string[] = []
  const min = s['minimum']
  const max = s['maximum']
  if (typeof min === 'number' && min !== Number.MIN_SAFE_INTEGER) parts.push(`>= ${min}`)
  if (typeof s['exclusiveMinimum'] === 'number') parts.push(`> ${s['exclusiveMinimum']}`)
  if (typeof max === 'number' && max !== Number.MAX_SAFE_INTEGER) parts.push(`<= ${max}`)
  if (typeof s['exclusiveMaximum'] === 'number') parts.push(`< ${s['exclusiveMaximum']}`)
  return parts.length > 0 ? ` ${parts.join(', ')}` : ''
}

function literal(v: unknown): string {
  return typeof v === 'string' ? `'${v}'` : JSON.stringify(v)
}

/**
 * A copy of `obj` with `path` removed. Sibling keys are not touched. Only the
 * objects on the path down to the removed key are shallow-copied. Use it to
 * leave one key's value out of a layer's raw data before computing the
 * effective config, since the layer's other keys still need their full data.
 * Returns `obj` unchanged when `path` does not resolve inside `obj`.
 * @experimental
 */
export function omitPath(
  obj: Record<string, unknown>,
  path: readonly string[],
): Record<string, unknown> {
  const [head, ...rest] = path
  if (head === undefined || !Object.hasOwn(obj, head)) return obj
  if (rest.length === 0) {
    const next = { ...obj }
    delete next[head]
    return next
  }
  const child = obj[head]
  if (child === null || typeof child !== 'object' || Array.isArray(child)) return obj
  return { ...obj, [head]: omitPath(child as Record<string, unknown>, rest) }
}
