import { UNCLASSIFIED } from '../classify.ts'
import { TIERS } from '../ref.ts'
import type { CatalogueQuery } from './query.ts'

/** The tier-per-tool mapping, keyed `tool/tier`: the name each tool is handed for each tier. */
export type TierTable = Record<string, string>

/** The generated tier-per-tool mapping of a catalogue, pins included. */
export function tierTable(query: CatalogueQuery): TierTable {
  const out: TierTable = {}
  for (const tool of query.knownTools()) {
    for (const tier of TIERS) {
      const name = query.tierModel(tool, tier)
      if (name !== undefined) out[`${tool}/${tier}`] = name
    }
  }
  return out
}

/** One `tool/tier` the mapping hands a different name; `null` where it hands none. */
export type TierMove = { key: string; from: string | null; to: string | null }

/** A family whose agent models no rule places, with those models' keys. */
export type UnclassifiedFamily = { family: string; models: string[] }

/** What changed between two catalogues, as {@link diffCatalogues} reports it. */
export type CatalogueDiff = {
  /** Model keys `after` has and `before` lacks, sorted. */
  newModels: string[]
  /** Model keys `before` has and `after` lacks, sorted. */
  goneModels: string[]
  /** The `tool/tier` entries that are handed a different model name. */
  tierMoves: TierMove[]
  /** Families unclassified in `after` that were not in `before`. */
  newlyUnclassified: UnclassifiedFamily[]
}

/**
 * Current agent models no rule places, grouped by `provider/family` (the model
 * id when it names no family). Embedding and non-agent models are left out: no
 * tier ever picks them.
 */
export function unclassifiedFamilies(query: CatalogueQuery): UnclassifiedFamily[] {
  const groups = new Map<string, string[]>()
  for (const m of Object.values(query.catalogue.models)) {
    if (m.status !== 'current' || m.traits?.includes('agent') !== true) continue
    if (query.tierOf(m.key) !== UNCLASSIFIED) continue
    const family = `${m.provider}/${m.family ?? m.id}`
    groups.set(family, [...(groups.get(family) ?? []), m.key])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([family, models]) => ({ family, models: models.sort() }))
}

function sortedDiff(a: readonly string[], b: ReadonlySet<string>): string[] {
  return a.filter((k) => !b.has(k)).sort()
}

/**
 * What moved from `before` to `after`, such as across a refresh. Facts are compared by model key;
 * policy by the generated tier-per-tool mapping and the classifier's unclassified families.
 */
export function diffCatalogues(before: CatalogueQuery, after: CatalogueQuery): CatalogueDiff {
  const keysBefore = Object.keys(before.catalogue.models)
  const keysAfter = Object.keys(after.catalogue.models)
  const tb = tierTable(before)
  const ta = tierTable(after)
  const tierMoves: TierMove[] = []
  for (const key of [...new Set([...Object.keys(tb), ...Object.keys(ta)])].sort()) {
    if (tb[key] !== ta[key]) tierMoves.push({ key, from: tb[key] ?? null, to: ta[key] ?? null })
  }
  const wasUnclassified = new Set(unclassifiedFamilies(before).map((f) => f.family))
  return {
    newModels: sortedDiff(keysAfter, new Set(keysBefore)),
    goneModels: sortedDiff(keysBefore, new Set(keysAfter)),
    tierMoves,
    newlyUnclassified: unclassifiedFamilies(after).filter((f) => !wasUnclassified.has(f.family)),
  }
}
