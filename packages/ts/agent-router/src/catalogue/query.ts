import { DEFAULT_CHAIN_ORDER, expandChain, pinKey, type Chain, type Pins } from '../chains.ts'
import {
  BUILTIN_CLASSIFY_RULES,
  classify,
  UNCLASSIFIED,
  type ClassifyRule,
  type Placement,
} from '../classify.ts'
import type { Tier } from '../ref.ts'
import { deriveOfferings } from './offerings.ts'
import type { Catalogue, Model, Offering, Sourced, Tool } from './types.ts'

/** A model found on a tool: the catalogue row and the tool's offering of it. */
export type FoundModel = { model: Sourced<Model>; offering: Offering }

/** The mapping table's policy over a catalogue. */
export type MappingPolicy = {
  /** Classify rules tried before the shipped ones. */
  classify?: readonly ClassifyRule[]
  /** The chain's tool order; default {@link DEFAULT_CHAIN_ORDER}. */
  order?: readonly string[]
  /** `tool/tier` to a model name. */
  pins?: Pins
}

/**
 * Lookups over one merged catalogue and its mapping policy: tools, models, offerings, tier
 * placement and effort levels. Build one with {@link queryCatalogue}.
 */
export type CatalogueQuery = {
  /** The merged catalogue this query reads. */
  readonly catalogue: Catalogue
  /** Every tool and model combination of the catalogue, derived once. */
  readonly offerings: readonly Offering[]
  /** Every tool row, in catalogue order. */
  tools(): Sourced<Tool>[]
  /** The tool ids, in catalogue order. */
  knownTools(): string[]
  /** The tool row for `id`, or `undefined` when the catalogue lacks it. */
  tool(id: string): Sourced<Tool> | undefined
  /** The models `tool` offers, in offering order. */
  modelsFor(tool: string): Sourced<Model>[]
  /**
   * The model `name` means on `tool`, matched in order against the offering's
   * `native_name`, the model key (`provider/id`), the model id, the model's
   * aliases and the tool's aliases.
   */
  findModel(tool: string, name: string): FoundModel | undefined
  /** The tool's offering of the model with catalogue key `modelKey`, or `undefined`. */
  offering(tool: string, modelKey: string): Offering | undefined
  /** Where the classifier places a model, by key; `unclassified` for a key it does not know. */
  tierOf(modelKey: string): Placement
  /** The chain's tool order: a frozen copy of `policy.order`, else of {@link DEFAULT_CHAIN_ORDER}. */
  readonly chainOrder: readonly string[]
  /** `router.pins`: a frozen copy of `policy.pins`. */
  readonly pins: Readonly<Pins>
  /**
   * The name the tier-per-tool mapping hands `tool` for `tier`: the pin when
   * one is set, else the head of that tool's run in the tier's chain.
   */
  tierModel(tool: string, tier: Tier): string | undefined
  /** Whether `router.pins` sets `tool/tier`. */
  pinned(tool: string, tier: Tier): boolean
  /**
   * The levels `tool` accepts, for `model` when given: the offering's own list
   * when it has one, else the model's levels the tool can pass (both lists when
   * both are declared, else whichever is). `undefined` when nothing is
   * declared; `[]` when the tool takes no effort. A fresh array each call.
   */
  effortsFor(tool: string, model?: string): readonly string[] | undefined
}

/**
 * A query over one merged catalogue and a mapping policy; offerings and the
 * classifier's placements are derived once, here. The policy's `order` and
 * `pins` are copied, so a later change to the caller's objects does not reach
 * the query; `offerings`, `chainOrder` and `pins` are frozen.
 */
export function queryCatalogue(catalogue: Catalogue, policy: MappingPolicy = {}): CatalogueQuery {
  const offerings: readonly Offering[] = Object.freeze(deriveOfferings(catalogue))
  const placements = classify(catalogue, [...(policy.classify ?? []), ...BUILTIN_CLASSIFY_RULES])
  const pins: Readonly<Pins> = Object.freeze({ ...policy.pins })
  const chainOrder: readonly string[] = Object.freeze([...(policy.order ?? DEFAULT_CHAIN_ORDER)])
  const chains = new Map<Tier, Chain>()
  const byTool = new Map<string, Offering[]>()
  for (const o of offerings) {
    const list = byTool.get(o.tool) ?? []
    list.push(o)
    byTool.set(o.tool, list)
  }
  const tool = (id: string): Sourced<Tool> | undefined =>
    Object.hasOwn(catalogue.tools, id) ? catalogue.tools[id] : undefined
  const modelOf = (o: Offering): Sourced<Model> | undefined =>
    Object.hasOwn(catalogue.models, o.model) ? catalogue.models[o.model] : undefined

  function findModel(toolId: string, name: string): FoundModel | undefined {
    const list = byTool.get(toolId) ?? []
    const withModel = list.flatMap((offering) => {
      const model = modelOf(offering)
      return model === undefined ? [] : [{ model, offering }]
    })
    const aliasTarget = tool(toolId)?.aliases?.[name]
    const tests: ((f: FoundModel) => boolean)[] = [
      (f) => f.offering.native_name === name,
      (f) => f.model.key === name,
      (f) => f.model.id === name,
      (f) => f.model.aliases?.includes(name) === true,
      (f) => aliasTarget !== undefined && f.model.key === aliasTarget,
    ]
    for (const test of tests) {
      const hit = withModel.find(test)
      if (hit !== undefined) return hit
    }
    return undefined
  }

  function effortsFor(toolId: string, model?: string): readonly string[] | undefined {
    const levels = declaredEfforts(toolId, model)
    return levels === undefined ? undefined : [...levels]
  }

  function declaredEfforts(toolId: string, model?: string): readonly string[] | undefined {
    const t = tool(toolId)
    if (t === undefined) return undefined
    if (model === undefined) return t.efforts
    const found = findModel(toolId, model)
    if (found === undefined) return t.efforts
    if (found.offering.efforts !== undefined) return found.offering.efforts
    const own = found.model.efforts
    if (own === undefined) return t.efforts
    if (t.efforts === undefined) return own
    return t.efforts.filter((e) => own.includes(e))
  }

  const query: CatalogueQuery = {
    catalogue,
    offerings,
    tools: () => Object.values(catalogue.tools),
    knownTools: () => Object.keys(catalogue.tools),
    tool,
    modelsFor: (toolId) =>
      (byTool.get(toolId) ?? []).flatMap((o) => {
        const m = modelOf(o)
        return m === undefined ? [] : [m]
      }),
    findModel,
    offering: (toolId, modelKey) => byTool.get(toolId)?.find((o) => o.model === modelKey),
    tierOf: (key) => (Object.hasOwn(placements, key) ? placements[key]! : UNCLASSIFIED),
    chainOrder,
    pins,
    tierModel: (toolId, tier) => {
      const key = pinKey(toolId, tier)
      if (Object.hasOwn(pins, key)) return pins[key]
      let chain = chains.get(tier)
      if (chain === undefined) {
        chain = expandChain(tier, [], query)
        chains.set(tier, chain)
      }
      return chain.entries.find((e) => e.tool === toolId)?.native_name
    },
    pinned: (toolId, tier) => Object.hasOwn(pins, pinKey(toolId, tier)),
    effortsFor,
  }
  return query
}
