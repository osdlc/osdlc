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

import { defaultOf, descriptionOf } from './explain.ts'
import { fieldMetaShape, type FieldMeta } from './meta.ts'
import { enumValues, fieldInfo, kindOf, shapeOf, unwrapSchema } from './schema.ts'

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
  /** The `.describe()` text; empty when none. */
  description: string
  /** The meta `help`, or `description` when none. */
  help: string
  /** The meta `control`, or one chosen by `kind` (see {@link defaultControl}). */
  control: string
  /** Set on the field or on an object above it. */
  hidden: boolean
  /** The `.meta({ secret: true })` flag; see `./secret.ts`. */
  secret: boolean
  /** Whether the value may be absent: optional, nullable or defaulted. */
  optional: boolean
  /** What the field takes when unset; `undefined` when it has no default. */
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
    case 'int':
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

function metaOf(schema: z.ZodType, path: string[]): FieldMeta & { secret?: boolean } {
  const raw = (z.globalRegistry.get(schema) ?? {}) as Record<string, unknown>
  const parsed = FieldMetaSchema.safeParse(raw)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`field meta at ${path.join('.')} is malformed: ${detail}`)
  }
  return { ...parsed.data, secret: raw['secret'] === true }
}

/**
 * Every leaf of the config `shape` (a top-level key to schema map, as
 * `topLevelKeys` takes), in declaration order. Throws, naming the path, when
 * a field's `label`, `help`, `control` or `hidden` is malformed.
 *
 * @experimental
 */
export function configFields(shape: Record<string, z.ZodType>): ConfigField[] {
  const out: ConfigField[] = []
  const visit = (schema: z.ZodType, path: string[], hidden: boolean, secret: boolean): void => {
    const meta = metaOf(schema, path)
    const isHidden = hidden || meta.hidden === true
    const isSecret = secret || meta.secret === true
    const inner = unwrapSchema(schema as z.ZodTypeAny)
    const kind = kindOf(schema as z.ZodTypeAny) ?? 'unknown'
    const children = kind === 'object' ? Object.entries(shapeOf(inner)) : []
    if (children.length > 0) {
      for (const [name, child] of children) visit(child, [...path, name], isHidden, isSecret)
      return
    }
    const description = descriptionOf(schema)
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
      optional: fieldInfo(schema as z.ZodTypeAny).optional,
      default: defaultOf(schema),
      choices: enumValues(schema as z.ZodTypeAny),
    })
  }
  for (const [key, schema] of Object.entries(shape)) visit(schema, [key], false, false)
  return out
}
