import { contract, optional, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Under strict order with unknown sections allowed, an unknown section does not move the order
// check past the optional sections after it. A declared section that really is out of order is
// still reported, once.
const v39: ValidationFixture = {
  id: 'v39',
  title: 'Unknown sections do not affect strict order',
  component: 'structure',
  path: 'docs/design/cache.md',
  build: () =>
    contract({
      body: sections({ order: 'strict', allowUnknown: true }, [
        section('Summary'),
        section('Scope'),
        optional(section('Status')),
        optional(section('References')),
      ]),
    }),
  cases: [
    {
      label: 'pass — optional sections in order after an unknown Design',
      source: loadCorpusSource('./39-strict-order-unknown-sections.pass.md'),
      findings: loadExpected('./39-strict-order-unknown-sections.pass.expected.json'),
    },
    {
      label: 'fail — Status after References, with unknown sections between',
      source: loadCorpusSource('./39-strict-order-unknown-sections.fail.md'),
      findings: loadExpected('./39-strict-order-unknown-sections.fail.expected.json'),
    },
  ],
}

export default v39
