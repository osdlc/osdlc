import type {
  Catalogue,
  CatalogueLayer,
  CatalogueProblem,
  LayerOptions,
  Model,
  Provenance,
  Provider,
  ServesEntry,
  Sourced,
  Tool,
} from './types.ts'

type Acc = { row: Record<string, unknown>; prov: Provenance; fields: Record<string, Provenance> }

function servesProvider(entry: ServesEntry): string {
  return typeof entry === 'string' ? entry : entry.provider
}

/**
 * `serves` adds across layers (`opencode: { serves: [corp] }` adds a provider
 * to the built-in list); an entry for a provider already served replaces it,
 * so a layer can change its `via`. Every other field is replaced whole.
 */
function mergeServes(prev: unknown, next: ServesEntry[]): ServesEntry[] {
  const out = Array.isArray(prev) ? [...(prev as ServesEntry[])] : []
  for (const entry of next) {
    const at = out.findIndex((e) => servesProvider(e) === servesProvider(entry))
    if (at >= 0) out[at] = entry
    else out.push(entry)
  }
  return out
}

function mergeTable(
  acc: Map<string, Acc>,
  rows: Record<string, Record<string, unknown>> | undefined,
  layer: CatalogueLayer,
): void {
  for (const [key, row] of Object.entries(rows ?? {})) {
    const prov: Provenance = {
      source: layer.source,
      observed_at: typeof row.observed_at === 'string' ? row.observed_at : layer.observed_at,
    }
    const into = acc.get(key) ?? { row: {}, prov, fields: {} }
    for (const [field, value] of Object.entries(row)) {
      if (field === 'observed_at' || value === undefined) continue
      into.row[field] =
        field === 'serves'
          ? mergeServes(into.row[field], value as ServesEntry[])
          : structuredClone(value)
      into.fields[field] = prov
    }
    into.prov = prov
    acc.set(key, into)
  }
}

function missing(row: Record<string, unknown>, required: readonly string[]): string[] {
  return required.filter((f) => row[f] === undefined)
}

const NONE = { via: 'none' } as const

function finishTools(
  acc: Map<string, Acc>,
  problems: CatalogueProblem[],
): Record<string, Sourced<Tool>> {
  const out: Record<string, Sourced<Tool>> = {}
  for (const [id, { row, prov, fields }] of acc) {
    const lacks = missing(row, ['serves', 'openness', 'modes'])
    if (lacks.length > 0) {
      problems.push({ table: 'tools', key: id, message: `tool '${id}' has no ${lacks.join(', ')}` })
      continue
    }
    out[id] = {
      model: NONE,
      effort: NONE,
      context: NONE,
      // A declared tool runs as the command its id names; only the snapshot names another.
      binary: id,
      ...(row as Partial<Tool>),
      id,
      ...prov,
      fields,
    } as Sourced<Tool>
  }
  return out
}

function finishProviders(
  acc: Map<string, Acc>,
  problems: CatalogueProblem[],
): Record<string, Sourced<Provider>> {
  const out: Record<string, Sourced<Provider>> = {}
  for (const [id, { row, prov, fields }] of acc) {
    if (row.kind === undefined) {
      problems.push({ table: 'providers', key: id, message: `provider '${id}' has no kind` })
      continue
    }
    out[id] = { ...(row as Omit<Provider, 'id'>), id, ...prov, fields } as Sourced<Provider>
  }
  return out
}

function finishModels(
  acc: Map<string, Acc>,
  problems: CatalogueProblem[],
): Record<string, Sourced<Model>> {
  const out: Record<string, Sourced<Model>> = {}
  for (const [key, { row, prov, fields }] of acc) {
    const slash = key.indexOf('/')
    if (slash <= 0 || slash === key.length - 1) {
      problems.push({ table: 'models', key, message: `model key '${key}' is not provider/id` })
      continue
    }
    const provider = key.slice(0, slash)
    const id = key.slice(slash + 1)
    if (row.provider !== undefined && row.provider !== provider) {
      problems.push({
        table: 'models',
        key,
        message: `model '${key}' names provider '${String(row.provider)}'`,
      })
      continue
    }
    out[key] = {
      status: 'current',
      ...(row as Partial<Model>),
      key,
      provider,
      id,
      ...prov,
      fields,
    } as Sourced<Model>
  }
  return out
}

/**
 * Merge catalogue layers, lowest first: typically the shipped snapshot, then layers from a
 * models.dev refresh or local probes, then the `router:` config block. A higher layer replaces a
 * field of a row (`serves` adds) and the row takes that layer's `source` and `observed_at`; the
 * per-field `fields` map keeps where every other field came from.
 *
 * A merged row missing a required field is left out and reported in `problems`. Inputs are never
 * mutated.
 */
export function layerCatalogue(
  layers: readonly CatalogueLayer[],
  options: LayerOptions = {},
): Catalogue {
  const tools = new Map<string, Acc>()
  const providers = new Map<string, Acc>()
  const models = new Map<string, Acc>()
  const offeringRows: Catalogue['offeringRows'] = []
  for (const layer of layers) {
    mergeTable(tools, layer.tools as Record<string, Record<string, unknown>> | undefined, layer)
    mergeTable(
      providers,
      layer.providers as Record<string, Record<string, unknown>> | undefined,
      layer,
    )
    mergeTable(models, layer.models as Record<string, Record<string, unknown>> | undefined, layer)
    for (const row of layer.offerings ?? []) {
      offeringRows.push({
        ...structuredClone(row),
        source: layer.source,
        observed_at: layer.observed_at,
      })
    }
  }
  const problems: CatalogueProblem[] = []
  const cat: Catalogue = {
    tools: finishTools(tools, problems),
    providers: finishProviders(providers, problems),
    models: finishModels(models, problems),
    offeringRows,
    problems,
    warnings: [],
  }
  const warnings: CatalogueProblem[] = []
  problems.push(...referenceProblems(cat, warnings))
  if (options.strict === true) problems.push(...warnings)
  else cat.warnings = warnings
  return cat
}

/**
 * References to a tool, provider or model the merged catalogue lacks. The
 * ones that only warn go to `warn`.
 */
function referenceProblems(cat: Catalogue, warn: CatalogueProblem[]): CatalogueProblem[] {
  const out: CatalogueProblem[] = []
  const has = (table: Record<string, unknown>, key: string): boolean => Object.hasOwn(table, key)
  for (const tool of Object.values(cat.tools)) {
    for (const entry of tool.serves) {
      const provider = servesProvider(entry)
      if (!has(cat.providers, provider)) {
        out.push({
          table: 'tools',
          key: tool.id,
          message: `tool '${tool.id}' serves unknown provider '${provider}'`,
        })
      }
    }
    for (const [alias, key] of Object.entries(tool.aliases ?? {})) {
      if (!has(cat.models, key)) {
        out.push({
          table: 'tools',
          key: tool.id,
          message: `tool '${tool.id}' alias '${alias}' names unknown model '${key}'`,
        })
      }
    }
    for (const offer of tool.offers ?? []) {
      if (!has(cat.models, offer.model)) {
        out.push({
          table: 'tools',
          key: tool.id,
          message: `tool '${tool.id}' offers unknown model '${offer.model}'`,
        })
      }
    }
  }
  for (const model of Object.values(cat.models)) {
    if (!has(cat.providers, model.provider)) {
      out.push({
        table: 'models',
        key: model.key,
        message: `model '${model.key}' names unknown provider '${model.provider}'`,
      })
    }
  }
  for (const row of cat.offeringRows) {
    if (!has(cat.tools, row.tool)) {
      out.push({
        table: 'offerings',
        key: row.tool,
        message: `offering names unknown tool '${row.tool}'`,
      })
    }
    // A removal row only warns: whether a model is in the catalogue depends on
    // the machine's probe layer, and removing a model nobody offers is a no-op.
    // But a mistyped key also does nothing, so it is still reported.
    if (!has(cat.models, row.model)) {
      const verb = row.remove ? 'removes' : 'names'
      const unknown: CatalogueProblem = {
        table: 'offerings',
        key: row.tool,
        message: `offering ${verb} unknown model '${row.model}'`,
      }
      if (row.remove) warn.push(unknown)
      else out.push(unknown)
    }
  }
  return out
}
