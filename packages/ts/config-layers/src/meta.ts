/**
 * Machine-readable metadata for every top-level key of a tool's project config
 * (`tooly.yaml` for a tool named `tooly`).
 *
 * Each top-level key of the tool's config schema (built from its section
 * modules) carries a Zod 4 `.meta()` block of shape {@link ConfigKeyMeta},
 * next to its `.describe()` prose. Both go into `z.globalRegistry`, so
 * `schema.meta()` on a top-level key returns the merged
 * `{ description, category, consumers, layers, applies_via, enforcement, runs_in }` record.
 * `tooly config list|explain`, the generated `tooly.yaml` reference, an apply
 * command (keyed by the applier name) and a drift report all read that record.
 * So it is validated here, not trusted. {@link checkConfigMeta} reports every
 * key whose meta is missing or malformed. A tool's meta test runs it against
 * the tool's real schema and fails on any report (`./meta-kit.ts` holds the
 * checks). The terms a block may use (categories, appliers, layers, run
 * contexts, enforcement levels) belong to the tool and are declared with
 * `defineConfigVocabulary` (`./vocabulary.ts`). This module holds the structure
 * they fill.
 *
 * Meta is required on top-level keys only. A nested field carries just a
 * `.describe()`. Category, layers, applier and run context belong to a section
 * as a whole, and a nested field inherits its section's. The one exception is
 * the optional `secret` flag, which a nested field may set itself
 * (`./secret.ts`).
 *
 * `.meta()` must be the last call on a key's schema chain.
 * `defineConfigSection` (`./section.ts`) makes it the last call, so a section
 * author passes `meta:` and never calls `.meta()` directly. `.default()`,
 * `.prefault()` and `.optional()` each wrap the schema in a new instance, and
 * the registry is keyed by instance. Meta set before a wrap is therefore not
 * visible on the wrapper that the schema's `shape` holds. `.describe()` before
 * or after `.meta()` is fine: both register on a clone, and the parent's entry
 * is merged into it.
 *
 * Functions here take a schema shape as an argument. The module knows no
 * tool's schema.
 */

import { z } from 'zod'

/**
 * The term sets a config vocabulary fixes (`./vocabulary.ts`). Each defaults to
 * `string`, so a section defined without a vocabulary carries plain strings and
 * {@link checkConfigMeta} checks only their structure.
 * @experimental
 */
export interface MetaTerms {
  category: string
  applier: string
  layer: string
  runContext: string
  enforcement: string
}

/**
 * The name of the project layer, the committed project file. The library
 * reads three layers itself: this one, its overlay (`./loader.ts`), and the
 * machine file (`./machine.ts`). A vocabulary lists all three and may add its
 * own.
 * @experimental
 */
export const PROJECT_LAYER = 'project'
/**
 * The name of the local overlay layer, the per-checkout file that is not committed.
 * @experimental
 */
const LOCAL_LAYER = 'local'
/**
 * The name of the machine layer, the per-user file in the config home.
 * @experimental
 */
export const MACHINE_LAYER = 'machine'
/**
 * The layers the library itself reads, in order: project, local and machine.
 * @experimental
 */
export const LIBRARY_LAYERS = [PROJECT_LAYER, LOCAL_LAYER, MACHINE_LAYER] as const

/**
 * How a change to a key takes effect: `read` (its consumers read it at run
 * time, so editing the file is enough) or `apply:<applier>` (the tool's apply
 * step must run before the change is live).
 * @experimental
 */
export type AppliesVia<A extends string = string> = 'read' | `apply:${A}`

/**
 * The prefix of an `apply:<applier>` value.
 *
 * @experimental
 */
export const APPLY_PREFIX = 'apply:'

/**
 * A consumer entry: either a source reference `<path>.ts#<symbol>`, or
 * `planned:<note>` for a reserved section whose reader has not been built yet.
 * The path is relative to the owning tool's source root. The symbol is an
 * identifier in that file where the key is read.
 * @experimental
 */
export const CONSUMER_REF = /^[a-z0-9_][a-z0-9_./-]*\.ts#[A-Za-z_$][\w$]*$/
/**
 * The prefix that marks a consumer as planned, not yet implemented: `planned:<note>`.
 * @experimental
 */
export const PLANNED_PREFIX = 'planned:'
/**
 * A schema for a key's consumer: `<path>.ts#<symbol>`, or `planned:<note>` when none exists yet.
 * @experimental
 */
export const ConsumerSchema = z
  .string()
  .refine(
    (s) =>
      CONSUMER_REF.test(s) || (s.startsWith(PLANNED_PREFIX) && s.length > PLANNED_PREFIX.length),
    {
      message: 'a consumer is `<path>.ts#<symbol>` or `planned:<note>`',
    },
  )

function unique<T extends z.ZodType>(item: T) {
  return z
    .array(item)
    .min(1)
    .refine((xs) => new Set(xs).size === xs.length, { message: 'entries must be unique' })
}

/**
 * A deprecation notice, shared by a config key's meta and any other described item:
 * since which release it is deprecated, the release that removes it, and what
 * to use instead. A deprecated key stays in the schema and loads normally.
 * The loader warns once per key. A later release removes the key outright.
 * @experimental
 */
export const DeprecationSchema = z
  .object({
    since: z.string().min(1),
    removeIn: z.string().min(1),
    use: z.string().min(1).optional(),
  })
  .strict()
/**
 * The deprecation notice of a key: the version it was deprecated in, the version that removes it, and an optional replacement.
 * @experimental
 */
export type Deprecation = z.infer<typeof DeprecationSchema>

/**
 * Whether a key is covered by the consumer's compatibility promise. Absent
 * means `stable`. `experimental` keys are outside that promise. The library
 * only carries the level. The consumer decides what each level promises.
 * @experimental
 */
export const STABILITY_LEVELS = ['stable', 'experimental'] as const
/**
 * A schema for the stability level of a key: `stable` or `experimental`.
 * @experimental
 */
export const StabilitySchema = z.enum(STABILITY_LEVELS)
/**
 * The stability level of a key: `stable` or `experimental`.
 * @experimental
 */
export type Stability = z.infer<typeof StabilitySchema>

/**
 * The meta a top-level key's author passes as `meta:` when defining a section.
 *
 * @experimental
 */
// A type alias, not an interface, so it is assignable to Zod's index-signature `.meta()` parameter.
export type ConfigKeyMeta<T extends MetaTerms = MetaTerms> = {
  category: T['category']
  consumers: string[]
  layers: T['layer'][]
  applies_via: AppliesVia<T['applier']>
  enforcement: T['enforcement']
  runs_in: T['runContext'][]
  /**
   * `secret: true` marks a key whose value must never be in the project file (a
   * webhook URL carries its own credential). See `./secret.ts`. On a top-level
   * key it covers the whole section. A nested field sets it with `.meta({ secret: true })`.
   */
  secret?: boolean | undefined
  stability?: Stability | undefined
  /**
   * Set while the key is deprecated, absent otherwise. Named `deprecation`
   * because Zod's own registry meta reserves `deprecated` as a boolean.
   */
  deprecation?: Deprecation | undefined
}

/**
 * What `schema.meta()` returns for a well-formed top-level key: the authored
 * meta plus the `.describe()` prose the registry merged in.
 * @experimental
 */
export type RegisteredKeyMeta<T extends MetaTerms = MetaTerms> = ConfigKeyMeta<T> & {
  description: string
}

/** The schemas a meta block's term fields are checked against. */
export interface MetaTermSchemas {
  category: z.ZodType<string>
  applier: z.ZodEnum | z.ZodString | null
  layer: z.ZodType<string>
  runContext: z.ZodType<string>
  enforcement: z.ZodType<string>
}

/**
 * `read` or `apply:<applier>`, with the applier checked by `applier`. `null`
 * means the vocabulary has no appliers, so only `read` passes. It is a
 * template literal, so the JSON Schema states the `apply:` pattern.
 */
export function appliesViaSchema(applier: z.ZodEnum | z.ZodString | null): z.ZodType<AppliesVia> {
  if (applier === null) return z.literal('read')
  return z.union([
    z.literal('read'),
    z.templateLiteral([APPLY_PREFIX, applier]),
  ]) as unknown as z.ZodType<AppliesVia>
}

/** The authored-meta schema over the given term schemas. */
export function keyMetaSchema(terms: MetaTermSchemas) {
  return z
    .object({
      category: terms.category,
      consumers: unique(ConsumerSchema),
      layers: unique(terms.layer),
      applies_via: appliesViaSchema(terms.applier),
      enforcement: terms.enforcement,
      runs_in: unique(terms.runContext),
      secret: z.boolean().optional(),
      stability: StabilitySchema.optional(),
      deprecation: DeprecationSchema.optional(),
    })
    .strict()
}

/** The registered-meta schema: {@link keyMetaSchema} plus the description. */
export function registeredKeyMetaSchema(terms: MetaTermSchemas) {
  return keyMetaSchema(terms)
    .extend({ description: z.string().trim().min(1) })
    .strict()
}

const anyTerm = z.string().min(1)

/** The term schemas with no vocabulary: any non-empty string. */
const STRUCTURE_ONLY: MetaTermSchemas = {
  category: anyTerm,
  applier: anyTerm,
  layer: anyTerm,
  runContext: anyTerm,
  enforcement: anyTerm,
}

/**
 * Authored meta checked for structure only: every term a non-empty string.
 *
 * @experimental
 */
export const ConfigKeyMetaSchema = keyMetaSchema(STRUCTURE_ONLY)

/**
 * Registered meta checked for structure only.
 *
 * @experimental
 */
export const RegisteredKeyMetaSchema = registeredKeyMetaSchema(STRUCTURE_ONLY)

/**
 * What {@link checkConfigMeta} and {@link readConfigMeta} validate against: a
 * vocabulary's registered-meta schema (`./vocabulary.ts`).
 * @experimental
 */
export interface MetaValidator<T extends MetaTerms = MetaTerms> {
  readonly RegisteredKeyMetaSchema: z.ZodType<RegisteredKeyMeta<T>>
}

/**
 * True when every consumer of a key is a `planned:` entry, which makes the key reserved.
 *
 * @experimental
 */
export function isReserved(meta: Pick<ConfigKeyMeta, 'consumers'>): boolean {
  return meta.consumers.every((c) => c.startsWith(PLANNED_PREFIX))
}

/**
 * The applier a key names, or null for a `read` key.
 *
 * @experimental
 */
export function applierOf<A extends string = string>(meta: {
  applies_via: AppliesVia<A>
}): A | null {
  return meta.applies_via === 'read' ? null : (meta.applies_via.slice(APPLY_PREFIX.length) as A)
}

/**
 * Throws naming every key whose category is not in `categories`, so a key is
 * never silently left off a page grouped by category.
 *
 * @experimental
 */
export function assertKnownCategories(
  metas: Record<string, Pick<RegisteredKeyMeta, 'category'>>,
  categories: readonly string[],
): void {
  const stray = Object.entries(metas).filter(([, m]) => !categories.includes(m.category))
  if (stray.length > 0) {
    throw new Error(
      `config keys name a category not in the list (${categories.join(', ')}): ${stray.map(([k, m]) => `${k} (${m.category})`).join(', ')}`,
    )
  }
}

/**
 * One key whose meta is missing or malformed.
 *
 * @experimental
 */
export interface ConfigMetaIssue {
  key: string
  problem: string
}

/**
 * Check every key of an object schema's `shape` for a well-formed
 * {@link RegisteredKeyMeta}. With a `vocabulary`, each term must be one it
 * declares; without one, only the structure is checked. Returns one issue per
 * bad key (empty when all pass), so a test can print them all at once.
 * @experimental
 */
export function checkConfigMeta(
  shape: Record<string, z.ZodType>,
  vocabulary?: MetaValidator,
): ConfigMetaIssue[] {
  const metaSchema = vocabulary?.RegisteredKeyMetaSchema ?? RegisteredKeyMetaSchema
  const issues: ConfigMetaIssue[] = []
  for (const [key, schema] of Object.entries(shape)) {
    const raw = schema.meta()
    if (raw === undefined) {
      issues.push({ key, problem: 'no .meta() (it must be the last call on the key schema chain)' })
      continue
    }
    const parsed = metaSchema.safeParse(raw)
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')
      issues.push({ key, problem: detail })
    }
  }
  return issues
}

/**
 * The parsed meta of every key of `shape`, in declaration order. Throws when
 * any key's meta is missing or malformed ({@link checkConfigMeta} reports why),
 * so a reader never silently skips a key.
 * @experimental
 */
export function readConfigMeta<T extends MetaTerms = MetaTerms>(
  shape: Record<string, z.ZodType>,
  vocabulary?: MetaValidator<T>,
): Record<string, RegisteredKeyMeta<T>> {
  const issues = checkConfigMeta(shape, vocabulary)
  if (issues.length > 0) {
    throw new Error(
      `config key meta is incomplete:\n${issues.map((i) => `  ${i.key}: ${i.problem}`).join('\n')}`,
    )
  }
  const schema = vocabulary?.RegisteredKeyMetaSchema ?? RegisteredKeyMetaSchema
  const out: Record<string, RegisteredKeyMeta<T>> = {}
  for (const [key, keySchema] of Object.entries(shape)) {
    out[key] = schema.parse(keySchema.meta()) as RegisteredKeyMeta<T>
  }
  return out
}
