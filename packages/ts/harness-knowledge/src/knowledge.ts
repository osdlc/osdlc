/** The shape of `harness-knowledge.json`. The JSON Schema beside it is `data/harness-knowledge.schema.json`. */

export interface Scope {
  since: string | null
  until: string | null
  platform: string[]
  model: string | null
}

export type Strength = 'strong' | 'moderate' | 'weak'

export interface KnowledgeValue {
  harness: string
  subject: string
  value: unknown
  scope: Scope
  strength: Strength
  /** A permalink to the statement at the corpus commit. */
  basis: string
  /** Present, and true, when study results disagree. */
  disputed?: true
}

export interface Knowledge {
  schema: 1
  corpus: { repo: string; path: string; commit: string }
  harnesses: Record<
    string,
    {
      title: string
      kind: 'harness' | 'standard'
      versioning: 'semver' | 'date' | 'unknown'
      cli?: string
    }
  >
  subjects: Record<
    string,
    { title: string; category: string; modelDependent?: true; valueSchema: Record<string, unknown> }
  >
  values: KnowledgeValue[]
}
