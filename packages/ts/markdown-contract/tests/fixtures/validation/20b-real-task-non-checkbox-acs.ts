import { z } from 'zod'
import {
  contract,
  docRule,
  list,
  oneOf,
  optional,
  section,
  sections,
  table,
} from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Two content-leaf failures firing together on one real task: a Kind cell outside the
// enum and a ## Acceptance criteria list written as plain bullets.
const v20b: ValidationFixture = {
  id: 'v20b',
  title: 'Real task with non-checkbox acceptance criteria',
  component: 'validate',
  path: 'docs/planning/tasks/T-132J.md',
  note:
    'TaskFrontmatter is imported from ./schema.ts in the example — reconstructed here as an inlined ' +
    "Zod schema admitting planning/backlog. The example's docRule returns bare finding literals " +
    '(missing path); rewritten to ctx.finding(...) to type-check.',
  build: () => {
    const TaskFrontmatter = z
      .object({
        id: z.string().regex(/^T-[0-9A-Z]{4}$/),
        type: z.literal('task').optional(),
        status: z.enum([
          'planning/backlog',
          'open/ready',
          'in-progress/active',
          'closed/done',
          'closed/superseded',
        ]),
        impact: z.enum(['low', 'medium', 'high']).optional(),
        complexity: z.enum(['small', 'medium', 'large']).optional(),
      })
      .strict()

    return contract({
      frontmatter: TaskFrontmatter,
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        oneOf(['Goal', 'Goal / Problem statement']),
        // The Today / Current state slot is optional — the sample task omits it, and the
        // example's expected findings list no structure/section-missing for it (the ported
        // contract left the oneOf required, which would (correctly) flag the absent slot).
        optional(oneOf(['Today', 'Current state'])),
        section('Files to touch', {
          optional: true,
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            cells: { Kind: z.enum(['add', 'modify', 'delete']) },
          }),
        }),
        section('Acceptance criteria', {
          content: list({ everyItem: 'checkbox', minItems: 1 }),
        }),
        optional(section('Completion note')),
      ]),
      rules: [
        docRule('task/completion-note-when-closed', (doc, ctx) => {
          const fm = doc.frontmatter as { status: string }
          const body = doc.body as { section(name: string): unknown }
          return fm.status.startsWith('closed/') && !body.section('Completion note')
            ? [
                ctx.finding({
                  id: 'task/completion-note-when-closed',
                  level: 'error',
                  message: 'a closed task must include a Completion note section',
                }),
              ]
            : []
        }),
      ],
    })
  },
  cases: [
    {
      label: 'pass — both bugs fixed: Kind add, ACs are checkboxes',
      source: loadCorpusSource('./20b-real-task-non-checkbox-acs.pass.md'),
      findings: loadExpected('./20b-real-task-non-checkbox-acs.pass.expected.json'),
    },
    {
      label: "fail — Kind 'new' on row 2; both ACs plain bullets",
      source: loadCorpusSource('./20b-real-task-non-checkbox-acs.fail.md'),
      // Golden note: canonical content-plane ids; the example
      // used `content/enum` (cell) and `content/every-item` (list item) as best-effort sibling
      // names — its own note flags these as an open question. A bad Kind cell is
      // content/table/cell; a non-checkbox AC item is content/list/item-kind.
      findings: loadExpected('./20b-real-task-non-checkbox-acs.fail.expected.json'),
    },
  ],
}

export default v20b
