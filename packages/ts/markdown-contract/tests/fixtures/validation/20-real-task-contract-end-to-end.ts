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

// The full TaskContract on a real task document: oneOf alias sets, a typed table
// with a Kind enum cell, a checkbox list leaf, and a (dormant) cross-plane docRule.
const v20: ValidationFixture = {
  id: 'v20',
  title: 'Real Task contract end-to-end',
  component: 'validate',
  path: 'docs/planning/tasks/T-AB12.md',
  note:
    'TaskFrontmatter is imported from ./schema.ts in the example and isWorked is referenced but not ' +
    'shown inline — both are reconstructed here (an inlined Zod schema + a closure-local isWorked). ' +
    "The example's FAIL is described by mutation (AC-1 → plain bullet; Files-to-touch reduced to " +
    'header-only) rather than given literally and lists its two findings non-ascending; the FAIL ' +
    "source is reconstructed and the findings pin id+level only, in the example's listed order.",
  build: () => {
    const TaskFrontmatter = z
      .object({
        id: z.string().regex(/^T-[0-9A-Z]{4}$/),
        type: z.literal('task').optional(),
        status: z.enum(['open/ready', 'in-progress/active', 'closed/done', 'closed/dropped']),
        title: z.string().min(1).optional(),
        tags: z.array(z.string()).optional(),
        impact: z.enum(['low', 'medium', 'high']).optional(),
        complexity: z.enum(['small', 'medium', 'large']).optional(),
      })
      .strict()

    const isWorked = (status: string) => status.startsWith('closed/')

    return contract({
      frontmatter: TaskFrontmatter,
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        oneOf(['Goal', 'Goal / Problem statement']),
        optional(section('Today')),
        section('Files to touch', {
          optional: true,
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            // minRows:1 makes a header-only table invalid — the FAIL case's intended
            // content/table/min-rows finding (the ported contract omitted minRows, so the
            // example's expected min-rows finding could never fire).
            minRows: 1,
            cells: { Kind: z.enum(['new', 'modify', 'delete']) },
          }),
        }),
        section('Acceptance criteria', {
          content: list({ everyItem: 'checkbox', minItems: 1 }),
        }),
        optional(
          section('Post-mortem', {
            children: sections({ order: 'strict', allowUnknown: false }, [
              section('Acceptance criteria coverage'),
              section('What worked'),
              section('Friction and automation gaps'),
            ]),
          }),
        ),
      ]),
      rules: [
        docRule('task/post-mortem-when-worked', (doc, ctx) => {
          const fm = doc.frontmatter as { status: string }
          const body = doc.body as { section(name: string): unknown }
          return isWorked(fm.status) && !body.section('Post-mortem')
            ? [
                ctx.finding({
                  id: 'task/post-mortem-when-worked',
                  message: 'a worked task must include a ## Post-mortem section',
                }),
              ]
            : []
        }),
      ],
    })
  },
  cases: [
    {
      label: 'pass — conforming open task; docRule dormant (status open/ready)',
      source: loadCorpusSource('./20-real-task-contract-end-to-end.pass.md'),
      findings: loadExpected('./20-real-task-contract-end-to-end.pass.expected.json'),
    },
    {
      label: 'fail — AC-1 a plain bullet; Files-to-touch reduced to header-only',
      source: loadCorpusSource('./20-real-task-contract-end-to-end.fail.md'),
      // Golden note: canonical content-plane ids; the example's
      // `table/min-rows` / `list/every-item` were best-effort sibling names. Sorted by ascending
      // pos.line: the header-only Files-to-touch table (line 20) precedes the plain-bullet AC
      // list item (line 25).
      findings: loadExpected('./20-real-task-contract-end-to-end.fail.expected.json'),
    },
  ],
}

export default v20
