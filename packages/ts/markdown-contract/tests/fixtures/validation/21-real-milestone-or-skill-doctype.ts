import { z } from 'zod'
import { contract, gap, oneOf, optional, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// A third real entity contract (Milestone): a lenient body, a required Deliverables
// (or Tasks alias) whose free-named H3 categories are admitted by a nested gap().
const v21: ValidationFixture = {
  id: 'v21',
  title: 'Real Milestone / SKILL.md doc-type',
  component: 'validate',
  path: 'docs/.../milestones/M-0042.md',
  note:
    "The example's `list` import / per-entry checkbox enforcement is noted as a gap (gap() admits " +
    'free-named H3 subsections without attaching a content leaf), so `list` is not used here. The ' +
    'FAIL is described by mutation (status open/wip, ## Deliverables dropped) and reconstructed.',
  build: () => {
    const MilestoneFrontmatter = z
      .object({
        id: z.string().regex(/^M-[0-9A-Z]{4}$/),
        status: z.enum(['open/draft', 'open/active', 'closed/done', 'closed/abandoned']),
        title: z.string().min(1),
        related: z.array(z.string()).default([]),
      })
      .strict()

    return contract({
      frontmatter: MilestoneFrontmatter,
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Goal'),
        section('Success criteria'),
        oneOf(['Deliverables', 'Tasks'], {
          children: sections({ order: 'none', allowUnknown: true }, [gap()]),
        }),
        optional(section('Out of scope')),
        optional(section('Risks / open questions')),
      ]),
    })
  },
  cases: [
    {
      label: 'pass — conforming Milestone; H3 categories admitted by nested gap()',
      source: loadCorpusSource('./21-real-milestone-or-skill-doctype.pass.md'),
      findings: loadExpected('./21-real-milestone-or-skill-doctype.pass.expected.json'),
    },
    {
      label: 'fail — status open/wip off-enum; ## Deliverables dropped',
      source: loadCorpusSource('./21-real-milestone-or-skill-doctype.fail.md'),
      // Golden note — structure/section-missing localizes to the first body heading (## Goal,
      // line 9) — the engine's established structure-plane behavior (see fixtures 01/14b/18b).
      // The example guessed line 1; the canonical engine line is the first body heading.
      findings: loadExpected('./21-real-milestone-or-skill-doctype.fail.expected.json'),
    },
  ],
}

export default v21
