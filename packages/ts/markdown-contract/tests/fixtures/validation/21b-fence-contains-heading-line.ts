import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Fence-awareness: a `##` line inside a fenced code block is opaque content, not a
// heading. The example asserts the PASS (no spurious section); its "FAIL" block is a
// counterfactual (what a fence-BLIND projection would wrongly emit), not an expected result.
const v21b: ValidationFixture = {
  id: 'v21b',
  title: 'Code fence containing a ## line',
  component: 'validate',
  path: 'docs/.../21b.md',
  note:
    "PASS arm only. The example's FAIL block is a counterfactual — the spurious " +
    '`structure/unknown-section` a fence-blind projection would (wrongly) report — not an asserted ' +
    'finding; the correct, fence-aware behaviour is empty findings.',
  build: () =>
    contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        section('Capability'),
        section('Sample document'),
      ]),
    }),
  cases: [
    {
      label: 'pass — in-fence ## Decision is opaque; no spurious section',
      source: loadCorpusSource('./21b-fence-contains-heading-line.md'),
      findings: loadExpected('./21b-fence-contains-heading-line.expected.json'),
    },
  ],
}

export default v21b
