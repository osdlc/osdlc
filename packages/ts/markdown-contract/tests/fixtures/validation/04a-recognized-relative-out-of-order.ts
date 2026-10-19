import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Two recognized sections in the wrong relative order. Gaps & questions: None.
// The FAIL sample is given verbatim and the finding localizes to the Title
// heading on line 5.
const v04a: ValidationFixture = {
  id: 'v04a',
  title: 'Recognized sections out of declared order',
  component: 'structure',
  path: 'docs/.../sample.md',
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Title'),
        section('Overview'),
        section('Status'),
      ]),
    }),
  cases: [
    {
      label: 'pass — recognized order kept, unknown interleaves',
      source: loadCorpusSource('./04a-recognized-relative-out-of-order.pass.md'),
      findings: loadExpected('./04a-recognized-relative-out-of-order.pass.expected.json'),
    },
    {
      label: 'fail — Overview (declared 2nd) precedes Title (declared 1st)',
      source: loadCorpusSource('./04a-recognized-relative-out-of-order.fail.md'),
      findings: loadExpected('./04a-recognized-relative-out-of-order.fail.expected.json'),
    },
  ],
}

export default v04a
