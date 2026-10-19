import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// A projection edge: a section's table authored inside a blockquote. Resolved: D4 says the
// quoted table is NOT hoisted to section.blocks, so the declared table slot finds no block —
// the structure kind-gate fires `structure/block-missing` (the invented `table-missing` folds
// into the existing kind-gate id, as 15a/15 already do).
const v21a: ValidationFixture = {
  id: 'v21a',
  title: 'Table inside a blockquote / list item',
  component: 'validate',
  path: 'docs/.../milestone.md',
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Deliverables', {
          content: table({ columns: ['Item', 'Status'], minRows: 1 }),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — table at section top level projects to a table BlockNode',
      source: loadCorpusSource('./21a-table-inside-blockquote-or-list.pass.md'),
      findings: loadExpected('./21a-table-inside-blockquote-or-list.pass.expected.json'),
    },
    {
      label: 'fail — table quoted inside a > blockquote; declared table unreachable',
      source: loadCorpusSource('./21a-table-inside-blockquote-or-list.fail.md'),
      findings: loadExpected('./21a-table-inside-blockquote-or-list.fail.expected.json'),
    },
  ],
}

export default v21a
