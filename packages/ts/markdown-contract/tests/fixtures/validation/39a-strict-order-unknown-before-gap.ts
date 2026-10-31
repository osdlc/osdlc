import { contract, gap, optional, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// v39 with a gap after the optional section. An unknown section before Status does not put the
// walk past Status, though a gap is ahead. Status after References is still out of order.
const v39a: ValidationFixture = {
  id: 'v39a',
  title: 'Unknown sections do not affect strict order when a gap follows',
  component: 'structure',
  path: 'docs/design/cache.md',
  build: () =>
    contract({
      body: sections({ order: 'strict', allowUnknown: true }, [
        section('Summary'),
        optional(section('Status')),
        gap(),
        section('References'),
      ]),
    }),
  cases: [
    {
      label: 'pass — optional Status after an unknown Design, gap ahead',
      source: loadCorpusSource('./39a-strict-order-unknown-before-gap.pass.md'),
      findings: loadExpected('./39a-strict-order-unknown-before-gap.pass.expected.json'),
    },
    {
      label: 'fail — Status after References, with an unknown Design before both',
      source: loadCorpusSource('./39a-strict-order-unknown-before-gap.fail.md'),
      findings: loadExpected('./39a-strict-order-unknown-before-gap.fail.expected.json'),
    },
  ],
}

export default v39a
