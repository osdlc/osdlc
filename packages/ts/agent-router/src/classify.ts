// Classifier rules: data that places each catalogue model in a tier, or
// leaves it `unclassified`. The category chains (`expandChain`) and the
// tier-per-tool mapping are generated from the placement. Rules ship here and a
// project adds its own under `router.classify`, tried first.
import { z } from 'zod'

import type { Catalogue, Model } from './catalogue/types.ts'
import { deepFreeze } from './freeze.ts'
import { protoSafeRecord } from './record.ts'
import { TIERS, TOOL_ID_PATTERN, TRAITS, type Tier } from './ref.ts'

/** A model no rule places: it can be named exactly, but no tier picks it. */
export const UNCLASSIFIED = 'unclassified'

/** Where the classifier puts a model: a {@link Tier}, or `unclassified` when no rule places it. */
export type Placement = Tier | typeof UNCLASSIFIED

const PlacementSchema = z.enum([...TIERS, UNCLASSIFIED])
const ProviderSchema = z.string().regex(TOOL_ID_PATTERN, 'must be a lower-case identifier')
const THRESHOLD = /^(<=|>=|<|>)(\d+(?:\.\d+)?)b$/i
const ThresholdSchema = z
  .string()
  .regex(THRESHOLD, 'must be a comparison and a size in billions, such as <10B or >=40B')

export const ClassifyRuleSchema = z
  .strictObject({
    provider: z
      .union([ProviderSchema, z.array(ProviderSchema).min(1)])
      .optional()
      .describe('The provider or providers the rule applies to; every provider when omitted.'),
    families: protoSafeRecord(z.string().min(1), PlacementSchema)
      .optional()
      .describe('Model family to tier (`claude-opus: max`), or `unclassified`.'),
    match: z
      .array(z.strictObject({ id: z.string().min(1), tier: PlacementSchema }))
      .optional()
      .describe('Model id globs (`*` matches any run) to tier, first match wins.'),
    by_parameters: z
      .strictObject({
        fast: ThresholdSchema.optional(),
        standard: ThresholdSchema.optional(),
        max: ThresholdSchema.optional(),
      })
      .optional()
      .describe(
        'Tier by parameter count read off the model id (`qwen3:4b`, `gemma-4-26b`): `{fast: "<10B", standard: "<40B", max: ">=40B"}`, tried fast first.',
      ),
    require_traits: z
      .array(z.enum(TRAITS))
      .optional()
      .describe('The rule matches only models that carry every one of these traits.'),
  })
  .refine(
    (r) => r.families !== undefined || r.match !== undefined || r.by_parameters !== undefined,
    'a rule needs families, match or by_parameters',
  )

/**
 * A classifier rule. It may name the `provider` (or providers) it applies to and `require_traits`
 * a model must carry, and it places models by `families` (model family to tier), `match` (id globs
 * to tier, first match wins) or `by_parameters` (tier by the parameter count in the id, such as
 * `<10B`). A rule may place a model `unclassified` on purpose.
 */
export type ClassifyRule = z.infer<typeof ClassifyRuleSchema>

/**
 * The shipped rules, fixed against the shipped snapshot's families. A family
 * no rule names (`claude-fable`, `gpt-terra`, the older `gpt`, `gpt-mini` and
 * `o` lines) stays unclassified until a rule places it.
 */
export const BUILTIN_CLASSIFY_RULES: readonly ClassifyRule[] = deepFreeze([
  {
    provider: 'anthropic',
    families: { 'claude-haiku': 'fast', 'claude-sonnet': 'standard', 'claude-opus': 'max' },
  },
  {
    provider: 'openai',
    families: { 'gpt-luna': 'fast', 'gpt-sol': 'standard', 'gpt-astra': 'max' },
  },
  {
    provider: 'google',
    families: { 'gemini-flash-lite': 'fast', 'gemini-flash': 'standard', 'gemini-pro': 'max' },
  },
  {
    provider: ['ollama', 'lmstudio'],
    by_parameters: { fast: '<10B', standard: '<40B', max: '>=40B' },
    require_traits: ['agent'],
  },
])

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}$`)
}

/**
 * The parameter count in billions that a model id carries, as local runtimes
 * tag them (`qwen3:4b`, `llama3.1:70b`, `gemma-4-26b-a4b-it`): the first
 * `<number>b` after a `:` or `-`. `undefined` when the id names none.
 */
export function parameterCount(id: string): number | undefined {
  const m = /[:-](\d+(?:\.\d+)?)b(?![a-z])/i.exec(id)
  return m === null ? undefined : Number(m[1])
}

function meets(count: number, threshold: string): boolean {
  const m = THRESHOLD.exec(threshold)
  if (m === null) return false
  const n = Number(m[2])
  switch (m[1]) {
    case '<':
      return count < n
    case '<=':
      return count <= n
    case '>':
      return count > n
    default:
      return count >= n
  }
}

function ruleFor(rule: ClassifyRule, model: Model): Placement | undefined {
  if (rule.provider !== undefined) {
    const providers = typeof rule.provider === 'string' ? [rule.provider] : rule.provider
    if (!providers.includes(model.provider)) return undefined
  }
  if (rule.require_traits?.some((t) => model.traits?.includes(t) !== true) === true) {
    return undefined
  }
  if (model.family !== undefined && rule.families !== undefined) {
    if (Object.hasOwn(rule.families, model.family)) return rule.families[model.family]
  }
  for (const m of rule.match ?? []) {
    if (globToRegExp(m.id).test(model.id)) return m.tier
  }
  if (rule.by_parameters !== undefined) {
    const count = parameterCount(model.id)
    if (count === undefined) return undefined
    for (const tier of TIERS) {
      const threshold = rule.by_parameters[tier]
      if (threshold !== undefined && meets(count, threshold)) return tier
    }
  }
  return undefined
}

/**
 * Where `rules` place `model`: the first rule that applies (its provider, its
 * required traits) and matches (by family, then id glob, then parameter count)
 * decides; a rule may place a model `unclassified` on purpose. A model no rule
 * matches is `unclassified`.
 */
export function classifyModel(model: Model, rules: readonly ClassifyRule[]): Placement {
  for (const rule of rules) {
    const placed = ruleFor(rule, model)
    if (placed !== undefined) return placed
  }
  return UNCLASSIFIED
}

/** Every catalogue model's placement, keyed `provider/id`. */
export function classify(
  catalogue: Pick<Catalogue, 'models'>,
  rules: readonly ClassifyRule[] = BUILTIN_CLASSIFY_RULES,
): Record<string, Placement> {
  const out: Record<string, Placement> = {}
  for (const model of Object.values(catalogue.models)) out[model.key] = classifyModel(model, rules)
  return out
}
