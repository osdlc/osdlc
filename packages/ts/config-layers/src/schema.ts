/**
 * Walk a Zod object schema by dotted key to the schema for one setting, so a
 * message about it can quote the setting's own `.describe()` prose.
 *
 * Reads Zod's private `_def` layout (the `type` tag and `innerType`) for the
 * four wrappers (`optional`, `nullable`, `default`, `prefault`) and the
 * `record` tag. It checks tag names, not `instanceof`, so a second copy of zod
 * in a consumer's dependency tree still works. A test in `tests/` fails if a
 * zod release changes this layout.
 */

import type { z } from 'zod'

interface Def {
  type?: string
  innerType?: unknown
  valueType?: unknown
  defaultValue?: unknown
}

const WRAPPERS = new Set(['optional', 'nullable', 'default', 'prefault'])

function defOf(schema: unknown): Def {
  return ((schema as { _def?: Def })._def ?? {}) as Def
}

/**
 * `schema` with its optional / nullable / default / prefault wrappers peeled.
 *
 * @experimental
 */
export function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let cur: z.ZodTypeAny = schema
  for (;;) {
    const def = defOf(cur)
    if (def.type === undefined || !WRAPPERS.has(def.type) || def.innerType === undefined) return cur
    cur = def.innerType as z.ZodTypeAny
  }
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
 * The schema at `key`, wrappers kept (a `.describe()` sits on the outermost
 * wrapper). A key under a record (`paths.dev`) resolves to the record, since
 * its entries have no schema of their own. Null when `key` names nothing.
 * @experimental
 */
export function leafSchema(schema: z.ZodTypeAny, key: string): z.ZodTypeAny | null {
  let cur: z.ZodTypeAny = schema
  for (const seg of key.split('.')) {
    const inner = unwrapSchema(cur)
    const next = shapeOf(inner)[seg]
    if (next !== undefined) {
      cur = next
      continue
    }
    return defOf(inner).type === 'record' ? cur : null
  }
  return cur
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
 * any of optional / nullable / default / prefault wraps it, and the outermost
 * `defaultValue` (undefined when none sets one). A zod 4 default is a plain
 * value; a thunk (zod 3) is called.
 * @experimental
 */
export function fieldInfo(schema: z.ZodTypeAny): { optional: boolean; defaultValue: unknown } {
  let cur: z.ZodTypeAny = schema
  let optional = false
  let defaultValue: unknown
  for (;;) {
    const def = defOf(cur)
    if (def.type === undefined || !WRAPPERS.has(def.type) || def.innerType === undefined) break
    optional = true
    if (defaultValue === undefined && (def.type === 'default' || def.type === 'prefault')) {
      const dv = def.defaultValue
      defaultValue = typeof dv === 'function' ? (dv as () => unknown)() : dv
    }
    cur = def.innerType as z.ZodTypeAny
  }
  return { optional, defaultValue }
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
