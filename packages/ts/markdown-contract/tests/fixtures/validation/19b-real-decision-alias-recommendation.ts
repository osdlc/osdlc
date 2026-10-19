import { z } from 'zod'
import { contract, gap, maxWords, oneOf, optional, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// oneOf on the real Decision contract: the required core slot is satisfied by any of
// four interchangeable spellings; ## Recommendation fills it in place of ## Decision.
const v19b: ValidationFixture = {
  id: 'v19b',
  title: 'Decision body alias (Recommendation for Decision)',
  component: 'validate',
  path: 'docs/planning/decisions/D-0099-adopt-rumdl/README.md',
  note:
    'FAIL pins id+level only: the example states pos.line 9 (the Summary heading) but a literal ' +
    'transcription of its PASS sample puts ## Summary on line 8, so the line is left unpinned. ' +
    'the ## Summary content is a paragraph (not a bullet) to match the maxWords(120) PARAGRAPH ' +
    'leaf — a list under Summary would (correctly) trip structure/block-kind, unintended by the port.',
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
        optional(section('Context')),
        optional(
          section('Options considered', {
            children: sections({ order: 'none', allowUnknown: true }, [gap()]),
          }),
        ),
        // The required core slot — four interchangeable spellings, one position.
        oneOf(['Decision', 'Recommendation', 'Conclusion', 'Resolution']),
        optional(section('Consequences')),
        optional(section('Notes')),
      ]),
    })
  },
  cases: [
    {
      label: 'pass — ## Recommendation fills the required oneOf slot',
      source: loadCorpusSource('./19b-real-decision-alias-recommendation.pass.md'),
      findings: loadExpected('./19b-real-decision-alias-recommendation.pass.expected.json'),
    },
    {
      label: 'fail — core heading renamed to ## Verdict, outside the alias set',
      source: loadCorpusSource('./19b-real-decision-alias-recommendation.fail.md'),
      findings: loadExpected('./19b-real-decision-alias-recommendation.fail.expected.json'),
    },
  ],
}

export default v19b
