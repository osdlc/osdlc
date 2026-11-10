/** The shape of `harness-knowledge.json`, and the JSON Schema that describes it. */

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

const nullableString = { type: ['string', 'null'], minLength: 1 }

/** JSON Schema (draft 2020-12) for `harness-knowledge.json`. */
export const KNOWLEDGE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Harness knowledge',
  description:
    'Values about coding-agent harnesses, compiled from the harness-reference beta corpus. Each value links to the statement that sets it.',
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'corpus', 'harnesses', 'subjects', 'values'],
  properties: {
    schema: { const: 1 },
    corpus: {
      type: 'object',
      additionalProperties: false,
      required: ['repo', 'path', 'commit'],
      properties: {
        repo: { type: 'string', minLength: 1 },
        path: { type: 'string', minLength: 1 },
        commit: { type: 'string', minLength: 1 },
      },
    },
    harnesses: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'kind', 'versioning'],
        properties: {
          title: { type: 'string', minLength: 1 },
          kind: { enum: ['harness', 'standard'], default: 'harness' },
          versioning: { enum: ['semver', 'date', 'unknown'] },
          cli: { type: 'string', minLength: 1 },
        },
      },
    },
    subjects: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'category', 'valueSchema'],
        properties: {
          title: { type: 'string', minLength: 1 },
          category: { type: 'string', minLength: 1 },
          modelDependent: { const: true },
          valueSchema: { type: 'object' },
        },
      },
    },
    values: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['harness', 'subject', 'value', 'scope', 'strength', 'basis'],
        properties: {
          harness: { type: 'string', minLength: 1 },
          subject: { type: 'string', minLength: 1 },
          value: {},
          scope: {
            type: 'object',
            additionalProperties: false,
            required: ['since', 'until', 'platform', 'model'],
            properties: {
              since: nullableString,
              until: nullableString,
              platform: { type: 'array', items: { type: 'string', minLength: 1 } },
              model: nullableString,
            },
          },
          strength: { enum: ['strong', 'moderate', 'weak'] },
          basis: { type: 'string', format: 'uri', pattern: '^https://' },
          disputed: { const: true },
        },
      },
    },
  },
} as const
