import { z } from 'zod'
import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Unified contract({ frontmatter, body }) — one pass merges both planes into one
// findings list, frontmatter before body. Gaps & questions: None. The enum
// finding is pinned to line 3; the absent section's anchor line is engine-defined,
// so only its id + level are pinned.
const v08: ValidationFixture = {
  id: 'v08',
  title: 'Unified frontmatter + body in one pass',
  component: 'validate',
  path: 'notes/note.md',
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
      source: loadCorpusSource('./08-frontmatter-plus-body-one-pass.pass.md'),
      findings: loadExpected('./08-frontmatter-plus-body-one-pass.pass.expected.json'),
    },
    {
      label: 'fail — bad enum on one plane, missing Context on the other',
      source: loadCorpusSource('./08-frontmatter-plus-body-one-pass.fail.md'),
      findings: loadExpected('./08-frontmatter-plus-body-one-pass.fail.expected.json'),
    },
  ],
}

export default v08
