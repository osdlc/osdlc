/**
 * A tool's config vocabulary: the terms its per-key meta (`./meta.ts`) may use.
 *
 * The library fixes the shape of a meta block. The tool fixes the words that
 * fill it. {@link defineConfigVocabulary} takes the tool's categories, appliers,
 * layers, run contexts and enforcement levels, and returns schemas and helpers
 * typed to them. {@link ConfigVocabulary.defineSection} type-checks a section's
 * meta against the terms. {@link ConfigVocabulary.checkMeta} checks a schema's
 * meta at run time.
 *
 * Some words have a meaning in the library. The layers must include the three
 * the library reads itself (`project`, `local`, `machine`), and may add more.
 * `enforcement.reserved` and `enforcement.applied` name the levels that
 * `enforcementProblems` (`./meta-kit.ts`) ties to a reserved key and to an
 * `apply:<applier>` key.
 */

import { z } from 'zod'

import {
  LIBRARY_LAYERS,
  appliesViaSchema,
  checkConfigMeta,
  keyMetaSchema,
  readConfigMeta,
  registeredKeyMetaSchema,
  type AppliesVia,
  type ConfigKeyMeta,
  type ConfigMetaIssue,
  type RegisteredKeyMeta,
} from './meta.ts'
import { defineConfigSection, type ConfigSection, type ConfigSectionHooks } from './section.ts'

/**
 * What a tool passes to {@link defineConfigVocabulary}.
 *
 * @experimental
 */
export interface ConfigVocabularySpec<
  C extends string = string,
  A extends string = string,
  L extends string = string,
  R extends string = string,
  E extends string = string,
> {
  /** Groupings for listings; this order is the reference and starter file order. */
  categories: readonly [C, ...C[]]
  /** The names an `apply:<name>` value may use. May be empty: then only `read` passes. */
  appliers: readonly A[]
  /** The files that may set a key. Must include `project`, `local` and `machine`. */
  layers: readonly [L, ...L[]]
  /** Where a key's consumers run. */
  runContexts: readonly [R, ...R[]]
  enforcement: {
    /** How strongly the tool supports a key, strongest first. */
    levels: readonly [E, ...E[]]
    /** The level that means "accepted, nothing reads it yet". A key has it exactly when it is reserved. */
    reserved?: E
    /** The level that means "takes effect only through an applier". A key has it exactly when it is an `apply:` key. */
    applied?: E
  }
}

/**
 * The term types a spec fixes.
 *
 * @experimental
 */
export interface TermsOf<
  C extends string,
  A extends string,
  L extends string,
  R extends string,
  E extends string,
> {
  category: C
  applier: A
  layer: L
  runContext: R
  enforcement: E
}

type EnumOf<T extends string> = z.ZodEnum<{ [K in T]: K }>

/**
 * The schemas and helpers {@link defineConfigVocabulary} returns.
 *
 * @experimental
 */
export interface ConfigVocabulary<
  C extends string = string,
  A extends string = string,
  L extends string = string,
  R extends string = string,
  E extends string = string,
> {
  readonly spec: ConfigVocabularySpec<C, A, L, R, E>
  readonly CategorySchema: EnumOf<C>
  readonly ApplierSchema: EnumOf<A>
  readonly LayerSchema: EnumOf<L>
  readonly RunContextSchema: EnumOf<R>
  readonly EnforcementSchema: EnumOf<E>
  readonly AppliesViaSchema: z.ZodType<AppliesVia<A>>
  /** The authored meta, each term checked against this vocabulary. */
  readonly KeyMetaSchema: z.ZodType<ConfigKeyMeta<TermsOf<C, A, L, R, E>>>
  /** {@link KeyMetaSchema} plus the `.describe()` prose the registry merges in. */
  readonly RegisteredKeyMetaSchema: z.ZodType<RegisteredKeyMeta<TermsOf<C, A, L, R, E>>>
  /** `defineConfigSection` with the meta type-checked against this vocabulary. */
  defineSection<const K extends string, S extends z.ZodType>(
    section: ConfigSectionHooks<S> & {
      key: K
      schema: S
      meta: ConfigKeyMeta<TermsOf<C, A, L, R, E>>
    },
  ): ConfigSection<K, S, TermsOf<C, A, L, R, E>>
  /** `checkConfigMeta` against this vocabulary. */
  checkMeta(shape: Record<string, z.ZodType>): ConfigMetaIssue[]
  /** `readConfigMeta` against this vocabulary. */
  readMeta(
    shape: Record<string, z.ZodType>,
  ): Record<string, RegisteredKeyMeta<TermsOf<C, A, L, R, E>>>
}

/** Each entry non-empty and listed once; throws naming the list otherwise. */
function checkList(name: string, list: readonly string[], required: boolean): void {
  if (required && list.length === 0) throw new Error(`config vocabulary: ${name} is empty`)
  for (const term of list) {
    if (typeof term !== 'string' || term.trim() === '') {
      throw new Error(`config vocabulary: ${name} has an empty term`)
    }
  }
  const dup = list.find((term, i) => list.indexOf(term) !== i)
  if (dup !== undefined) throw new Error(`config vocabulary: ${name} lists '${dup}' twice`)
}

function enumOf<T extends string>(list: readonly T[]): EnumOf<T> {
  return z.enum(list as unknown as [T, ...T[]]) as unknown as EnumOf<T>
}

/**
 * Build a vocabulary from a tool's terms. Throws when a list is empty where it
 * may not be, repeats a term, leaves out a library layer, or names an
 * enforcement level for `reserved`/`applied` that `levels` does not hold.
 * @experimental
 */
export function defineConfigVocabulary<
  const C extends string,
  const A extends string,
  const L extends string,
  const R extends string,
  const E extends string,
>(spec: ConfigVocabularySpec<C, A, L, R, E>): ConfigVocabulary<C, A, L, R, E> {
  checkList('categories', spec.categories, true)
  checkList('appliers', spec.appliers, false)
  checkList('layers', spec.layers, true)
  checkList('runContexts', spec.runContexts, true)
  checkList('enforcement.levels', spec.enforcement.levels, true)
  for (const layer of LIBRARY_LAYERS) {
    if (!(spec.layers as readonly string[]).includes(layer)) {
      throw new Error(`config vocabulary: layers must include '${layer}'`)
    }
  }
  for (const role of ['reserved', 'applied'] as const) {
    const level = spec.enforcement[role]
    if (level !== undefined && !spec.enforcement.levels.includes(level)) {
      throw new Error(`config vocabulary: enforcement.${role} '${level}' is not one of the levels`)
    }
  }

  type T = TermsOf<C, A, L, R, E>
  const CategorySchema = enumOf(spec.categories)
  const ApplierSchema = enumOf(spec.appliers)
  const LayerSchema = enumOf(spec.layers)
  const RunContextSchema = enumOf(spec.runContexts)
  const EnforcementSchema = enumOf(spec.enforcement.levels)
  const terms = {
    category: CategorySchema,
    applier: spec.appliers.length > 0 ? ApplierSchema : null,
    layer: LayerSchema,
    runContext: RunContextSchema,
    enforcement: EnforcementSchema,
  }
  const RegisteredKeyMetaSchema = registeredKeyMetaSchema(terms) as unknown as z.ZodType<
    RegisteredKeyMeta<T>
  >
  const validator = { RegisteredKeyMetaSchema }

  return {
    spec,
    CategorySchema,
    ApplierSchema,
    LayerSchema,
    RunContextSchema,
    EnforcementSchema,
    AppliesViaSchema: appliesViaSchema(terms.applier) as z.ZodType<AppliesVia<A>>,
    KeyMetaSchema: keyMetaSchema(terms) as unknown as z.ZodType<ConfigKeyMeta<T>>,
    RegisteredKeyMetaSchema,
    defineSection: (section) => defineConfigSection(section) as never,
    checkMeta: (shape) => checkConfigMeta(shape, validator),
    readMeta: (shape) => readConfigMeta(shape, validator),
  }
}
