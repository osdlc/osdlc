import { z } from 'zod'
import { contract, gap, maxWords, optional, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The DecisionContract on a real decision document: Zod frontmatter, a
// recognized-relative body, a nested children table subsection, a maxWords leaf.
const v19: ValidationFixture = {
  id: 'v19',
  title: 'Real Decision contract end-to-end',
  component: 'validate',
  path: 'docs/.../D-0042/README.md',
  note:
    'The example describes the FAIL by mutation (status open/draft, dropped ^summary, ## Consequences ' +
    'moved above ## Context) rather than giving the literal doc; the FAIL source here is reconstructed ' +
    "from those mutations, so the three findings pin id+level only (the example's lines 3/8/14 are " +
    'tied to its own reconstruction). The ## Summary content is written as a paragraph (not a ' +
    'bullet list) to match the maxWords(120) PARAGRAPH leaf — a maxWords leaf kind-gates to paragraph ' +
    '(kind is structure), exactly as content fixture 09 has it; a list under Summary would (correctly) ' +
    'trip structure/block-kind, which the ported source did not intend.',
  build: () => {
    const DecisionFrontmatter = z
      .object({
        id: z.string().regex(/^D-[0-9A-Z]{4}$/),
        status: z.enum([
          'open/proposed',
          'open/accepted',
          'closed/superseded',
          'closed/deprecated',
        ]),
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
      label: 'pass — conforming Decision on both planes',
      source: loadCorpusSource('./19-real-decision-contract-end-to-end.pass.md'),
      findings: loadExpected('./19-real-decision-contract-end-to-end.pass.expected.json'),
    },
    {
      label: 'fail — status off-enum, ^summary dropped, Consequences before Decision',
      source: loadCorpusSource('./19-real-decision-contract-end-to-end.fail.md'),
      // Golden note — structure/section-order: recognized-relative: ## Consequences (declared
      // last) before ## Decision puts exactly one recognized section (Decision) out of order.
      // The original mutation (Consequences before Context) would put BOTH Context and Decision
      // after Consequences — two section-order findings; reordered to the single-violation case
      // the example's one finding intends.
      findings: loadExpected('./19-real-decision-contract-end-to-end.fail.expected.json'),
    },
  ],
}

export default v19
