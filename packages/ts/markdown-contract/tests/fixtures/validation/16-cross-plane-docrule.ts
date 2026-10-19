import { z } from 'zod'
import { contract, docRule, oneOf, optional, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// docRule(id, fn(doc)) — the only construct that sees both planes: a worked status
// requires a ## Post-mortem section.
// : the rule body emits the finding WITHOUT a pos — a missing-section finding is a
// whole-document absence, so the engine omits pos (document-level, sorts first).
// The example acknowledges its `line: 3` was a guess ("could equally point at end-of-document
// or the frontmatter block"; the cross-plane default pos is an open question), so the line is
// left unpinned here; only id + level are asserted.
const v16: ValidationFixture = {
  id: 'v16',
  title: 'Cross-plane docRule',
  component: 'validate',
  path: 'docs/planning/tasks/T-AB12.md',
  build: () => {
    const TaskFrontmatter = z
      .object({
        id: z.string().regex(/^T-[0-9A-Z]{4}$/),
        status: z.enum(['open/ready', 'open/blocked', 'closed/done', 'closed/dropped']),
        title: z.string().min(1),
      })
      .strict()

    const isWorked = (s: string) => s.startsWith('closed/') // a closed task was worked

    return contract({
      frontmatter: TaskFrontmatter,
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        oneOf(['Goal', 'Goal / Problem statement']),
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
      label: 'pass — closed with Post-mortem; guard fires but section resolves',
      source: loadCorpusSource('./16-cross-plane-docrule.pass-1.md'),
      findings: loadExpected('./16-cross-plane-docrule.pass-1.expected.json'),
    },
    {
      label: 'pass — open, no section; isWorked false, rule short-circuits',
      source: loadCorpusSource('./16-cross-plane-docrule.pass-2.md'),
      findings: loadExpected('./16-cross-plane-docrule.pass-2.expected.json'),
    },
    {
      label: 'fail — closed/done with Post-mortem deleted; rule fires',
      source: loadCorpusSource('./16-cross-plane-docrule.fail.md'),
      findings: loadExpected('./16-cross-plane-docrule.fail.expected.json'),
    },
  ],
}

export default v16
