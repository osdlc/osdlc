// The wildcard `*/<tier>`, and the trait filter it shares with a tier
// entry. A wildcard is the tier's category chain (`expandChain`), each
// candidate resolved as a reference.
import { expandChain, traitsMiss, type ChainSkipReason } from './chains.ts'
import type { CatalogueQuery } from './catalogue/query.ts'
import { formatRef, isTier, type Ref, type Trait } from './ref.ts'
import { resolveRef, type ResolveContext, type Resolved } from './resolve.ts'

/** Why a wildcard passed a candidate over: the chain's reason, or `unresolved` (an effort the tool lacks). */
export type WildcardSkipReason = ChainSkipReason | 'unresolved'

/** A candidate a wildcard passed over: why, as a code, and what failed. */
export type WildcardSkip = { text: string; reason: WildcardSkipReason; detail: string }

/**
 * The result of expanding a wildcard: its resolved candidates in chain order, and the candidates
 * passed over.
 */
export type Expansion = {
  /** The candidates, resolved, in chain order. */
  entries: Resolved[]
  /**
   * The candidates passed over: an embedding or non-agent model, a pinned image-output model the
   * entry did not ask for, a missing trait, an effort the tool lacks.
   */
  skipped: WildcardSkip[]
}

/**
 * Why `entry`'s model fails the `traits` filter, or `undefined` when it
 * passes: the model is looked up on the entry's tool and checked by
 * `traitsMiss`, so a model the catalogue does not know fails any filter.
 */
export function entryTraitsMiss(
  entry: Resolved,
  traits: readonly Trait[],
  catalogue: CatalogueQuery,
): string | undefined {
  if (traits.length === 0) return undefined
  const found = entry.model === undefined ? undefined : catalogue.findModel(entry.tool, entry.model)
  return traitsMiss(found?.model, traits)
}

/**
 * Expand a wildcard (tool `*`, a tier, qualifiers, effort) into the tier's
 * category chain over `ctx.catalogue`, keeping the tools in `ctx.knownTools`
 * when set. A tool's head (the model its tier maps
 * to, pinned or generated) is the candidate `<tool>/<tier>`; every later model
 * is named. Each candidate keeps the `ctx` qualifier and effort. The chain
 * passes over a model that is `embedding`, not `agent`, an image-output model
 * the entry did not ask for, or fails the trait filter; a candidate is also
 * skipped when it does not resolve (an effort the tool lacks). An empty result
 * is the walk's to skip.
 */
export function expandWildcard(ref: Ref, ctx: ResolveContext): Expansion {
  const out: Expansion = { entries: [], skipped: [] }
  const tier = ref.model
  if (tier === undefined || !isTier(tier)) return out
  const keep = (tool: string): boolean => ctx.knownTools?.includes(tool) ?? true
  const chain = expandChain(tier, ref.qualifiers?.traits ?? [], ctx.catalogue)
  const candidate = (tool: string, native: string): Ref => {
    const head = ctx.catalogue.tierModel(tool, tier) === native
    return {
      tool,
      model: head ? tier : native,
      ...(ref.qualifiers?.ctx !== undefined
        ? { qualifiers: { ctx: ref.qualifiers.ctx, traits: [] } }
        : {}),
      ...(ref.effort !== undefined ? { effort: ref.effort } : {}),
    }
  }
  for (const s of chain.skipped) {
    if (!keep(s.tool)) continue
    out.skipped.push({
      text: formatRef(candidate(s.tool, s.native_name)),
      reason: s.reason,
      detail: s.detail,
    })
  }
  for (const e of chain.entries) {
    if (!keep(e.tool)) continue
    const c = candidate(e.tool, e.native_name)
    const r = resolveRef(c, ctx)
    if (!r.ok) {
      out.skipped.push({ text: formatRef(c), reason: 'unresolved', detail: r.error.message })
      continue
    }
    out.entries.push(r.value)
  }
  return out
}
