import type { Catalogue, Model, Offering, ServesEntry, Tool } from './types.ts'

/**
 * What `tool` is handed for `model`, the first that applies:
 *
 *   1. the tool's alias for the model, when the tool declares aliases and sets `prefer_alias`;
 *   2. a curated tool's own name (`curatedName`);
 *   3. for a multi-provider (`open`) tool, `provider/id`, as opencode and pi expect;
 *   4. the provider's model id.
 */
export function nativeName(
  tool: Pick<Tool, 'aliases' | 'prefer_alias' | 'openness'>,
  model: Pick<Model, 'key' | 'provider' | 'id'>,
  curatedName?: string,
): string {
  if (tool.prefer_alias === true && tool.aliases !== undefined) {
    const alias = Object.entries(tool.aliases).find(([, key]) => key === model.key)
    if (alias !== undefined) return alias[0]
  }
  if (curatedName !== undefined) return curatedName
  if (tool.openness === 'open') return `${model.provider}/${model.id}`
  return model.id
}

function split(entry: ServesEntry): { provider: string; via?: string } {
  return typeof entry === 'string' ? { provider: entry } : entry
}

function keyOf(o: Pick<Offering, 'tool' | 'model'>): string {
  return `${o.tool} ${o.model}`
}

/**
 * Every allowed tool and model combination. A `closed` or `open` tool offers
 * `serves` times each served provider's models; a `curated` tool offers its
 * own `offers` list. Then each `router.offerings` row, in layer order, removes
 * one (`remove: true`) or adds one, replacing any earlier row for the same
 * tool and model; a field the row leaves out (`native_name`, `via`, `efforts`,
 * `context`) is the replaced row's. When there is no earlier row, a row without
 * `native_name` is named by `nativeName`, a curated tool's own name included.
 * An added row for a model the catalogue lacks is kept, named by its id unless
 * the row sets `native_name`, but `layerCatalogue` reports it as a problem.
 */
export function deriveOfferings(cat: Catalogue): Offering[] {
  const byKey = new Map<string, Offering>()
  const modelsByProvider = new Map<string, Model[]>()
  for (const model of Object.values(cat.models)) {
    const list = modelsByProvider.get(model.provider) ?? []
    list.push(model)
    modelsByProvider.set(model.provider, list)
  }

  for (const tool of Object.values(cat.tools)) {
    const prov = { source: tool.source, observed_at: tool.observed_at }
    if (tool.openness === 'curated') {
      for (const offer of tool.offers ?? []) {
        const model = cat.models[offer.model]
        if (model === undefined) continue
        const o: Offering = {
          tool: tool.id,
          model: model.key,
          native_name: nativeName(tool, model, offer.native_name),
          ...prov,
        }
        if (offer.efforts !== undefined) o.efforts = [...offer.efforts]
        if (offer.context !== undefined) o.context = { ...offer.context }
        byKey.set(keyOf(o), o)
      }
      continue
    }
    for (const entry of tool.serves) {
      const { provider, via } = split(entry)
      for (const model of modelsByProvider.get(provider) ?? []) {
        const o: Offering = {
          tool: tool.id,
          model: model.key,
          native_name: nativeName(tool, model),
          ...prov,
        }
        if (via !== undefined) o.via = via
        byKey.set(keyOf(o), o)
      }
    }
  }

  for (const row of cat.offeringRows) {
    const key = keyOf(row)
    if (row.remove === true) {
      byKey.delete(key)
      continue
    }
    const tool = cat.tools[row.tool]
    const model = cat.models[row.model]
    const slash = row.model.indexOf('/')
    const fallback = slash >= 0 ? row.model.slice(slash + 1) : row.model
    const prev = byKey.get(key)
    const curatedName =
      tool?.openness === 'curated'
        ? tool.offers?.find((offer) => offer.model === row.model)?.native_name
        : undefined
    const o: Offering = {
      tool: row.tool,
      model: row.model,
      native_name:
        row.native_name ??
        prev?.native_name ??
        (tool !== undefined && model !== undefined
          ? nativeName(tool, model, curatedName)
          : fallback),
      source: row.source,
      observed_at: row.observed_at,
    }
    const via = row.via ?? prev?.via
    if (via !== undefined) o.via = via
    const efforts = row.efforts ?? prev?.efforts
    if (efforts !== undefined) o.efforts = [...efforts]
    const context = row.context ?? prev?.context
    if (context !== undefined) o.context = { ...context }
    byKey.set(key, o)
  }
  return [...byKey.values()]
}
