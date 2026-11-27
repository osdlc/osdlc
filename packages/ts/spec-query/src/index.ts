/**
 * Minimal diffs against a defaults object, and a readable query string over them.
 *
 * THE DEFAULTS OBJECT IS ALSO THE SCHEMA. To decode `prune.minFanIn=3` you need
 * to know the field is a number, and `defaults.prune.minFanIn === 0` says so.
 * Booleans, numbers, strings and arrays all infer from their own default. No
 * schema declaration, no decorators, no validation library.
 *
 * The one place inference cannot reach is a `null` default, which carries no
 * type. The stated convention is NULLABLE STRING — see "Null defaults" in
 * README.md — and {@link CodecOptions.types} is the escape hatch when that is
 * wrong.
 *
 * Three levels. {@link diff}/{@link merge} are value-level and grammar-free:
 * any JSON-ish shape goes through them. {@link encodeEntries}/
 * {@link decodeEntries} put a diff in raw query pairs, for a host — a router —
 * that owns the percent-encoding. {@link encode}/{@link decode} escape those
 * pairs into one query string. Both query levels are limited to what the
 * grammar can carry — see README.md.
 */

/** A diff's shape: every leaf optional, arrays kept whole. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

/** The value domain the query grammar can carry. */
export type FieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'boolean[]'

/**
 * Per-call options for the query codec ({@link specQueryKeys},
 * {@link encodeEntries}, {@link decodeEntries}, {@link encode}, {@link decode}).
 * Keep one shared constant across the encode and decode call sites: two option
 * sets that drift apart read and write different keys.
 */
export interface CodecOptions {
  /**
   * Dotted keys the codec must neither write nor read — fields another owner
   * holds in the query, or fields too large for a URL. Naming a group omits
   * its whole subtree.
   */
  omit?: readonly string[]
  /**
   * The type for a key whose default does not imply the right one. The single
   * declaration point for a `null` default that is not a string.
   */
  types?: Readonly<Record<string, FieldType>>
}

/**
 * An explicit null in the joined-string grammar, where a literal `~` is
 * written `%7E`. The pair level has no token: it uses `null` itself.
 */
const NULL_TOKEN = '~'

/**
 * A plain object: a literal, `Object.create(null)` or `JSON.parse` output.
 * Dates, Maps and class instances are not — they are opaque leaves, copied by
 * reference and compared whole.
 */
const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v) as unknown
  return proto === Object.prototype || proto === null
}

const hasOwn = (node: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(node, key)

/**
 * Assign `key` as an own data property. A plain `out[key] = v` with the key
 * `__proto__` would swap the prototype instead (an input from `JSON.parse` can
 * carry such an own key); this always writes data.
 */
function setOwn(out: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true })
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) setOwn(out, k, deepClone(v))
    return out as T
  }
  return value
}

// --- the value half -------------------------------------------------------

function difference(value: unknown, base: unknown): unknown {
  if (isPlainObject(value) && isPlainObject(base)) {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      const d = difference(v, hasOwn(base, key) ? base[key] : undefined)
      if (d !== undefined) setOwn(out, key, d)
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  // `===` keeps 0 and -0 equal; `Object.is` keeps NaN equal to NaN. A primitive
  // that is not equal is different, so NaN and Infinity never pass for `null`
  // through their shared JSON form.
  if (value === base || Object.is(value, base)) return undefined
  if (typeof value !== 'object' || value === null || typeof base !== 'object' || base === null) {
    return deepClone(value)
  }
  return JSON.stringify(value) === JSON.stringify(base) ? undefined : deepClone(value)
}

/**
 * What differs from the defaults, recursively. `{}` when nothing does.
 *
 * Plain objects recurse; arrays and scalars compare whole (arrays and other
 * non-plain objects such as a `Date` by JSON identity, primitives by value,
 * with `NaN` equal to itself). Comparing arrays whole is right for the
 * sets-written-as-lists a view spec holds: half of one is not a meaningful
 * saving. The result shares no structure with `value`.
 */
export function diff<T extends object>(value: T, defaults: T): DeepPartial<T> {
  return (difference(value, defaults) ?? {}) as DeepPartial<T>
}

/**
 * A stored or decoded diff back to a whole value.
 *
 * Recurses plain objects against the defaults, replaces arrays, scalars and
 * other non-plain objects (a `Date`) whole, and ignores keys the defaults do not have. The result is a fresh deep
 * clone, so no caller shares structure with `defaults`.
 */
export function merge<T extends object>(patch: unknown, defaults: T): T {
  return mergeValue(patch, defaults) as T
}

function mergeValue(patch: unknown, base: unknown): unknown {
  if (!isPlainObject(base)) return patch === undefined ? deepClone(base) : deepClone(patch)
  if (!isPlainObject(patch)) return deepClone(base)
  const out: Record<string, unknown> = {}
  for (const [key, baseValue] of Object.entries(base)) {
    setOwn(out, key, hasOwn(patch, key) ? mergeValue(patch[key], baseValue) : deepClone(baseValue))
  }
  return out
}

// --- the query half -------------------------------------------------------

/**
 * The type a default implies, or `undefined` for a value outside the domain.
 *
 * `null` is NULLABLE STRING by convention, not by inference — every other type
 * reads off its own default and this one cannot, so the library says out loud
 * what it assumes. An array's element type comes from its first element, so an
 * empty default array is `string[]`; {@link CodecOptions.types} is the fix when
 * that is wrong.
 *
 * Not exported: the README's "Null defaults" section is the public statement.
 */
function fieldType(value: unknown): FieldType | undefined {
  if (value === null) return 'string'
  if (Array.isArray(value)) {
    const element = value.length > 0 ? fieldType(value[0]) : 'string'
    if (element === 'string' || element === 'number' || element === 'boolean') {
      return `${element}[]` as FieldType
    }
    return undefined
  }
  switch (typeof value) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      return undefined
  }
}

interface Field {
  /** The dotted path from the root of the defaults object. */
  key: string
  path: string[]
  type: FieldType
}

const FIELD_TYPES: ReadonlySet<string> = new Set<FieldType>([
  'string',
  'number',
  'boolean',
  'string[]',
  'number[]',
  'boolean[]',
])

/** The declared type for `dotted`: an own entry that is a real `FieldType`. */
function declaredType(
  types: Readonly<Record<string, FieldType>>,
  dotted: string,
): FieldType | undefined {
  if (!hasOwn(types, dotted)) return undefined
  const declared: unknown = types[dotted]
  return typeof declared === 'string' && FIELD_TYPES.has(declared)
    ? (declared as FieldType)
    : undefined
}

/** True when the string has no lone surrogate, so `encodeURIComponent` will not throw. */
const isWellFormed = (text: string): boolean =>
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)

const isOmitted = (key: string, omit: readonly string[]): boolean =>
  omit.some((o) => o === key || key.startsWith(`${o}.`))

/**
 * Every field the codec owns, in defaults order, depth-first.
 *
 * That order is what makes two equal values encode to byte-identical strings.
 */
function fields(defaults: object, options: CodecOptions = {}): Field[] {
  const omit = options.omit ?? []
  const types = options.types ?? {}
  const out: Field[] = []
  const walk = (node: Record<string, unknown>, prefix: string[]): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = [...prefix, key]
      const dotted = path.join('.')
      // A key with a lone surrogate cannot be written to a URL; skip it.
      if (!isWellFormed(dotted) || isOmitted(dotted, omit)) continue
      const declared = declaredType(types, dotted)
      if (declared === undefined && isPlainObject(value)) {
        walk(value, path)
        continue
      }
      const type = declared ?? fieldType(value)
      if (type !== undefined) out.push({ key: dotted, path, type })
    }
  }
  walk(defaults as Record<string, unknown>, [])
  return out
}

/**
 * Every dotted key the codec owns for these defaults.
 *
 * Lets a host split its route query into codec-owned and host-owned halves
 * without keeping a second copy of the key list.
 */
export function specQueryKeys<T extends object>(defaults: T, options?: CodecOptions): string[] {
  return fields(defaults, options).map((f) => f.key)
}

/** `encodeURIComponent`, with `/`, `:` and space relaxed back for readability. */
function enc(text: string): string {
  return encodeURIComponent(text)
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')
    .replace(/%20/g, '+')
    .replace(/~/g, '%7E')
}

/**
 * The reverse. Never throws: valid `%XX` runs decode and a malformed escape
 * stays literal, without taking the rest of the text with it.
 */
function dec(text: string): string {
  return text.replace(/\+/g, ' ').replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run)
    } catch {
      // Not valid UTF-8 as a whole: keep what decodes escape by escape.
      return run.replace(/%[0-9A-Fa-f]{2}/g, (one) => {
        try {
          return decodeURIComponent(one)
        } catch {
          return one
        }
      })
    }
  })
}

const MISSING = Symbol('missing')

function readPath(root: unknown, path: string[]): unknown | typeof MISSING {
  let node: unknown = root
  for (const key of path) {
    if (!isPlainObject(node) || !hasOwn(node, key)) return MISSING
    node = node[key]
  }
  return node
}

function writePath(root: Record<string, unknown>, path: string[], value: unknown): void {
  let node = root
  for (const key of path.slice(0, -1)) {
    const next = hasOwn(node, key) ? node[key] : undefined
    if (!isPlainObject(next)) setOwn(node, key, {})
    node = node[key] as Record<string, unknown>
  }
  setOwn(node, path[path.length - 1]!, value)
}

const elementType = (type: FieldType): FieldType =>
  type.endsWith('[]') ? (type.slice(0, -2) as FieldType) : type

// --- the pair level -------------------------------------------------------

/**
 * One query pair, carrying RAW text.
 *
 * No percent-encoding and no reserved tokens: a value is what the field
 * actually holds. `null` is an explicit null, which vue-router and
 * `URLSearchParams` both render as a valueless key. An array field takes the
 * `string[]` form only when an element contains `,`; otherwise it is
 * comma-joined, which is what keeps a link readable.
 */
export interface SpecEntry {
  /** The dotted path of the field from the root of the defaults object. */
  key: string
  /**
   * The field's raw text, the elements of an array that must not be joined, or
   * an explicit `null`.
   */
  value: string | string[] | null
}

/** One scalar to its raw text, or `undefined` when the grammar cannot carry it. */
function rawScalar(value: unknown, type: FieldType): string | null | undefined {
  if (value === null) return null
  switch (type) {
    case 'string':
      // A lone surrogate cannot be written to a URL: drop it, like any value outside the domain.
      return typeof value === 'string' && isWellFormed(value) ? value : undefined
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined
    case 'boolean':
      return typeof value === 'boolean' ? (value ? '1' : '0') : undefined
    default:
      return undefined
  }
}

function rawField(value: unknown, type: FieldType): SpecEntry['value'] | undefined {
  if (!type.endsWith('[]')) return rawScalar(value, type)
  if (!Array.isArray(value)) return undefined
  const element = elementType(type)
  const parts: string[] = []
  for (const item of value) {
    const part = rawScalar(item, element)
    // A null element has no place in the grammar; drop the whole field.
    if (part === undefined || part === null) return undefined
    parts.push(part)
  }
  return parts.some((p) => p.includes(',')) ? parts : parts.join(',')
}

/** One raw scalar back, or `undefined` when it will not parse to `type`. */
function parseScalar(raw: string, type: FieldType): unknown | undefined {
  switch (type) {
    case 'string':
      return raw
    case 'number': {
      if (raw.trim() === '') return undefined
      const n = Number(raw)
      return Number.isFinite(n) ? n : undefined
    }
    case 'boolean': {
      const t = raw.toLowerCase()
      if (t === '1' || t === 'true') return true
      if (t === '0' || t === 'false') return false
      return undefined
    }
    default:
      return undefined
  }
}

function parseField(raw: unknown, type: FieldType, nullable: boolean): unknown | undefined {
  if (raw === undefined) return undefined
  const isList = type.endsWith('[]')
  if (Array.isArray(raw)) {
    // A repeated key: the element list for an array field, last-wins otherwise.
    if (!isList) return parseField(raw[raw.length - 1], type, nullable)
    const element = elementType(type)
    const out: unknown[] = []
    for (const item of raw) {
      if (typeof item !== 'string') return undefined
      const value = parseScalar(item, element)
      if (value === undefined) return undefined
      out.push(value)
    }
    return out
  }
  if (raw === null) return nullable ? null : undefined
  if (typeof raw !== 'string') return undefined
  if (!isList) return parseScalar(raw, type)
  if (raw === '') return []
  const element = elementType(type)
  const out: unknown[] = []
  for (const part of raw.split(',')) {
    const value = parseScalar(part, element)
    if (value === undefined) return undefined
    out.push(value)
  }
  return out
}

/**
 * The diff against `defaults`, as raw query pairs.
 *
 * For a host that owns its own percent-encoding — a router that hands out
 * decoded values and re-encodes what it is given. Nothing here is escaped, so
 * the host never has to agree with this package on what an escape looks like.
 *
 * A value equal to its default is absent, so a default value yields no pairs.
 * Values outside the supported domain are dropped rather than thrown on.
 */
export function encodeEntries<T extends object>(
  value: T,
  defaults: T,
  options?: CodecOptions,
): SpecEntry[] {
  const patch = diff(value, defaults)
  const out: SpecEntry[] = []
  for (const field of fields(defaults, options)) {
    const found = readPath(patch, field.path)
    if (found === MISSING) continue
    // TODO: A null value over a non-null default is emitted as an explicit null, but
    // `decodeEntries` only accepts null when the default is null and falls back to the default.
    // Drop such a null here, or let decode keep it.
    const raw = rawField(found, field.type)
    if (raw === undefined) continue
    out.push({ key: field.key, value: raw })
  }
  return out
}

/**
 * Raw query pairs back to a whole value. Total — no input throws.
 *
 * Takes anything that iterates key/value tuples, so `Object.entries` of a
 * router query goes straight in. Unknown keys are ignored, a value that will
 * not parse to the type its default implies falls back to that default, and a
 * repeated scalar key takes the last.
 */
export function decodeEntries<T extends object>(
  entries: Iterable<readonly [string, unknown]>,
  defaults: T,
  options?: CodecOptions,
): T {
  const byKey = new Map(fields(defaults, options).map((f) => [f.key, f]))
  const patch: Record<string, unknown> = {}
  for (const [key, raw] of entries) {
    const field = byKey.get(key)
    if (field === undefined) continue
    const nullable = readPath(defaults, field.path) === null
    const value = parseField(raw, field.type, nullable)
    if (value === undefined) continue
    writePath(patch, field.path, value)
  }
  return merge(patch, defaults)
}

// --- the string level -----------------------------------------------------

/** A raw pair value to its escaped form in the joined grammar. */
function escapeValue(raw: SpecEntry['value'], type: FieldType): string {
  if (raw === null) return NULL_TOKEN
  if (Array.isArray(raw)) return raw.map(enc).join(',')
  return type.endsWith('[]') ? raw.split(',').map(enc).join(',') : enc(raw)
}

/** An escaped pair value back to its raw form. */
function unescapeValue(raw: string, type: FieldType): SpecEntry['value'] {
  if (raw === NULL_TOKEN) return null
  if (!type.endsWith('[]')) return dec(raw)
  if (raw === '') return ''
  return raw.split(',').map(dec)
}

/**
 * The diff against `defaults`, flattened to a query string.
 *
 * A value equal to its default is absent, so a default view encodes to `""`.
 * Values outside the supported domain are dropped rather than thrown on.
 */
export function encode<T extends object>(value: T, defaults: T, options?: CodecOptions): string {
  const types = new Map(fields(defaults, options).map((f) => [f.key, f.type]))
  const pairs: string[] = []
  for (const entry of encodeEntries(value, defaults, options)) {
    pairs.push(`${enc(entry.key)}=${escapeValue(entry.value, types.get(entry.key)!)}`)
  }
  return pairs.join('&')
}

/**
 * A query string back to a whole value. Total — no input throws.
 *
 * Accepts a bare query with or without a leading `?`. Unknown keys are ignored,
 * a value that will not parse to the type its default implies falls back to
 * that default, and duplicate keys take the last.
 */
export function decode<T extends object>(query: string, defaults: T, options?: CodecOptions): T {
  const types = new Map(fields(defaults, options).map((f) => [f.key, f.type]))
  const entries: [string, unknown][] = []
  const body = query.startsWith('?') ? query.slice(1) : query
  for (const segment of body.split('&')) {
    if (segment === '') continue
    const eq = segment.indexOf('=')
    const key = dec(eq === -1 ? segment : segment.slice(0, eq))
    const type = types.get(key)
    if (type === undefined) continue
    entries.push([key, unescapeValue(eq === -1 ? '' : segment.slice(eq + 1), type)])
  }
  return decodeEntries(entries, defaults, options)
}
