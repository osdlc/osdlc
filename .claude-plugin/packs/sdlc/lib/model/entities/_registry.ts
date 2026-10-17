/**
 * Entity Zod-schema registry — `type → { schema, version }`.
 *
 * The single place the entity-agnostic ops (`entities validate`, `entities
 * audit`, `entities migrate`) and the authoring/pattern helpers resolve a
 * per-type Zod schema by name.
 *
 * Each entry carries:
 *   - `schema` — the per-type Zod schema (a `CommonFrontmatter.extend(...)`
 *     object, possibly `.strict()` + `.superRefine()`-wrapped). Typed as
 *     `ZodEntitySchema` (a union of the strict-object and effects-wrapped
 *     shapes) so a caller can `.safeParse` it uniformly. The precise
 *     `z.infer<...>` type for typed hydration lives on each per-type module's
 *     own type export (e.g. `Task`, `Backlog`).
 *   - `version` — the schema version string. Audit reads it for
 *     schema_version-drift detection; authoring stamps new instances at it.
 *
 * There are no `schema.json` files on disk: JSON consumers read the in-memory
 * `zodToJsonSchema` projection in `_json_schema.ts`, resolved through this same
 * registry.
 */

import { z } from 'zod'

import { extractDefault, unwrapToInner, unwrapToObject } from '@lib/util/zod_introspect'

import { BacklogSchema, SCHEMA_VERSION as BACKLOG_VERSION } from './backlog/schema.ts'
import { CapabilitySchema, SCHEMA_VERSION as CAPABILITY_VERSION } from './capability/schema.ts'
import { DecisionSchema, SCHEMA_VERSION as DECISION_VERSION } from './decision/schema.ts'
import { DriverSchema, SCHEMA_VERSION as DRIVER_VERSION } from './driver/schema.ts'
import { FrictionSchema, SCHEMA_VERSION as FRICTION_VERSION } from './friction/schema.ts'
import { MilestoneSchema, SCHEMA_VERSION as MILESTONE_VERSION } from './milestone/schema.ts'
import { NoteSchema, SCHEMA_VERSION as NOTE_VERSION } from './note/schema.ts'
import { PrincipleSchema, SCHEMA_VERSION as PRINCIPLE_VERSION } from './principle/schema.ts'
import { ProductSchema, SCHEMA_VERSION as PRODUCT_VERSION } from './product/schema.ts'
import { ReferenceSchema, SCHEMA_VERSION as REFERENCE_VERSION } from './reference/schema.ts'
import { RoadmapSchema, SCHEMA_VERSION as ROADMAP_VERSION } from './roadmap/schema.ts'
import { StandardSchema, SCHEMA_VERSION as STANDARD_VERSION } from './standard/schema.ts'
import { TaskSchema, SCHEMA_VERSION as TASK_VERSION } from './task/schema.ts'
import { TermSchema, SCHEMA_VERSION as TERM_VERSION } from './term/schema.ts'

/**
 * The shape every per-type schema satisfies for `.safeParse`. A per-type
 * schema is either a bare strict object (`ZodObject`) or that object wrapped in
 * `.superRefine` (`ZodEffects`); both expose `.safeParse`/`.parse`. Typed as
 * `ZodType<unknown>` so the registry is heterogeneous-safe — callers parse to
 * `unknown` and narrow via the per-module `z.infer` type when they need the
 * precise shape (AC-1's typed hydration).
 */
export type ZodEntitySchema = z.ZodType<unknown>

export interface EntitySchemaEntry {
  /** The per-type Zod schema (parse target). */
  schema: ZodEntitySchema
  /** Schema version string (mirrors the JSON `version`). */
  version: string
  /**
   * Canonical frontmatter key order — the order `entities migrate` normalizes
   * an instance's frontmatter to. For the eight `$ref`-based types this equals
   * the underlying object's `.shape` key order (common fields first, per-type
   * extras after — identical to what the retired JSON resolver's
   * `Object.keys(properties)` produced). For `capability` / `driver` /
   * `product` — which declared their full property set inline in the JSON in a
   * BESPOKE order (`kind` interleaved among the common fields, capability's
   * tree/anchor fields before `related`) — this preserves that historical
   * order verbatim, so the swap does not silently reorder those live instance
   * files when migrate next runs. See `keyOrderFor`.
   */
  keyOrder: string[]
}

/** The underlying object's `.shape` key order for a schema. */
function shapeKeyOrder(schema: ZodEntitySchema): string[] {
  const obj = unwrapToObject(schema)
  return obj ? Object.keys(obj.shape) : []
}

/**
 * The default frontmatter values a schema's `.default()` keywords provide —
 * the Zod-side equivalent of reading each JSON property's `default` keyword
 * (what `scaffold` / `authorEntity` did off the JSON). Walks the unwrapped
 * object's shape; for every field that is a `ZodDefault` (directly, or under an
 * `optional`/`nullable` wrapper) it evaluates the default and records it.
 * Fields without a default are omitted (the caller supplies required values).
 *
 * `schema_version` is intentionally NOT defaulted here even when a per-type
 * schema declared a `.default()` for it — the registry's `version` constant is
 * the single source of truth, applied by the caller — so this never disagrees
 * with the live version.
 */
export function defaultsForSchema(schema: ZodEntitySchema): Record<string, unknown> {
  const obj = unwrapToObject(schema)
  if (obj === null) return {}
  const out: Record<string, unknown> = {}
  for (const [name, field] of Object.entries(obj.shape)) {
    if (name === 'schema_version') continue
    const def = extractDefault(field as z.ZodTypeAny)
    if (def.has) out[name] = def.value
  }
  return out
}

/**
 * Historical (pre-Zod) canonical key order for the three types whose
 * `schema.json` declared the common fields INLINE in a bespoke order rather
 * than via the `_common.json` `$ref`. Hard-coded here so migrate's output stays
 * byte-identical to the JSON-resolver era for the live capability/driver/product
 * corpus. The `$ref`-based types are absent from this map and fall back to
 * `shapeKeyOrder` (which equals their historical order).
 */
const HISTORICAL_KEY_ORDER: Record<string, string[]> = {
  capability: [
    'type',
    'schema_version',
    'id',
    'state',
    'title',
    // The two capability axes sit adjacent: structural grain, then audience
    // (schema v2, [[T-2KK8-capability-kind-grains-and-locations]]).
    'kind',
    'audience',
    'created',
    'last_reviewed',
    'parent_key',
    // `locations` takes the slot the dropped `contains` inverse held
    // ([[T-SJH1]]): tree wiring, then code anchors, then cross-references.
    'locations',
    'related',
    'tags',
    'need_human_review',
    'created_at',
    'provenance',
  ],
  driver: [
    'type',
    'schema_version',
    'id',
    'state',
    'title',
    'kind',
    'product',
    'created',
    'last_reviewed',
    'related',
    'tags',
    'need_human_review',
    'created_at',
    'provenance',
  ],
  product: [
    'type',
    'schema_version',
    'id',
    'state',
    'title',
    'created',
    'last_reviewed',
    'related',
    'tags',
    'need_human_review',
    'created_at',
    'provenance',
  ],
}

/** Canonical key order for a type: historical override, else the shape order. */
function keyOrderFor(type: string, schema: ZodEntitySchema): string[] {
  return HISTORICAL_KEY_ORDER[type] ?? shapeKeyOrder(schema)
}

/**
 * `type name → { schema, version }`. Keys are the entity type names, which
 * equal the per-type directory basenames under `model/entities/` — so a caller
 * resolving an explicit `--schema <…>/<type>/schema.json` path can map back to
 * the Zod schema by the path's parent-directory basename (see
 * `entryForSchemaPath`).
 */
function entry(type: string, schema: ZodEntitySchema, version: string): EntitySchemaEntry {
  return { schema, version, keyOrder: keyOrderFor(type, schema) }
}

export const ENTITY_SCHEMAS: Record<string, EntitySchemaEntry> = {
  backlog: entry('backlog', BacklogSchema, BACKLOG_VERSION),
  capability: entry('capability', CapabilitySchema, CAPABILITY_VERSION),
  decision: entry('decision', DecisionSchema, DECISION_VERSION),
  driver: entry('driver', DriverSchema, DRIVER_VERSION),
  friction: entry('friction', FrictionSchema, FRICTION_VERSION),
  milestone: entry('milestone', MilestoneSchema, MILESTONE_VERSION),
  note: entry('note', NoteSchema, NOTE_VERSION),
  principle: entry('principle', PrincipleSchema, PRINCIPLE_VERSION),
  product: entry('product', ProductSchema, PRODUCT_VERSION),
  reference: entry('reference', ReferenceSchema, REFERENCE_VERSION),
  roadmap: entry('roadmap', RoadmapSchema, ROADMAP_VERSION),
  standard: entry('standard', StandardSchema, STANDARD_VERSION),
  task: entry('task', TaskSchema, TASK_VERSION),
  term: entry('term', TermSchema, TERM_VERSION),
}

/** Resolve a registry entry by entity type name, or `undefined` if unknown. */
export function entryForType(type: string): EntitySchemaEntry | undefined {
  return ENTITY_SCHEMAS[type]
}

/** Resolve the Zod schema for a type, or `undefined` if unknown. */
export function schemaForType(type: string): ZodEntitySchema | undefined {
  return ENTITY_SCHEMAS[type]?.schema
}

/**
 * Map an explicit `schema.json` path to its registry entry by the path's
 * parent-directory basename (`…/entities/<type>/schema.json` → `<type>`). Used
 * by `entities validate --schema <path>` to route a known on-disk JSON schema
 * path to its Zod source of truth. Returns `{ type, entry }` or `undefined`
 * when the parent dir is not a registered type.
 */
export function entryForSchemaPath(
  schemaPath: string,
): { type: string; entry: EntitySchemaEntry } | undefined {
  const parts = schemaPath.split(/[\\/]/).filter((p) => p.length > 0)
  // The basename of the parent directory is parts[len-2] (parts[len-1] is the
  // schema filename itself).
  if (parts.length < 2) return undefined
  const parentDir = parts[parts.length - 2]!
  const entry = ENTITY_SCHEMAS[parentDir]
  if (entry === undefined) return undefined
  return { type: parentDir, entry }
}

/** Every registered entity type name, sorted. */
export function entityTypeNames(): string[] {
  return Object.keys(ENTITY_SCHEMAS).sort()
}

/**
 * The `state` field's enum values for a type, read off the Zod schema — the
 * Zod-side equivalent of reading `properties.state.enum` off the JSON.
 * Scaffolder choice-lists derive from this so they can never offer a value the
 * validator rejects. Peels the `ZodDefault`/`ZodOptional` wrappers around the
 * state field to reach the underlying `ZodEnum`. Throws if the type is
 * unregistered or its `state` field is not an enum (a programmer error).
 */
export function stateEnumFor(type: string): string[] {
  const obj = unwrapToObject(schemaForType(type) ?? (undefined as never))
  if (obj === null) {
    throw new Error(`no Zod schema registered for entity type '${type}'`)
  }
  const state = obj.shape['state'] as z.ZodTypeAny | undefined
  const inner = state === undefined ? undefined : unwrapToInner(state)
  if (inner instanceof z.ZodEnum) {
    return [...(inner.options as readonly string[])]
  }
  throw new Error(`state field for entity type '${type}' is not a Zod enum`)
}
