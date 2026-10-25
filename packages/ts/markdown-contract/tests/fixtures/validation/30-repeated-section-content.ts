import { contract, list, requires, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// A repeatable section's content and text rules apply to every occurrence, not just the
// first: the second Entry has one item and does not say "shipped".
const v30: ValidationFixture = {
  id: 'v30',
  title: 'Every occurrence of a repeatable section is checked',
  component: 'content',
  path: 'logs/changelog.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Entry', {
          repeatable: true,
          content: list({ minItems: 2 }),
          rules: [requires([{ pattern: 'shipped' }])],
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — both Entry sections have two items and say "shipped"',
      source: loadCorpusSource('./30-repeated-section-content.pass.md'),
      findings: loadExpected('./30-repeated-section-content.pass.expected.json'),
    },
    {
      label: 'fail — the second Entry has one item and never says "shipped"',
      source: loadCorpusSource('./30-repeated-section-content.fail.md'),
      findings: loadExpected('./30-repeated-section-content.fail.expected.json'),
    },
  ],
}

export default v30
