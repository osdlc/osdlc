import { contract, gap, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Under strict order, a section out of place and a gap over its bound are level findings, so
// they take the level's description, not the section's.
const v34: ValidationFixture = {
  id: 'v34',
  title: 'Strict-order and gap findings take the level description as hint',
  component: 'structure',
  path: 'releases/notes.md',
  build: () =>
    contract({
      body: sections(
        {
          order: 'strict',
          allowUnknown: false,
          description: 'The release sections, in order.',
        },
        [
          section('Summary', { description: 'One paragraph.' }),
          gap({ max: 1 }),
          section('Sign-off'),
        ],
      ),
    }),
  cases: [
    {
      label: 'pass — one extra section in the gap',
      source: loadCorpusSource('./34-strict-order-and-gap-hints.pass.md'),
      findings: loadExpected('./34-strict-order-and-gap-hints.pass.expected.json'),
    },
    {
      label: 'fail — Sign-off comes before Summary',
      source: loadCorpusSource('./34-strict-order-and-gap-hints.fail-order.md'),
      findings: loadExpected('./34-strict-order-and-gap-hints.fail-order.expected.json'),
    },
    {
      label: 'fail — two extra sections in a gap of at most one',
      source: loadCorpusSource('./34-strict-order-and-gap-hints.fail-gap.md'),
      findings: loadExpected('./34-strict-order-and-gap-hints.fail-gap.expected.json'),
    },
  ],
}

export default v34
