import { contract, optional, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// optional(section(...)) — valid present or absent, no finding either way.
// The FAIL drops a required section; the absent optional contributes nothing.
const v03: ValidationFixture = {
  id: 'v03',
  title: 'Optional sections',
  component: 'structure',
  path: 'docs/notes/cache.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Title'),
        section('Overview'),
        optional(section('Notes')),
      ]),
    }),
  cases: [
    {
      label: 'pass — required pair present, optional Notes present',
      source: loadCorpusSource('./03-optional-sections.pass-1.md'),
      findings: loadExpected('./03-optional-sections.pass-1.expected.json'),
    },
    {
      label: 'pass — optional Notes omitted entirely',
      source: loadCorpusSource('./03-optional-sections.pass-2.md'),
      findings: loadExpected('./03-optional-sections.pass-2.expected.json'),
    },
    {
      label: 'fail — required Overview dropped; absent optional Notes is silent',
      source: loadCorpusSource('./03-optional-sections.fail.md'),
      findings: loadExpected('./03-optional-sections.fail.expected.json'),
    },
  ],
}

export default v03
