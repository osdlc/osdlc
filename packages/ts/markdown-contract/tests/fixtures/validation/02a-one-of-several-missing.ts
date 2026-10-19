import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// One of several required sections absent → exactly one section-missing finding.
// The pos of a missing section is the open question, so only `id` is pinned.
const v02a: ValidationFixture = {
  id: 'v02a',
  title: 'One of several required missing',
  component: 'structure',
  path: 'docs/note.md',
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
      label: 'pass — all three sections present',
      source: loadCorpusSource('./02a-one-of-several-missing.pass.md'),
      findings: loadExpected('./02a-one-of-several-missing.pass.expected.json'),
    },
    {
      label: 'fail — Overview omitted',
      source: loadCorpusSource('./02a-one-of-several-missing.fail.md'),
      findings: loadExpected('./02a-one-of-several-missing.fail.expected.json'),
    },
  ],
}

export default v02a
