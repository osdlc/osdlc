import { contract, gap, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// gap({ min, max }) bounds the admit-count of the window. Both bound violations
// are stressed. The finding id (structure/gap-count) and its pos are invented /
// open, so only `id` is pinned. FAIL docs are described, not given verbatim.
const v05b: ValidationFixture = {
  id: 'v05b',
  title: 'gap({min,max}) bounds the window',
  component: 'structure',
  path: 'release.md',
  build: () =>
    contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        section('Summary'),
        section('Highlights'),
        gap({ min: 1, max: 2 }),
        section('Sign-off'),
      ]),
    }),
  cases: [
    {
      label: 'pass — one extra in the [1,2] window',
      source: loadCorpusSource('./05b-gap-bounds.pass.md'),
      findings: loadExpected('./05b-gap-bounds.pass.expected.json'),
    },
    {
      label: 'fail (doc A) — zero extras, below min: 1',
      source: loadCorpusSource('./05b-gap-bounds.fail-1.md'),
      findings: loadExpected('./05b-gap-bounds.fail-1.expected.json'),
    },
    {
      label: 'fail (doc B) — three extras, above max: 2',
      source: loadCorpusSource('./05b-gap-bounds.fail-2.md'),
      findings: loadExpected('./05b-gap-bounds.fail-2.expected.json'),
    },
  ],
}

export default v05b
