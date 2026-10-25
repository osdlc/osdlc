import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The first H1 is the document title. A second H1 is a top-level section of its own, so the
// H2 after it is that section's child, and the body's Decision slot is not filled. The
// sections before the second H1 stay in the tree.
const v29: ValidationFixture = {
  id: 'v29',
  title: 'A second H1 starts a top-level section and keeps the sections before it',
  component: 'structure',
  path: 'decisions/widget.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Context'),
        section('Decision'),
      ]),
    }),
  cases: [
    {
      label: 'pass — one H1 title, both sections under it',
      source: loadCorpusSource('./29-second-h1.pass.md'),
      findings: loadExpected('./29-second-h1.pass.expected.json'),
    },
    {
      label: 'fail — Decision sits under a second H1, so it is missing at the top level',
      source: loadCorpusSource('./29-second-h1.fail.md'),
      findings: loadExpected('./29-second-h1.fail.expected.json'),
    },
  ],
}

export default v29
