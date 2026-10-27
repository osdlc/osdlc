/**
 * The `secret` flag: keys the project file must not carry.
 *
 * A key is marked secret by `.meta({ secret: true })` on its schema (a nested
 * field) or by `secret: true` in a section's meta (the whole section). See
 * `./meta.ts`. This module reads the nested flags. It walks a section schema
 * through its wrappers (optional, default, pipe), records, arrays, unions and
 * objects, and collects the path of every field the registry flags. It then
 * checks a parsed layer against those paths. `defineConfigSection`
 * (`./section.ts`) gives a section with secret keys a layer check that refuses
 * them in the project file. The overlay, the machine file and env sources are
 * not checked. Those are the layers that may hold a secret
 * ({@link SECRET_ALLOWED_LAYERS}).
 */

import { z } from 'zod'

import { WRAPPER_TYPES } from './schema.ts'
import type { ConfigSection } from './section.ts'

/** A path into a config document; `*` stands for any record key or array index. */
export type SecretPath = readonly string[]

/** The layers that may hold a secret key, as named in the refusal message. */
export const SECRET_ALLOWED_LAYERS =
  'the local overlay file, the machine file or an environment source'

interface WalkDef {
  type?: string
  shape?: Record<string, z.core.$ZodType>
  innerType?: z.core.$ZodType
  valueType?: z.core.$ZodType
  element?: z.core.$ZodType
  options?: readonly z.core.$ZodType[]
  in?: z.core.$ZodType
  out?: z.core.$ZodType
  left?: z.core.$ZodType
  right?: z.core.$ZodType
  items?: readonly z.core.$ZodType[]
  rest?: z.core.$ZodType | null
  getter?: () => z.core.$ZodType
}

/** Node kinds that hold no child schema, so nothing under them can be secret. */
const LEAF_TYPES = new Set([
  'string',
  'number',
  'int',
  'boolean',
  'bigint',
  'symbol',
  'date',
  'null',
  'undefined',
  'void',
  'never',
  'any',
  'unknown',
  'nan',
  'literal',
  'enum',
  'template_literal',
  'file',
  'custom',
  'transform',
])

function isSecret(schema: z.core.$ZodType): boolean {
  const meta = z.globalRegistry.get(schema) as { secret?: unknown } | undefined
  return meta?.secret === true
}

/**
 * Collect the path of every secret field under `schema`. A node kind that is
 * neither a leaf nor one this walk can descend into throws, naming the path.
 * So a `secret` flag under it is never skipped without notice.
 */
function walk(
  schema: z.core.$ZodType,
  at: string[],
  out: SecretPath[],
  ancestors: Set<object>,
): void {
  if (isSecret(schema)) {
    out.push(at)
    return
  }
  const def = schema._zod.def as WalkDef
  if (ancestors.has(def)) {
    throw new Error(
      `secret walk found a recursive schema at ${at.join('.')}: a secret key at any depth could not be listed. Flatten the recursion or mark the whole section secret.`,
    )
  }
  ancestors.add(def)
  try {
    descend(def, at, out, ancestors)
  } finally {
    ancestors.delete(def)
  }
}

function descend(def: WalkDef, at: string[], out: SecretPath[], ancestors: Set<object>): void {
  const type = def.type ?? ''
  const into = (child: z.core.$ZodType | null | undefined, path = at) => {
    if (child) walk(child, path, out, ancestors)
  }
  if (LEAF_TYPES.has(type)) return
  if (WRAPPER_TYPES.has(type)) return into(def.innerType)
  switch (type) {
    case 'object':
      for (const [key, child] of Object.entries(def.shape ?? {})) into(child, [...at, key])
      return
    case 'record':
      return into(def.valueType, [...at, '*'])
    case 'array':
      return into(def.element, [...at, '*'])
    case 'tuple':
      for (const item of def.items ?? []) into(item, [...at, '*'])
      return into(def.rest, [...at, '*'])
    case 'union':
      for (const option of def.options ?? []) into(option)
      return
    case 'intersection':
      into(def.left)
      return into(def.right)
    case 'pipe':
      into(def.in)
      return into(def.out)
    case 'lazy':
      return into(def.getter?.())
    default:
      throw new Error(
        `secret walk cannot descend into a "${type}" schema at ${at.join('.')}: a secret key under it would go unrefused. Teach ./secret.ts the node kind, or restructure the schema.`,
      )
  }
}

/** Every secret path of one section, rooted at its key. Distinct, in schema order. */
export function sectionSecretPaths(
  section: Pick<ConfigSection, 'key' | 'schema' | 'meta'>,
): SecretPath[] {
  if (section.meta.secret === true) return [[section.key]]
  const out: SecretPath[] = []
  walk(section.schema, [section.key], out, new Set())
  const seen = new Set<string>()
  return out.filter((p) => {
    const id = p.join('\u0000')
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function collect(value: unknown, path: SecretPath, at: string[], found: string[]): void {
  if (value === undefined) return
  if (path.length === 0) {
    found.push(at.join('.'))
    return
  }
  const [head, ...rest] = path as [string, ...string[]]
  if (typeof value !== 'object' || value === null) return
  if (head === '*') {
    const entries: [string, unknown][] = Array.isArray(value)
      ? value.map((v, i) => [String(i), v])
      : Object.entries(value)
    for (const [k, v] of entries) collect(v, rest, [...at, k], found)
    return
  }
  collect((value as Record<string, unknown>)[head], rest, [...at, head], found)
}

/** The dotted paths in `layer` that set a secret key. */
export function secretKeysSet(
  layer: Record<string, unknown>,
  paths: readonly SecretPath[],
): string[] {
  const found: string[] = []
  for (const path of paths) collect(layer, path, [], found)
  return found
}
