/**
 * Walk a Zod object schema by dotted key to the schema for one setting, so a
 * message about it can quote the setting's own `.describe()` prose.
 *
 * Reads Zod's private `_def` layout (the `type` tag, `innerType` and a pipe's
 * `in`) for the wrappers in {@link WRAPPER_TYPES} and the `record` tag. It
 * checks tag names, not `instanceof`, so a second copy of zod in a consumer's
 * dependency tree still works. A test in `tests/` fails if a zod release
 * changes this layout.
 */

import type { z } from 'zod'

interface Def {
  type?: string
  innerType?: unknown
  in?: unknown
  valueType?: unknown
  defaultValue?: unknown
}

/**
 * The wrapper kinds that hold their schema in `innerType`. The one table both
 * this module and the secret walk (`./secret.ts`) peel. Internal, not in the
 * package index.
 */
export const WRAPPER_TYPES: ReadonlySet<string> = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'nonoptional',
  'readonly',
  'catch',
  'promise',
  'success',
])

/** The wrappers that let a value be missing, for {@link fieldInfo}. */
const OPTIONAL_TYPES = new Set(['optional', 'nullable', 'default', 'prefault'])

function defOf(schema: unknown): Def {
  return ((schema as { _def?: Def })._def ?? {}) as Def
}

/**
 * The schema one wrapper holds: a {@link WRAPPER_TYPES} wrapper's
 * `innerType`, or a pipe's input side (`.transform()` and `.pipe()` both make
 * one, and the file holds what the input side reads). Undefined for anything
 * else.
 */
function peelOnce(schema: z.ZodTypeAny): z.ZodTypeAny | undefined {
  const def = defOf(schema)
  if (def.type === undefined) return undefined
  if (WRAPPER_TYPES.has(def.type)) return def.innerType as z.ZodTypeAny | undefined
  if (def.type === 'pipe') return def.in as z.ZodTypeAny | undefined
  return undefined
}

/**
 * `schema` with its wrappers peeled: every {@link WRAPPER_TYPES} kind, and a
 * pipe down to its input side.
 *
 * @experimental
 */
export function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let cur: z.ZodTypeAny = schema
  for (let next = peelOnce(cur); next !== undefined; next = peelOnce(cur)) cur = next
  return cur
}

/**
 * The object schema's `{ key: subSchema }` map, or `{}` for a non-object.
 *
 * @experimental
 */
export function shapeOf(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  const shape = (schema as unknown as { shape?: unknown }).shape
  if (shape && typeof shape === 'object') return shape as Record<string, z.ZodTypeAny>
  return {}
}

/**
 * Where a {@link walkKeyPath} walk ended. `ok` carries the schema the path
 * names (wrappers kept) and the first record it crossed, if any. A failure
 * names the index of the segment that did not resolve and the schema it was
 * looked up in: `unknown_field` when that schema is an object without the
 * field, `not_mapping` when it is neither an object nor a record.
 *
 * @experimental
 */
export type KeyPathWalk =
  | { ok: true; schema: z.ZodTypeAny; record: z.ZodTypeAny | null }
  | { ok: false; at: number; parent: z.ZodTypeAny; reason: 'unknown_field' | 'not_mapping' }

/**
 * Walk `path` down from `schema`: an object's field by name, a record's
 * value type for any key. The one dotted-path walk over a schema;
 * {@link leafSchema} and `resolveKeyPath` (`./explain.ts`) are built on it.
 *
 * @experimental
 */
export function walkKeyPath(schema: z.ZodTypeAny, path: readonly string[]): KeyPathWalk {
  let cur: z.ZodTypeAny = schema
  let record: z.ZodTypeAny | null = null
  for (const [at, seg] of path.entries()) {
    const inner = unwrapSchema(cur)
    const type = defOf(inner).type
    if (type === 'object') {
      const next = shapeOf(inner)[seg]
      if (next === undefined) return { ok: false, at, parent: cur, reason: 'unknown_field' }
      cur = next
    } else if (type === 'record' && defOf(inner).valueType !== undefined) {
      record ??= cur
      cur = defOf(inner).valueType as z.ZodTypeAny
    } else {
      return { ok: false, at, parent: cur, reason: 'not_mapping' }
    }
  }
  return { ok: true, schema: cur, record }
}

/**
 * The schema at `key`, wrappers kept (a `.describe()` sits on the outermost
 * wrapper). A key under a record (`paths.dev`) resolves to the record, since
 * its entries have no schema of their own; a key past the record's value
 * type must still resolve inside it. Null when `key` names nothing.
 * @experimental
 */
export function leafSchema(schema: z.ZodTypeAny, key: string): z.ZodTypeAny | null {
  const walk = walkKeyPath(schema, key.split('.'))
  if (!walk.ok) return null
  return walk.record ?? walk.schema
}

/**
 * Whether `key` names something `schema` knows.
 *
 * @experimental
 */
export function keyExists(schema: z.ZodTypeAny, key: string): boolean {
  return leafSchema(schema, key) !== null
}

/**
 * The first sentence of the schema's description for `key`, or null when
 * the schema does not describe it.
 * @experimental
 */
export function keyDescription(schema: z.ZodTypeAny, key: string): string | null {
  const leaf = leafSchema(schema, key)
  if (leaf === null) return null
  const text = String((leaf as { description?: unknown }).description ?? '').trim()
  if (text === '') return null
  const m = /^(.*?[.!?])(?:\s|$)/.exec(text)
  return m === null ? text : m[1]!
}

/**
 * The `_def.type` tag of `schema` once its wrappers are peeled (`object`, `record`, `enum`, `string`, ...).
 *
 * @experimental
 */
export function kindOf(schema: z.ZodTypeAny): string | undefined {
  return defOf(unwrapSchema(schema)).type
}

/**
 * The value schema of a record (`z.record`), or null when `schema` is not one.
 *
 * @experimental
 */
export function recordValueType(schema: z.ZodTypeAny): z.ZodTypeAny | null {
  const def = defOf(unwrapSchema(schema))
  return def.type === 'record' && def.valueType !== undefined
    ? (def.valueType as z.ZodTypeAny)
    : null
}

/**
 * What the wrappers around `schema` say about a missing value: `optional` when
 * optional / nullable / default / prefault wraps it outside any
 * `nonoptional`, and the outermost `defaultValue` (undefined when none sets
 * one). The other wrappers are peeled without deciding either. A zod 4
 * default is a plain value; a thunk (zod 3) is called.
 * @experimental
 */
export function fieldInfo(schema: z.ZodTypeAny): { optional: boolean; defaultValue: unknown } {
  let optional: boolean | undefined
  let defaultValue: unknown
  let cur: z.ZodTypeAny = schema
  for (let next = peelOnce(cur); next !== undefined; next = peelOnce(cur)) {
    const def = defOf(cur)
    if (def.type === 'nonoptional') optional ??= false
    if (def.type !== undefined && OPTIONAL_TYPES.has(def.type)) optional ??= true
    if (defaultValue === undefined && (def.type === 'default' || def.type === 'prefault')) {
      const dv = def.defaultValue
      defaultValue = typeof dv === 'function' ? (dv as () => unknown)() : dv
    }
    cur = next
  }
  return { optional: optional ?? false, defaultValue }
}

/**
 * The allowed values of an enum schema (wrappers peeled), or null when it is not an enum.
 *
 * @experimental
 */
export function enumValues(schema: z.ZodTypeAny): string[] | null {
  const inner = unwrapSchema(schema)
  if (defOf(inner).type !== 'enum') return null
  const options = (inner as unknown as { options?: unknown }).options
  return Array.isArray(options) ? options.map((o) => String(o)) : null
}
