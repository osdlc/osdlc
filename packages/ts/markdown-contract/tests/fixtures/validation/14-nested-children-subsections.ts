import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// section({ children: sections(...) }) — a nested body grammar one level down.
const v14: ValidationFixture = {
  id: 'v14',
  title: 'Nested children (subsections)',
  component: 'structure',
  path: 'decision.md',
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Decision', {
          children: sections({ order: 'strict', allowUnknown: true }, [
            section('Components'),
            section('Resolution'),
          ]),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — child H3s match [Components, Resolution] in strict order',
      source: loadCorpusSource('./14-nested-children-subsections.pass.md'),
      findings: loadExpected('./14-nested-children-subsections.pass.expected.json'),
    },
    {
      label: 'fail — H3s swapped; child grammar is strict, out of order',
      source: loadCorpusSource('./14-nested-children-subsections.fail.md'),
      findings: loadExpected('./14-nested-children-subsections.fail.expected.json'),
    },
  ],
}

export default v14
