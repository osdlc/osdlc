/**
 * Shared assertion accessors for the inference fixtures. These read the declarative-YAML
 * OBJECT form an `InferredContract.def` carries — the mcVersion 2 vocabulary, a
 * `compileContractObject(def)` input:
 *   { frontmatter?: { type: "object"; required?: string[]; additionalProperties?: boolean;
 *                     properties?: Record<string, unknown> },
 *     body?: { order?: "none"|"recognized-relative"|"strict"; additionalSections?: boolean;
 *              sections?: Array<{ section: string; minContains?: number; maxContains?: number }> } }
 * Kept here so each fixture asserts the inferred shape by name (order-independent) without
 * re-deriving the same casts (per `~/.claude/MEMORY.md` — no skill/fixture prose duplication).
 */

/** A `body.sections` entry, as emitted in `InferredContract.def`. */
export interface SectionEntry {
  section: string
  minContains?: number
  maxContains?: number
}

/** The body sub-object of an inferred `def`. */
export interface InferredBody {
  order?: 'none' | 'recognized-relative' | 'strict'
  additionalSections?: boolean
  sections?: SectionEntry[]
}

/** The frontmatter sub-object of an inferred `def` (a v2 object schema node). */
export interface InferredFrontmatter {
  type?: 'object'
  required?: string[]
  additionalProperties?: boolean
  properties?: Record<string, unknown>
}

/** A typed view of an `InferredContract.def`. */
export interface InferredDef {
  frontmatter?: InferredFrontmatter
  body?: InferredBody
}

/** Cast a raw `def` to the typed view. */
export function asDef(def: Record<string, unknown>): InferredDef {
  return def as InferredDef
}

/** Look up one section entry by name (order-independent). */
export function section(def: Record<string, unknown>, name: string): SectionEntry | undefined {
  return asDef(def).body?.sections?.find((s) => s.section === name)
}

/** Sorted section names of a `def`. */
export function sectionNames(def: Record<string, unknown>): string[] {
  return (asDef(def).body?.sections ?? []).map((s) => s.section).sort()
}

/** Whether a section is required (a plain or repeatable slot — never `minContains: 0`). */
export function isRequired(def: Record<string, unknown>, name: string): boolean {
  const s = section(def, name)
  return s !== undefined && (s.minContains ?? 1) >= 1
}

/** Whether a section is present and counted optional (`minContains: 0`). */
export function isOptional(def: Record<string, unknown>, name: string): boolean {
  return section(def, name)?.minContains === 0
}

/** Look up one frontmatter field's inferred schema by key. */
export function field(def: Record<string, unknown>, key: string): unknown {
  return asDef(def).frontmatter?.properties?.[key]
}
