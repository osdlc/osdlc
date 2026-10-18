import { contract, oneOf, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Two distinct members of one oneOf set both present → an ambiguous slot. The
// finding id (reuse structure/duplicate-section vs mint a dedicated id) is
// under-specified and invented, so only `id` is pinned.
const v06b: ValidationFixture = {
  id: 'v06b',
  title: 'Two alias members both present',
  component: 'structure',
  path: 'note.md',
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        oneOf(['Goal', 'Goal / Problem statement']),
      ]),
    }),
  cases: [
    {
      label: 'pass — exactly one alias member present',
      source: loadCorpusSource('./06b-oneof-two-members-present.pass.md'),
      findings: loadExpected('./06b-oneof-two-members-present.pass.expected.json'),
    },
    {
      label: 'fail — both alias spellings present',
      source: loadCorpusSource('./06b-oneof-two-members-present.fail.md'),
      findings: loadExpected('./06b-oneof-two-members-present.fail.expected.json'),
    },
  ],
}

export default v06b
