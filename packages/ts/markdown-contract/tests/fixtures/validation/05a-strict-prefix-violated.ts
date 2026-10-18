import { contract, gap, optional, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// An unknown section inside the strict prefix → structure/section-order.
// Gaps & questions: None; the FAIL sample is verbatim with Risks on line 5.
const v05a: ValidationFixture = {
  id: 'v05a',
  title: 'Unknown inside the strict prefix',
  component: 'structure',
  path: 'docs/.../sample.md',
  build: () =>
    contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        section('Title'),
        section('Overview'),
        section('Status'),
        gap(),
        optional(section('Appendix')),
      ]),
    }),
  cases: [
    {
      label: 'pass — strict prefix [Title, Overview, Status]',
      source: loadCorpusSource('./05a-strict-prefix-violated.pass.md'),
      findings: loadExpected('./05a-strict-prefix-violated.pass.expected.json'),
    },
    {
      label: 'fail — unknown Risks sits inside the strict prefix',
      source: loadCorpusSource('./05a-strict-prefix-violated.fail.md'),
      findings: loadExpected('./05a-strict-prefix-violated.fail.expected.json'),
    },
  ],
}

export default v05a
