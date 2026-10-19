import { contract, optional, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// A sibling heading repeated → structure/duplicate-section.
// Which occurrence carries the pos is not committed, so the line is left open.
const v03a: ValidationFixture = {
  id: 'v03a',
  title: 'Duplicate section heading',
  component: 'structure',
  path: 'note.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Title'),
        optional(section('Overview')),
      ]),
    }),
  cases: [
    {
      label: 'pass — Title then a single Overview',
      source: loadCorpusSource('./03a-duplicate-section.pass.md'),
      findings: loadExpected('./03a-duplicate-section.pass.expected.json'),
    },
    {
      label: 'fail — Overview heading repeated',
      source: loadCorpusSource('./03a-duplicate-section.fail.md'),
      findings: loadExpected('./03a-duplicate-section.fail.expected.json'),
    },
  ],
}

export default v03a
