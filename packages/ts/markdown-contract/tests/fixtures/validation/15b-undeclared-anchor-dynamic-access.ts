import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// An undeclared ^anchor rides along untyped, reachable only via doc.byAnchor — it
// never produces a finding. The example has a PASS arm only (no failure to show).
const v15b: ValidationFixture = {
  id: 'v15b',
  title: 'Undeclared anchor reachable only dynamically',
  component: 'consumption',
  path: 'docs/.../README.md',
  note:
    'PASS arm only: the access rule makes an undeclared anchor an untyped access path, never a ' +
    'finding, so the example demonstrates no FAIL case (only typed-vs-byAnchor reads).',
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
      label: 'pass — ^extra is undeclared; imposes no finding, reachable only via byAnchor',
      source: loadCorpusSource('./15b-undeclared-anchor-dynamic-access.md'),
      findings: loadExpected('./15b-undeclared-anchor-dynamic-access.expected.json'),
    },
  ],
}

export default v15b
