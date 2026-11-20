/**
 * A config schema as a flat list of fields: one entry per leaf, with its
 * label, help, control, default and choices. A tool renders its example
 * file, `config list`, a settings screen or an interactive `init` from this
 * one list.
 *
 * What a field says about itself comes from its Zod `.meta()` ({@link FieldMeta}:
 * `label`, `help`, `control`, `hidden`) and `.describe()`. Everything else
 * is read from the schema. Objects are walked into. A record, an array, a
 * union and every scalar is a leaf, since its entries have no schema of their
 * own (a record's) or no fixed name (an array's).
 */

import { z } from 'zod'

import { defaultOf } from './explain.ts'
import { fieldMetaShape, type FieldMeta } from './meta.ts'
import { enumValues, fieldInfo, kindOf, peelOnce, shapeOf, unwrapSchema } from './schema.ts'

/**
 * One leaf of a config schema.
 *
 * @experimental
 */
export interface ConfigField {
  /** The key path from the top: `['server', 'limits', 'timeout']`. */
  path: string[]
  /** `path` joined with dots. */
  key: string
  /** The top-level key the field sits under. */
  section: string
  /** The field's type tag once wrappers are peeled (`string`, `enum`, `record`, ...). */
  kind: string
  /** The meta `label`, or the last path segment. */
  label: string
  /** The `.describe()` text, read through wrappers; empty when none. */
  description: string
  /** The meta `help`, or `description` when none. */
  help: string
  /** The meta `control`, or one chosen by `kind` (see {@link defaultControl}). */
  control: string
  /** Set on the field or on an object above it. */
  hidden: boolean
  /** The `.meta({ secret: true })` flag on the field or an object above it. A secret inside a record or array is not seen here; see `./secret.ts` for that walk. */
  secret: boolean
  /** Whether the value may be absent: it or an object above it is optional, nullable or defaulted. */
  optional: boolean
  /** What the field takes when unset (its own default, else the one its parent object's default gives it); `undefined` when none. */
  default: unknown
  /** The allowed values of an enum field, `null` for any other. */
  choices: string[] | null
}

const FieldMetaSchema = z.object(fieldMetaShape)

/**
 * The control a field gets without a meta `control`: `toggle` for a boolean,
 * `number` for a number, `select` for an enum, `list` for an array, `map`
 * for a record, `text` for everything else.
 *
 * @experimental
 */
export function defaultControl(kind: string): string {
  switch (kind) {
    case 'boolean':
      return 'toggle'
    case 'number':
      return 'number'
    case 'enum':
      return 'select'
    case 'array':
      return 'list'
    case 'record':
      return 'map'
    default:
      return 'text'
  }
}

/**
 * The meta of `schema` and of each wrapper layer under it (`.optional()`,
 * `.default()`...), the outer layer winning, so a `.meta()` set before a
 * later wrap still counts.
 */
function metaOf(
  schema: z.ZodType,
  path: string[],
): FieldMeta & { secret?: boolean; description: string } {
  let raw: Record<string, unknown> = {}
  for (let cur: z.ZodTypeAny | undefined = schema; cur !== undefined; cur = peelOnce(cur)) {
    raw = { ...((z.globalRegistry.get(cur) ?? {}) as Record<string, unknown>), ...raw }
  }
  const parsed = FieldMetaSchema.safeParse(raw)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`field meta at ${path.join('.')} is malformed: ${detail}`)
  }
  const description = typeof raw['description'] === 'string' ? raw['description'].trim() : ''
  return { ...parsed.data, secret: raw['secret'] === true, description }
}

/**
 * Every leaf of the config `shape` (a top-level key to schema map, as
 * `topLevelKeys` takes), in declaration order.
 *
 * @throws When a field's {@link FieldMeta} is malformed or the schema is recursive; the message names the path.
 *
 * @experimental
 */
export function configFields(shape: Record<string, z.ZodType>): ConfigField[] {
  const out: ConfigField[] = []
  const visit = (
    schema: z.ZodType,
    path: string[],
    inherited: {
      hidden: boolean
      secret: boolean
      optional: boolean
      hasDefault: boolean
      default: unknown
    },
    ancestors: Set<unknown>,
  ): void => {
    const meta = metaOf(schema, path)
    const isHidden = inherited.hidden || meta.hidden === true
    const isSecret = inherited.secret || meta.secret === true
    const info = fieldInfo(schema as z.ZodTypeAny)
    const ownDefault = defaultOf(schema)
    const inner = unwrapSchema(schema as z.ZodTypeAny)
    const kind = kindOf(schema as z.ZodTypeAny) ?? 'unknown'
    const children = kind === 'object' ? Object.entries(shapeOf(inner)) : []
    if (children.length > 0) {
      if (ancestors.has(inner)) {
        throw new Error(`configFields found a recursive schema at ${path.join('.')}`)
      }
      const here = inherited.hasDefault ? inherited.default : ownDefault
      const next = {
        hidden: isHidden,
        secret: isSecret,
        optional: inherited.optional || info.optional,
      }
      ancestors.add(inner)
      for (const [name, child] of children) {
        const hasDefault = typeof here === 'object' && here !== null && Object.hasOwn(here, name)
        const childDefault = hasDefault ? (here as Record<string, unknown>)[name] : undefined
        visit(child, [...path, name], { ...next, hasDefault, default: childDefault }, ancestors)
      }
      ancestors.delete(inner)
      return
    }
    const description = meta.description
    out.push({
      path,
      key: path.join('.'),
      section: path[0]!,
      kind,
      label: meta.label ?? path[path.length - 1]!,
      description,
      help: meta.help ?? description,
      control: meta.control ?? defaultControl(kind),
      hidden: isHidden,
      secret: isSecret,
      optional: inherited.optional || info.optional,
      default: inherited.hasDefault ? inherited.default : ownDefault,
      choices: enumValues(schema as z.ZodTypeAny),
    })
  }
  for (const [key, schema] of Object.entries(shape))
    visit(
      schema,
      [key],
      { hidden: false, secret: false, optional: false, hasDefault: false, default: undefined },
      new Set(),
    )
  return out
}
