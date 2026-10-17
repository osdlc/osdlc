import { createdToday } from '@lib/model/ops/_create'

import type { EntityNoun } from '../_nouns.ts'

/**
 * `friction create` is the reported path (the post-mortem skill); `source`
 * defaults to `reported`. `friction detect --apply` authors detected frictions
 * through the same create core with the evidence table already in the body.
 */
export const FrictionNoun: EntityNoun = {
  summary: 'A recorded, deduplicated observation that the process cost time or failed.',
  create: {
    summary: 'Author a new friction with a minted FR-NNNN identity.',
    identity: { kind: 'slugged', sourceKey: 'title' },
    fields: {
      title: { cli: { short: 't' } },
      source: { birthDefault: 'reported' },
      scope: {},
      state: {},
      created: createdToday,
      subjects: {},
      related: {},
      tags: { cli: { valueName: 'TAG' } },
    },
  },
  update: true,
  reads: true,
}
