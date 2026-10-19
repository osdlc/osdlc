import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The content-record form: several anchor-bound table leaves in one section.
// Note: the original example guessed `table/column-mismatch` for the risks table
// dropping a declared column; reconciled to the  `content/<leaf>/<check>` scheme
// → content/table/column-missing (one per missing column). The original example pinned
// line 9, but the risks table header (node.pos) is source line 8; line corrected to 8.
const v15: ValidationFixture = {
  id: 'v15',
  title: 'Multiple anchored tables in one section',
  component: 'content',
  path: 'docs/.../README.md',
  build: () =>
    contract({
      body: sections({}, [
        section('Decision', {
          content: {
            components: table({ anchor: 'components', columns: ['#', 'Component', 'Resolution'] }),
            risks: table({ anchor: 'risks', columns: ['Risk', 'Mitigation'] }),
          },
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — both anchored tables resolve and match their declared columns',
      source: loadCorpusSource('./15-multiple-anchored-tables-one-section.pass.md'),
      findings: loadExpected('./15-multiple-anchored-tables-one-section.pass.expected.json'),
    },
    {
      label: 'fail — risks table drops the declared Mitigation column',
      source: loadCorpusSource('./15-multiple-anchored-tables-one-section.fail.md'),
      findings: loadExpected('./15-multiple-anchored-tables-one-section.fail.expected.json'),
    },
  ],
}

export default v15
