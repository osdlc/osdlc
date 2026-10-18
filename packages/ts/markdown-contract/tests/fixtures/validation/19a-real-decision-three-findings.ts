import { z } from 'zod'
import { contract, gap, maxWords, optional, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The combined-failure merge on a real Decision: one validate() pass trips
// frontmatter/enum, structure/anchor-missing, and structure/section-order, ordered
// by ascending pos.line.
const v19a: ValidationFixture = {
  id: 'v19a',
  title: 'Real Decision with the three-finding failure',
  component: 'validate',
  path: 'docs/.../D-0099/README.md',
  build: () => {
    const DecisionFrontmatter = z
      .object({
        id: z.string().regex(/^D-[0-9A-Z]{4}$/),
        status: z.enum(['open/proposed', 'open/accepted', 'closed/superseded']),
        title: z.string().min(1),
        related: z.array(z.string()).default([]),
      })
      .strict()

    return contract({
      frontmatter: DecisionFrontmatter,
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Summary', { anchor: 'summary', content: maxWords(120) }),
        section('Context'),
        section('Decision', {
          children: sections({ order: 'strict', allowUnknown: true }, [
            section('Components', {
              content: table({ columns: ['#', 'Component', 'Resolution'], minRows: 1 }),
            }),
          ]),
        }),
        optional(section('Why')),
        optional(
          section('Options considered', {
            children: sections({ order: 'none', allowUnknown: true }, [gap()]),
          }),
        ),
        optional(section('Consequences')),
        optional(section('Out of scope')),
        optional(section('Notes')),
      ]),
    })
  },
  cases: [
    {
      label: 'pass — conforming: status in enum, ^summary anchored, Why after Decision',
      source: loadCorpusSource('./19a-real-decision-three-findings.pass.md'),
      findings: loadExpected('./19a-real-decision-three-findings.pass.expected.json'),
    },
    {
      label: 'fail — status open/draft, no ^summary, ## Why before ## Decision',
      source: loadCorpusSource('./19a-real-decision-three-findings.fail.md'),
      // Golden note — structure/section-order: recognized-relative flags the LATER-declared
      // section that appears out of order (## Decision, declared before Why) — the engine's
      // established semantics (see structure fixture 04a). The example guessed the Why heading;
      // the canonical engine line is the ## Decision heading. With ### Components added so the
      // strict Decision child resolves, that lands on line 22.
      findings: loadExpected('./19a-real-decision-three-findings.fail.expected.json'),
    },
  ],
}

export default v19a
