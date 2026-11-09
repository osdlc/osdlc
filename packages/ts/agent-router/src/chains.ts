// Category chains and pins: a tier, narrowed by traits, expanded into an ordered list of models
// across tools. The tier-per-tool mapping is the head of each tool's chain, so
// chains are the one source of what a tier means.
import { z } from 'zod'

import type { CatalogueQuery } from './catalogue/query.ts'
import type { Model, Sourced } from './catalogue/types.ts'
import { deepFreeze } from './freeze.ts'
import { protoSafeRecord } from './record.ts'
import { modelProblem, TOOL_ID_PATTERN, type Tier, type Trait } from './ref.ts'

/** Tool order in a chain when `router.chains.order` does not set one. */
export const DEFAULT_CHAIN_ORDER: readonly string[] = deepFreeze([
  'claude',
  'codex',
  'cursor',
  'antigravity',
  'pi',
  'opencode',
])

/** `router.pins`: `tool/tier` to the name the tool is handed, held through refreshes. */
export type Pins = Record<string, string>

/** The shape of a pin key: a tool id, a `/` and a tier, as in `claude/max`. */
export const PIN_KEY_PATTERN = /^[a-z][a-z0-9-]*\/(fast|standard|max)$/

/**
 * Schema for {@link Pins}: `tool/tier` keys (see {@link PIN_KEY_PATTERN}) mapped to a model name a
 * tool can be handed ({@link modelProblem}: no leading `-`, no whitespace or invisible character).
 * A key of another shape, or a `__proto__` key, is reported as an issue naming it.
 */
export const PinsSchema = protoSafeRecord(z.string(), z.string().min(1)).superRefine(
  (pins, ctx) => {
    for (const [key, value] of Object.entries(pins)) {
      if (!PIN_KEY_PATTERN.test(key)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `'${key}' must be tool/tier, such as claude/max`,
        })
      }
      const problem = modelProblem(value)
      if (problem !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${problem}: ${JSON.stringify(value)}`,
        })
      }
    }
  },
)

export const ChainsSchema = z.strictObject({
  order: z
    .array(z.string().regex(TOOL_ID_PATTERN, 'must be a lower-case identifier'))
    .min(1)
    .describe(
      'Tool order in every category chain; tools left out follow in catalogue order. Default claude, codex, cursor, antigravity, pi, opencode.',
    ),
})

/** The pin key for `tool` and `tier`, `tool/tier`. */
export function pinKey(tool: string, tier: Tier): string {
  return `${tool}/${tier}`
}

/** One candidate of a chain: a model on a tool, with the name the tool is handed. */
export type ChainEntry = {
  tool: string
  tier: Tier
  native_name: string
  /** The model's catalogue key; absent for a pin the catalogue does not know. */
  model?: string
  /** Set when `router.pins` put this entry at the head of its tool. */
  pinned: boolean
}

/**
 * Why the chain passed a model over: it is not an agent model (an embedding or
 * a pinned image-output one included), or it lacks a trait. A tier's own image
 * models, when the entry did not ask for `image-out`, are dropped without a row.
 */
export type ChainSkipReason = 'not-agent' | 'missing-trait'

/** A model of the tier the chain passed over: why, as a code, and what failed. */
export type ChainSkip = {
  tool: string
  native_name: string
  reason: ChainSkipReason
  detail: string
}

/**
 * An expanded tier chain: the candidate `entries` in order, and the models it `skipped` with the
 * reason for each.
 */
export type Chain = { entries: ChainEntry[]; skipped: ChainSkip[] }

/** Newest first, then larger context first; undated models last. */
function newestFirst(a: Sourced<Model>, b: Sourced<Model>): number {
  const da = a.release_date ?? ''
  const db = b.release_date ?? ''
  if (da !== db) return da < db ? 1 : -1
  const ca = a.context?.max ?? a.context?.default ?? 0
  const cb = b.context?.max ?? b.context?.default ?? 0
  return cb - ca
}

/**
 * Why `model` fails the `traits` filter, or `undefined` when it passes. A
 * model the catalogue does not know (`undefined`) carries no traits, so it
 * fails any filter.
 */
export function traitsMiss(
  model: Sourced<Model> | undefined,
  traits: readonly Trait[],
): string | undefined {
  if (traits.length === 0) return undefined
  if (model === undefined) {
    return `traits ${traits.join(', ')} cannot be checked: the catalogue does not know the model`
  }
  const missing = traits.filter((t) => model.traits?.includes(t) !== true)
  return missing.length === 0 ? undefined : `model ${model.key} lacks ${missing.join(', ')}`
}

/** Why `model` may not stand in a chain filtered by `traits`, or `undefined`. */
function chainMiss(
  model: Sourced<Model> | undefined,
  traits: readonly Trait[],
): { reason: ChainSkipReason; detail: string } | undefined {
  if (model?.traits?.includes('embedding') === true) {
    return { reason: 'not-agent', detail: `${model.key} is an embedding model` }
  }
  // `image-out` is the one exception to agent-only: an entry that asks for it
  // takes image-output models, whether or not they call tools. Every other entry
  // passes an image model over, even one that calls tools, so a tier never heads on one.
  const imageOut = model?.traits?.includes('image-out') === true
  const imageAsked = traits.includes('image-out')
  if (model !== undefined && imageOut && !imageAsked) {
    return { reason: 'not-agent', detail: `${model.key} is an image-output model` }
  }
  const takesImageModels = imageOut && imageAsked
  if (model !== undefined && model.traits?.includes('agent') !== true && !takesImageModels) {
    return { reason: 'not-agent', detail: `${model.key} is not an agent model` }
  }
  const miss = traitsMiss(model, traits)
  return miss === undefined ? undefined : { reason: 'missing-trait', detail: miss }
}

/**
 * The `tier` chain: tools in `catalogue.chainOrder` (tools it leaves out follow
 * in catalogue order), and within one tool the current models the classifier
 * places in `tier`, newest first, then larger context first. A pin for
 * `tool/tier` heads that tool's run, flagged `pinned`, and the same model is not
 * repeated. Only `agent` models (or, when `traits` holds `image-out`, image-output
 * models) that carry every one of `traits` stay; the others are returned in
 * `skipped` with the reason. A tier's image-output models are dropped silently
 * unless `traits` asks for `image-out`: they would add a row to every wildcard.
 * An unclassified, deprecated or withdrawn model appears only when a pin names
 * it; a pin the catalogue does not know stays unless `traits` asks for something
 * it cannot check.
 */
export function expandChain(
  tier: Tier,
  traits: readonly Trait[],
  catalogue: CatalogueQuery,
): Chain {
  const { pins } = catalogue
  const out: Chain = { entries: [], skipped: [] }
  const known = catalogue.knownTools()
  const tools = [
    ...catalogue.chainOrder.filter((t) => known.includes(t)),
    ...known.filter((t) => !catalogue.chainOrder.includes(t)),
  ]
  for (const tool of tools) {
    const run: { native_name: string; model?: Sourced<Model>; pinned: boolean }[] = []
    const pin = Object.hasOwn(pins, pinKey(tool, tier)) ? pins[pinKey(tool, tier)] : undefined
    const pinnedModel = pin === undefined ? undefined : catalogue.findModel(tool, pin)?.model
    if (pin !== undefined) {
      run.push({ native_name: pin, ...(pinnedModel ? { model: pinnedModel } : {}), pinned: true })
    }
    const placed = catalogue
      .modelsFor(tool)
      .filter(
        (m) =>
          m.status === 'current' && catalogue.tierOf(m.key) === tier && m.key !== pinnedModel?.key,
      )
      .sort(newestFirst)
    for (const m of placed) {
      const name = catalogue.offering(tool, m.key)?.native_name ?? m.id
      run.push({ native_name: name, model: m, pinned: false })
    }
    for (const c of run) {
      if (!c.pinned && !traits.includes('image-out') && c.model?.traits?.includes('image-out')) {
        continue
      }
      const miss = chainMiss(c.model, traits)
      if (miss !== undefined) {
        out.skipped.push({ tool, native_name: c.native_name, ...miss })
        continue
      }
      out.entries.push({
        tool,
        tier,
        native_name: c.native_name,
        ...(c.model !== undefined ? { model: c.model.key } : {}),
        pinned: c.pinned,
      })
    }
  }
  return out
}
