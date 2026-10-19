import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The base case: one required H2 resolved by exact, case-sensitive heading text.
const v01: ValidationFixture = {
  id: 'v01',
  title: 'Single required section',
  component: 'structure',
  path: 'notes/rollout.md',
  build: () =>
    contract({
      body: sections({}, [section('Overview')]),
    }),
  cases: [
    {
      label: 'pass — required ## Overview present',
      source: loadCorpusSource('./01-single-required-section.pass.md'),
      findings: loadExpected('./01-single-required-section.pass.expected.json'),
    },
    {
      label: 'fail — only H2 renamed, required section absent',
      source: loadCorpusSource('./01-single-required-section.fail.md'),
      findings: loadExpected('./01-single-required-section.fail.expected.json'),
    },
  ],
}

export default v01
