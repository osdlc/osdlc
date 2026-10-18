/**
 * The v2 schema compiler — a JSON Schema 2020-12 SUBSET → Zod.
 *
 * v2 replaces the v1 house dialect with standard JSON Schema spellings: `properties` /
 * `required` / `additionalProperties` for objects (optional-by-default — the JSON Schema
 * inversion of v1's optional-by-flag), `items` / `minItems` / `maxItems` for arrays,
 * `minLength` / `maxLength` / `pattern` / `format` for strings (a `format` now COMPOSES with
 * the length/pattern constraints), `minimum` / `maximum` for numbers, `type: integer`, and a
 * two-element `[T, "null"]` type union for nullability. `enum` / `const` / `default` /
 * `description` carry over; a `const` value is validated (string | number | boolean), where
 * v1 blindly cast.
 *
 * The vocabulary is CLOSED per node shape (this fixes a real v1 bug — v1 ignored unknown
 * schema keys): after the base is picked, every present key must be in that node-shape's
 * allowed set. Rejections speak three distinct dialects:
 *   a. a v1 spelling (`fields`, `of`, `strict`, …) → a migration hint naming the v2 form;
 *   b. recognized JSON Schema outside the subset (`oneOf`, `$ref`, `patternProperties`, …)
 *      → "outside the supported v2 subset";
 *   c. anything else → "unknown key", with a did-you-mean suggestion when a supported key
 *      is within Levenshtein distance 1–2.
 */
import { z } from 'zod'

import { DeclarativeError } from './errors.js'

/**
 * The closed `format` vocabulary: the string formats Zod
 * and JSON Schema both expose out of the box, each mapped to its Zod constructor. Deliberately
 * broad so common shapes never fall back to a hand-written `pattern`; anything outside the set
 * is a `pattern`. In v2 a format COMPOSES with the length/pattern constraints.
 */
const STRING_FORMATS: Record<string, () => z.ZodType> = {
  // web / identity
  email: () => z.email(),
  url: () => z.url(),
  uuid: () => z.uuid(),
  hostname: () => z.hostname(),
  // ISO-8601 temporals
  datetime: () => z.iso.datetime(),
  date: () => z.iso.date(),
  time: () => z.iso.time(),
  duration: () => z.iso.duration(),
  // network
  ipv4: () => z.ipv4(),
  ipv6: () => z.ipv6(),
  cidrv4: () => z.cidrv4(),
  cidrv6: () => z.cidrv6(),
  // id forms
  nanoid: () => z.nanoid(),
  cuid: () => z.cuid(),
  cuid2: () => z.cuid2(),
  ulid: () => z.ulid(),
  // misc
  base64: () => z.base64(),
  emoji: () => z.emoji(),
  e164: () => z.e164(),
}

const describeValue = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v

const isMap = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

// ── The closed per-node-shape key vocabulary ─────────────────────────────────────

/** The six base types of the v2 subset. */
const BASE_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object'])

/** Keys every node shape admits beside its base selector. */
const COMMON_KEYS = ['default', 'description'] as const

/** The extra keys each `type` admits. */
const TYPE_KEYS: Record<string, readonly string[]> = {
  string: ['minLength', 'maxLength', 'pattern', 'format'],
  number: ['minimum', 'maximum'],
  integer: ['minimum', 'maximum'],
  boolean: [],
  array: ['items', 'minItems', 'maxItems'],
  object: ['properties', 'required', 'additionalProperties'],
}

/** v1 spellings → the v2 form the migration hint names. */
const V1_SPELLINGS: Record<string, string> = {
  fields: "'properties'",
  of: "'items'",
  strict: "'additionalProperties: false'",
  int: "'type: integer'",
  nullable: 'a [T, "null"] type union',
  optional: "omission from 'required'",
  min: "'minLength' / 'minimum' / 'minItems'",
  max: "'maxLength' / 'maximum' / 'maxItems'",
}

/** Recognized JSON Schema 2020-12 keywords deliberately OUTSIDE the v2 subset. */
const OUTSIDE_SUBSET = new Set([
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  '$ref',
  '$defs',
  '$id',
  '$schema',
  '$comment',
  'prefixItems',
  'contains',
  'minContains',
  'maxContains',
  'uniqueItems',
  'patternProperties',
  'propertyNames',
  'minProperties',
  'maxProperties',
  'dependentRequired',
  'dependentSchemas',
  'multipleOf',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contentEncoding',
  'contentMediaType',
  'title',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
])

// ── Rejection: the three dialects ────────────────────────────────────────────────

/** Plain Levenshtein edit distance (insert / delete / substitute), for did-you-mean. */
function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: a.length + 1 }, (_, i) => i)
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]!
    dp[0] = j
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i]!
      dp[i] = Math.min(dp[i]! + 1, dp[i - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[a.length]!
}

/** The nearest allowed key within edit distance 1–2, if any (did-you-mean). */
function suggestionFor(key: string, allowed: Iterable<string>): string | undefined {
  let best: string | undefined
  let bestDist = 3
  for (const candidate of allowed) {
    const d = levenshtein(key, candidate)
    if (d >= 1 && d < bestDist) {
      best = candidate
      bestDist = d
    }
  }
  return best
}

/**
 * Enforce the closed per-node vocabulary: every present key must be in `allowed`. A violation
 * throws in one of the three rejection dialects (v1 spelling / outside the subset / unknown).
 */
function assertAllowedKeys(n: Record<string, unknown>, allowed: Set<string>, path: string): void {
  for (const key of Object.keys(n)) {
    if (allowed.has(key)) continue
    const v1 = V1_SPELLINGS[key]
    if (v1 !== undefined) {
      throw new DeclarativeError(
        `${path}: '${key}' is the v1 spelling — v2 uses ${v1} (markdown-contract migrate rewrites v1 files)`,
      )
    }
    if (OUTSIDE_SUBSET.has(key)) {
      throw new DeclarativeError(`${path}: '${key}' is JSON Schema outside the supported v2 subset`)
    }
    const suggestion = suggestionFor(key, allowed)
    throw new DeclarativeError(
      `${path}: unknown key '${key}'` +
        (suggestion !== undefined ? ` (did you mean '${suggestion}'?)` : ''),
    )
  }
}

// ── Constraint-value readers ─────────────────────────────────────────────────────

/** Read an optional numeric constraint (`minLength`, `maximum`, …), rejecting a wrong type. */
function numberKey(n: Record<string, unknown>, key: string, path: string): number | undefined {
  if (!(key in n)) return undefined
  const v = n[key]
  if (typeof v !== 'number') throw new DeclarativeError(`${path}.${key} must be a number`)
  return v
}

// ── The compiler ─────────────────────────────────────────────────────────────────

/** Compile one v2 schema node (the JSON Schema subset) into a Zod schema. */
export function compileSchemaV2(node: unknown, path = 'schema'): z.ZodType {
  if (!isMap(node)) {
    throw new DeclarativeError(`${path}: a schema must be a mapping (got ${describeValue(node)})`)
  }
  const n = node

  const selectors = (['type', 'enum', 'const'] as const).filter((k) => k in n)
  if (selectors.length !== 1) {
    throw new DeclarativeError(
      `${path}: a schema needs exactly one of type / enum / const` +
        (selectors.length > 1 ? ` (got ${selectors.join(' + ')})` : ''),
    )
  }

  // Pick the node shape, enforce the closed key vocabulary for that shape (the v1-spelling /
  // outside-subset / unknown-key rejections fire here, before any constraint is compiled),
  // then build the base schema.
  let base: z.ZodType
  let nullable = false
  const selector = selectors[0]!
  if (selector === 'enum') {
    assertAllowedKeys(n, new Set(['enum', ...COMMON_KEYS]), path)
    base = enumSchema(n, path)
  } else if (selector === 'const') {
    assertAllowedKeys(n, new Set(['const', ...COMMON_KEYS]), path)
    base = constSchema(n, path)
  } else {
    const resolved = resolveType(n.type, path)
    nullable = resolved.nullable
    assertAllowedKeys(n, new Set(['type', ...TYPE_KEYS[resolved.base]!, ...COMMON_KEYS]), path)
    base = typedSchema(n, resolved.base, path)
  }

  // Wrappers, innermost-first: base → nullable (from the type union) → default → description.
  // The `.optional()` from required-absence is the OBJECT compiler's to apply (outermost).
  let schema: z.ZodType = base
  if (nullable) schema = schema.nullable()
  if ('default' in n) schema = schema.default(n.default as never)
  if ('description' in n) {
    if (typeof n.description !== 'string') {
      throw new DeclarativeError(`${path}.description must be a string`)
    }
    schema = schema.describe(n.description)
  }
  return schema
}

/**
 * Compile the frontmatter ROOT: a v2 `frontmatter:` must be a schema node with an explicit
 * `type: object` — v2 frontmatter IS an object schema (properties / required /
 * additionalProperties), not v1's `strict` / `fields` mapping.
 */
export function compileObjectSchemaV2(node: unknown, path = 'frontmatter'): z.ZodType {
  if (!isMap(node) || node.type !== 'object') {
    throw new DeclarativeError(
      `${path}: a v2 frontmatter is an object schema — a mapping with an explicit 'type: object' ` +
        `(plus 'properties' / 'required' / 'additionalProperties'); the v1 'strict' / 'fields' ` +
        `form is not v2 (markdown-contract migrate rewrites v1 files)`,
    )
  }
  return compileSchemaV2(node, path)
}

/** `enum: [...]` — a non-empty list of strings. */
function enumSchema(n: Record<string, unknown>, path: string): z.ZodType {
  const values = n.enum
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    !values.every((v) => typeof v === 'string')
  ) {
    throw new DeclarativeError(`${path}: enum must be a non-empty list of strings`)
  }
  return z.enum(values as [string, ...string[]])
}

/** `const: <v>` — the value must be a string, number, or boolean (validated; v1 blindly cast). */
function constSchema(n: Record<string, unknown>, path: string): z.ZodType {
  const v = n.const
  if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
    throw new DeclarativeError(
      `${path}: const must be a string, number, or boolean (got ${describeValue(v)})`,
    )
  }
  return z.literal(v)
}

/**
 * Resolve a `type` value: a single base type, or a two-element `[T, "null"]` union (either
 * order) marking the node nullable. Any other array form is outside the v2 subset.
 */
function resolveType(t: unknown, path: string): { base: string; nullable: boolean } {
  if (typeof t === 'string' && BASE_TYPES.has(t)) return { base: t, nullable: false }
  if (Array.isArray(t)) {
    const others = t.filter((v) => v !== 'null')
    const base = others[0]
    if (t.length === 2 && others.length === 1 && typeof base === 'string' && BASE_TYPES.has(base)) {
      return { base, nullable: true }
    }
    throw new DeclarativeError(
      `${path}: type ${JSON.stringify(t)} is outside the supported v2 subset ` +
        `(a type union may only pair one base type with "null")`,
    )
  }
  throw new DeclarativeError(
    `${path}: unsupported type '${String(t)}' (string | number | integer | boolean | array | object)`,
  )
}

/** Dispatch a resolved base type to its constraint compiler. */
function typedSchema(n: Record<string, unknown>, base: string, path: string): z.ZodType {
  switch (base) {
    case 'string':
      return stringSchema(n, path)
    case 'number':
    case 'integer':
      return numericSchema(n, base, path)
    case 'boolean':
      return z.boolean()
    case 'array':
      return arraySchema(n, path)
    default:
      return objectSchema(n, path)
  }
}

/**
 * `type: string` — a named `format` (the closed constructor map above) or a plain string,
 * COMPOSED with `minLength` / `maxLength` / `pattern`. In v1 a `format` was exclusive; in v2
 * the constraints chain onto the format constructor (verified on zod 4.4.3).
 */
function stringSchema(n: Record<string, unknown>, path: string): z.ZodType {
  let s: z.ZodString
  if ('format' in n) {
    if (typeof n.format !== 'string') throw new DeclarativeError(`${path}.format must be a string`)
    const make = STRING_FORMATS[n.format]
    if (!make) {
      throw new DeclarativeError(
        `${path}: unsupported string format '${n.format}' (expected one of: ${Object.keys(STRING_FORMATS).join(', ')})`,
      )
    }
    // Every format constructor returns a ZodString subclass, so the length/pattern checks chain.
    s = make() as z.ZodString
  } else {
    s = z.string()
  }
  const min = numberKey(n, 'minLength', path)
  const max = numberKey(n, 'maxLength', path)
  if (min !== undefined) s = s.min(min)
  if (max !== undefined) s = s.max(max)
  if ('pattern' in n) {
    if (typeof n.pattern !== 'string')
      throw new DeclarativeError(`${path}.pattern must be a string`)
    s = s.regex(new RegExp(n.pattern))
  }
  return s
}

/** `type: number` / `type: integer` — with optional `minimum` / `maximum` bounds. */
function numericSchema(n: Record<string, unknown>, base: string, path: string): z.ZodType {
  let s = base === 'integer' ? z.int() : z.number()
  const min = numberKey(n, 'minimum', path)
  const max = numberKey(n, 'maximum', path)
  if (min !== undefined) s = s.min(min)
  if (max !== undefined) s = s.max(max)
  return s
}

/** `type: array` — a required `items` element schema, with optional `minItems` / `maxItems`. */
function arraySchema(n: Record<string, unknown>, path: string): z.ZodType {
  if (!('items' in n)) {
    throw new DeclarativeError(`${path}: an array schema needs an 'items' element schema`)
  }
  let s = z.array(compileSchemaV2(n.items, `${path}.items`))
  const min = numberKey(n, 'minItems', path)
  const max = numberKey(n, 'maxItems', path)
  if (min !== undefined) s = s.min(min)
  if (max !== undefined) s = s.max(max)
  return s
}

/**
 * `type: object` — `properties` (required), `required` (each entry must name a declared
 * property), `additionalProperties` (boolean only; `false` → a strict object). Properties NOT
 * listed in `required` compile with an outermost `.optional()` — optional-by-default, the
 * JSON Schema inversion of v1's per-field `optional: true`.
 */
function objectSchema(n: Record<string, unknown>, path: string): z.ZodType {
  if (!('properties' in n)) {
    throw new DeclarativeError(`${path}: an object schema needs a 'properties' map of key → schema`)
  }
  const props = n.properties
  if (!isMap(props)) {
    throw new DeclarativeError(`${path}.properties must be a mapping of key → schema`)
  }
  const required = requiredSet(n, props, path)
  if ('additionalProperties' in n && typeof n.additionalProperties !== 'boolean') {
    throw new DeclarativeError(
      `${path}.additionalProperties must be a boolean in the v2 subset (a schema form is not supported)`,
    )
  }
  const shape: Record<string, z.ZodType> = {}
  for (const [key, value] of Object.entries(props)) {
    let prop = compileSchemaV2(value, `${path}.${key}`)
    if (!required.has(key)) prop = prop.optional()
    shape[key] = prop
  }
  return n.additionalProperties === false ? z.strictObject(shape) : z.object(shape)
}

/** Validate and read the `required` list: strings only, each naming a declared property. */
function requiredSet(
  n: Record<string, unknown>,
  props: Record<string, unknown>,
  path: string,
): Set<string> {
  if (!('required' in n)) return new Set()
  const req = n.required
  if (!Array.isArray(req) || !req.every((v) => typeof v === 'string')) {
    throw new DeclarativeError(`${path}.required must be a list of property names`)
  }
  for (const key of req) {
    if (!(key in props)) {
      throw new DeclarativeError(
        `${path}.required names '${key}', which is not declared in properties`,
      )
    }
  }
  return new Set(req as string[])
}
