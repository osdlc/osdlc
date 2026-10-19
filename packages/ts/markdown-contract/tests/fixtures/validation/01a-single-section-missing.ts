import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Failure variant of 01: the one required section is absent. The id and the
// position of an absence are both hedged as under-specified, so only `id` is pinned.
const v01a: ValidationFixture = {
  id: 'v01a',
  title: 'Required section absent',
  component: 'structure',
  path: 'notes/widget.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [section('Overview')]),
    }),
  cases: [
    {
      label: 'pass — required ## Overview present',
      source: loadCorpusSource('./01a-single-section-missing.pass.md'),
      findings: loadExpected('./01a-single-section-missing.pass.expected.json'),
    },
    {
      label: 'fail — wrong heading, required Overview absent',
      source: loadCorpusSource('./01a-single-section-missing.fail.md'),
      findings: loadExpected('./01a-single-section-missing.fail.expected.json'),
    },
  ],
}

export default v01a
