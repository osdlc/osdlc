/**
 * The technologies a thing uses, and the evidence for each claim.
 *
 * A package is rarely one technology. `@determined/ui` is TypeScript, Vue and
 * a Nuxt layer at once. A model with a single label would have to pick one and
 * drop the rest. So a node carries a list of aspects, and a viewer decides how
 * many to show, for example one colour but as many badges as fit.
 *
 * Every aspect carries its evidence. `packages/ts/ui` is Vue because
 * `package.json` names `vue` in its dependencies. That evidence is part of the
 * payload, not an extra.
 *
 * The evidence kinds are ranked in tiers by how directly they observe the
 * thing. A scanner declares which tier it works at. Tiers 1 and 2 read the
 * manifest a walk has already parsed, so they cost nothing extra. Tiers 3 and
 * 4 read the disk again. Tool detection in this package uses all four.
 */

/**
 * Where an aspect's evidence came from, most direct first.
 *
 * - `manifest` (1): the manifest states it, for example a `Cargo.toml` exists,
 *   or `main` points at a `.ts` file.
 * - `dependency` (2): it depends on something that implies the aspect. Strong,
 *   but inferred: depending on `vue` is not the same as being written in it.
 * - `files` (3): a file on disk shows it, such as a `tsconfig.json` or a `.vue`
 *   file. Finds what a manifest never declared. Costs a directory read.
 * - `content` (4): the inside of a file shows it. The most accurate and the
 *   most expensive, and the kind two implementations most often disagree on.
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
  /** An {@link EvidenceKind}, widened, because a newer walker may add a fifth. */
  kind: string
  /** {@link EVIDENCE_TIERS} for this kind, included so a reader need not look it up. */
  tier: number
  /**
   * What was inspected, in a form a person can find and check:
   * `package.json#main`, `Cargo.toml`, `dependencies.vue`.
   */
  source: string
  /** What was there. The raw value, not a verdict about it. */
  found: string
}

/**
 * One technology a node uses, with all the evidence for the claim.
 *
 * Deliberately not a confidence score. The tier says how directly it was seen
 * and the evidence says what was seen. A score would invite arithmetic nobody
 * can justify.
 */
export interface Aspect {
  /** An {@link AspectId}, widened, for the same reason `SystemNode.kind` is. */
  id: string
  /** The most direct tier that supported this aspect: the minimum over `evidence`. */
  tier: number
  /** Every reason found, in scanner order. Never empty. */
  evidence: Evidence[]
}

/**
 * The aspects the shipped scanners can produce.
 *
 * Exported as a list for controls and legends. `Aspect.id` is typed `string`,
 * so a walker that adds a new aspect does not break an older reader.
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
