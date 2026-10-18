import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Edge on 14: an H4 under an H2 skips H3. Resolved: the engine emits
// `structure/heading-depth-jump` at the deep heading —
// a contract-independent outline check re-derived from the preserved heading depth.
const v14a: ValidationFixture = {
  id: 'v14a',
  title: 'Skipped heading level (H2 to H4)',
  component: 'validate',
  path: 'docs/.../README.md',
  note:
    'heading-depth-jump is a warn, not an error — the engine scans the projected ' +
    'tree for child.depth > parent.depth + 1 and warns at the deep heading.',
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Decision', {
          children: sections({ order: 'strict', allowUnknown: true }, [
            section('Components', {
              content: table({ columns: ['#', 'Component', 'Resolution'], minRows: 1 }),
            }),
          ]),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — well-formed H3 Components nested under H2 Decision',
      source: loadCorpusSource('./14a-skipped-heading-level.pass.md'),
      findings: loadExpected('./14a-skipped-heading-level.pass.expected.json'),
    },
    {
      label: 'fail — Components is H4, skipping H3',
      source: loadCorpusSource('./14a-skipped-heading-level.fail.md'),
      findings: loadExpected('./14a-skipped-heading-level.fail.expected.json'),
    },
  ],
}

export default v14a
