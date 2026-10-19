import { z } from 'zod'

import { OpError } from '@lib/registry'
import { createdToday } from '@lib/model/ops/_create'

import type { EntityNoun } from '../_nouns.ts'
import { formatGaps, taskBodyGaps } from './body.ts'
import { readTextSource } from './ops/_task_doc.ts'

/**
 * Absent `priority` and `kind` omit the key: `task next` reads absent
 * `priority` as false and absent `kind` as `implementation`.
 */
export const TaskNoun: EntityNoun = {
  summary: 'Atomic unit of executable work — one problem, one implementer.',
  create: {
    summary: 'Author a new task with a minted T-NNNN identity.',
    identity: { kind: 'slugged', sourceKey: 'headline', exposeSeed: true },
    fields: {
      headline: {
        schema: z.string().nullable().default(null),
        noFrontmatter: true,
        cli: { short: 'H' },
      },
      state: {},
      created: createdToday,
      impact: {},
      complexity: {},
      priority: {},
      autonomy: {},
      kind: {},
      tags: { cli: { valueName: 'TAG' } },
      related: {},
    },
    body: {
      read: (source) => readTextSource(source, '--body-file'),
      // The file is the body; the title line stays the headline's, unless the file brings its own `# `.
      compose: (text, headline) => {
        const body = text.replace(/^\s*\n/, '')
        if (/^# \S/.test(body)) return body.endsWith('\n') ? body : `${body}\n`
        if (headline === null) {
          throw new OpError(
            'INVALID_INPUT',
            '--body-file without a `# ` title line needs --headline for the title.',
          )
        }
        return `# ${headline}\n\n${body.trimEnd()}\n`
      },
      check: (body) => {
        const gaps = taskBodyGaps(body)
        if (gaps.length > 0) {
          throw new OpError(
            'TASK_BODY_GAPS',
            `the body has gaps (pass --allow-gaps to create the task anyway):\n${formatGaps(gaps)}`,
            { gaps },
          )
        }
      },
    },
  },
  update: true,
  reads: true,
}
