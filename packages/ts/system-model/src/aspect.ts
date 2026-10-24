/**
 * What a thing IS, technologically — and what makes anyone think so.
 *
 * A package is rarely one technology. `@determined/ui` is TypeScript and Vue
 * and a Nuxt layer at once, and a model that forced a single label would have
 * to pick a winner and throw the rest away. So a node carries a LIST of
 * aspects, and a viewer decides how many of them it can show: one colour, but
 * as many badges as fit.
 *
 * EVERY ASPECT CARRIES ITS EVIDENCE. `packages/ts/ui` is Vue because
 * `package.json` names `vue` in its dependencies — that sentence is the
 * payload, not a footnote to it.
 *
 * The evidence kinds are TIERED by how directly they observe the thing, and a
 * scanner declares which tier it works at. Tiers 1 and 2 read the manifest a
 * walk has already parsed, so they cost nothing extra. Tiers 3 and 4 go back
 * to disk. Tool detection in this package uses all four.
 */

/**
 * Where an aspect's evidence came from, most direct first.
 *
 * - `manifest` (1) — the manifest says so about itself: a `Cargo.toml` at all,
 *   a `main` pointing at a `.ts` file. The thing is describing its own nature.
 * - `dependency` (2) — it depends on something that implies the aspect. Strong,
 *   but inferential: depending on `vue` is not the same as being written in it.
 * - `files` (3) — something on disk says so: a `tsconfig.json`, a `.vue` file.
 *   Catches what a manifest never declared. Costs a directory read.
 * - `content` (4) — the inside of a file says so. The most accurate and the
 *   most expensive, and the easiest for two implementations to disagree about.
 */
export type EvidenceKind = 'manifest' | 'dependency' | 'files' | 'content'

/** The tier each kind works at. Lower is more direct. */
export const EVIDENCE_TIERS: Record<EvidenceKind, number> = {
  manifest: 1,
  dependency: 2,
  files: 3,
  content: 4,
}

/** One reason to believe an aspect applies. */
export interface Evidence {
  /** An {@link EvidenceKind}, widened — a newer walker may learn a fifth. */
  kind: string
  /** {@link EVIDENCE_TIERS} for this kind, carried so a reader need not join. */
  tier: number
  /**
   * What was inspected, in a form someone can go and look at:
   * `package.json#main`, `Cargo.toml`, `dependencies.vue`.
   */
  source: string
  /** What was there. The raw value, not a verdict about it. */
  found: string
}

/**
 * One technology a node is, with everything that supported the claim.
 *
 * Deliberately not a confidence score: the tier says how directly it was seen
 * and the evidence says what was seen, with no number to invite arithmetic
 * nobody can justify.
 */
export interface Aspect {
  /** An {@link AspectId}, widened, for the same reason `SystemNode.kind` is. */
  id: string
  /** The most direct tier that supported this aspect — the minimum over `evidence`. */
  tier: number
  /** Every reason found, in scanner order. Never empty. */
  evidence: Evidence[]
}

/**
 * The aspects the shipped scanners can currently produce.
 *
 * Exported as a roster for controls and legends to enumerate. Node `aspects`
 * are typed `string`, so a walker that learns a sixth does not break a reader
 * that has not.
 */
export type AspectId = 'rust' | 'typescript' | 'javascript' | 'vue' | 'nuxt' | 'wasm' | 'test'

/** Every {@link AspectId}, in the order a legend should list them. */
export const ALL_ASPECTS: readonly AspectId[] = [
  'rust',
  'typescript',
  'javascript',
  'vue',
  'nuxt',
  'wasm',
  'test',
]

/** Convenience for a viewer: the most direct tier claimed across a node. */
export function strongestTier(aspects: readonly Aspect[]): number | null {
  if (aspects.length === 0) return null
  return Math.min(...aspects.map((a) => a.tier))
}

/** Whether a node claims an aspect at all, at any tier. */
export function hasAspect(aspects: readonly Aspect[], id: string): boolean {
  return aspects.some((a) => a.id === id)
}
