import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// A level holding several required sections; presence is checked per-section,
// order unconstrained. The absent section's exact line is engine-defined, so
// only id + level are pinned.
const v02: ValidationFixture = {
  id: 'v02',
  title: 'Multiple required sections',
  component: 'structure',
  path: 'note.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Title'),
        section('Overview'),
        section('Status'),
      ]),
    }),
  cases: [
    {
      label: 'pass — all three required sections present',
      source: loadCorpusSource('./02-multiple-required-sequence.pass.md'),
      findings: loadExpected('./02-multiple-required-sequence.pass.expected.json'),
    },
    {
      label: 'fail — Overview dropped; only the absent one is flagged',
      source: loadCorpusSource('./02-multiple-required-sequence.fail.md'),
      findings: loadExpected('./02-multiple-required-sequence.fail.expected.json'),
    },
  ],
}

export default v02
