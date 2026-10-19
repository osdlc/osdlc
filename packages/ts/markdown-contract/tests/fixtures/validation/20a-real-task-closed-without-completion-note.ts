import { z } from 'zod'
import { contract, list, oneOf, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The frontmatter conditional closed/* ⇒ completion_note lives in the per-type Zod as a
// .refine, surfacing as a frontmatter/* finding — not a cross-plane docRule.
// : a Zod .refine() surfaces as a `custom` issue → the canonical id `frontmatter/refine`
// . Its declared path (["completion_note"]) addresses an ABSENT
// key, so lineForPath finds no source line and the engine omits pos (document-level). The
// example's `line: 5` (the status line the predicate reasons about) is not derivable from the
// refine path, so the line is left unpinned; id + level are asserted.
const v20a: ValidationFixture = {
  id: 'v20a',
  title: 'Closed task missing Completion note',
  component: 'validate',
  path: 'docs/planning/tasks/T-0006.md',
  build: () => {
    const TaskFrontmatter = z
      .object({
        id: z.string().regex(/^T-[0-9A-Z]{4}$/),
        status: z.enum([
          'planning/draft',
          'open/ready',
          'in-progress/active',
          'closed/done',
          'closed/superseded',
        ]),
        completion_note: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        // The remaining real Task frontmatter keys the sample carries — declared (the ported
        // inline schema listed only four, so .strict() rejected the rest as unknown-key noise,
        // burying the one finding this fixture is about: the closed/* ⇒ completion_note refine).
        type: z.literal('task').optional(),
        schema_version: z.string().optional(),
        created: z.unknown().optional(),
        last_reviewed: z.unknown().optional(),
        impact: z.enum(['low', 'medium', 'high']).optional(),
        complexity: z.enum(['small', 'medium', 'large']).optional(),
        tags: z.array(z.string()).optional(),
        prs: z.array(z.string()).optional(),
      })
      .strict()
      .refine((fm) => !fm.status.startsWith('closed/') || fm.completion_note !== undefined, {
        path: ['completion_note'],
        message: 'a closed task must record a completion_note',
      })

    return contract({
      frontmatter: TaskFrontmatter,
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        oneOf(['Goal', 'Goal / Problem statement']),
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
      ]),
    })
  },
  cases: [
    {
      label: 'pass — closed task carries its completion_note frontmatter key',
      source: loadCorpusSource('./20a-real-task-closed-without-completion-note.pass.md'),
      findings: loadExpected('./20a-real-task-closed-without-completion-note.pass.expected.json'),
    },
    {
      label: 'fail — status closed/done with no completion_note key',
      source: loadCorpusSource('./20a-real-task-closed-without-completion-note.fail.md'),
      findings: loadExpected('./20a-real-task-closed-without-completion-note.fail.expected.json'),
    },
  ],
}

export default v20a
