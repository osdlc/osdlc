import { contract, maxWords, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// section() with a content leaf (maxWords) + a required anchor. Gaps & questions:
// None. FAIL drops the anchor (prose stays under budget) → structure/anchor-missing
// localized to the ## Summary heading on line 1.
const v09: ValidationFixture = {
  id: 'v09',
  title: 'Section content leaf: maxWords + required anchor',
  component: 'content',
  path: 'docs/.../README.md',
  build: () =>
    contract({
      body: sections({}, [section('Summary', { anchor: 'summary', content: maxWords(120) })]),
    }),
  cases: [
    {
      label: 'pass — under budget and ^summary anchor present',
      source: loadCorpusSource('./09-section-content-leaf-maxwords-anchor.pass.md'),
      findings: loadExpected('./09-section-content-leaf-maxwords-anchor.pass.expected.json'),
    },
    {
      label: 'fail — anchor dropped, prose still under budget',
      source: loadCorpusSource('./09-section-content-leaf-maxwords-anchor.fail.md'),
      findings: loadExpected('./09-section-content-leaf-maxwords-anchor.fail.expected.json'),
    },
  ],
}

export default v09
