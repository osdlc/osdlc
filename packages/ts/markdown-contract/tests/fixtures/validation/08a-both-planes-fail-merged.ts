import { z } from 'zod'
import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// One document fails both planes; one pass returns both findings in one list,
// frontmatter before body. frontmatter/enum is documented (line 3);
// structure/section-missing is inferred and the merge order is implied not
// stated, so only its id is pinned.
const v08a: ValidationFixture = {
  id: 'v08a',
  title: 'Both planes fail in one findings list',
  component: 'validate',
  path: 'notes/widget-protocol.md',
  build: () =>
    contract({
      frontmatter: z.strictObject({
        id: z.string().regex(/^D-[0-9A-Z]{4}$/),
        status: z.enum(['open/proposed', 'open/accepted', 'closed/superseded']),
        title: z.string().min(1),
      }),
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Summary'),
        section('Context'),
      ]),
    }),
  cases: [
    {
      label: 'pass — both planes satisfied',
      source: loadCorpusSource('./08a-both-planes-fail-merged.pass.md'),
      findings: loadExpected('./08a-both-planes-fail-merged.pass.expected.json'),
    },
    {
      label: 'fail — invalid status enum and absent Context',
      source: loadCorpusSource('./08a-both-planes-fail-merged.fail.md'),
      findings: loadExpected('./08a-both-planes-fail-merged.fail.expected.json'),
    },
  ],
}

export default v08a
