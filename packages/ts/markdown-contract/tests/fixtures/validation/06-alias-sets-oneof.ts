import { contract, oneOf, optional, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// oneOf(names) — one required slot, several interchangeable spellings.
// Gaps & questions: None. An unfilled slot emits one structure/section-missing;
// the absent-slot line is engine-defined, so only id + level are pinned.
const v06: ValidationFixture = {
  id: 'v06',
  title: 'Alias sets via oneOf',
  component: 'structure',
  path: 'docs/notes/goal.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        oneOf(['Goal', 'Goal / Problem statement']),
        optional(section('Notes')),
      ]),
    }),
  cases: [
    {
      label: 'pass — short spelling present',
      source: loadCorpusSource('./06-alias-sets-oneof.pass-1.md'),
      findings: loadExpected('./06-alias-sets-oneof.pass-1.expected.json'),
    },
    {
      label: 'pass — long spelling present, optional Notes omitted',
      source: loadCorpusSource('./06-alias-sets-oneof.pass-2.md'),
      findings: loadExpected('./06-alias-sets-oneof.pass-2.expected.json'),
    },
    {
      label: 'fail — heading matches no alias spelling',
      source: loadCorpusSource('./06-alias-sets-oneof.fail.md'),
      findings: loadExpected('./06-alias-sets-oneof.fail.expected.json'),
    },
  ],
}

export default v06
