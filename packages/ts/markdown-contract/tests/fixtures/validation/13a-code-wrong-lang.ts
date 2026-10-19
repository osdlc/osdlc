import { code, contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Edge on 13: the code leaf rejects a mismatched (or absent) fence language.
// Note: the original example inferred `content/code-lang`; reconciled to the
//  `content/<leaf>/<check>` scheme → content/code/lang. Level + line unchanged.
const v13a: ValidationFixture = {
  id: 'v13a',
  title: 'Code block wrong/absent language',
  component: 'content',
  path: 'docs/.../page.md',
  build: () =>
    contract({
      body: sections({}, [section('Example', { content: code({ lang: 'ts' }) })]),
    }),
  cases: [
    {
      label: 'pass — fence retagged ts',
      source: loadCorpusSource('./13a-code-wrong-lang.pass.md'),
      findings: loadExpected('./13a-code-wrong-lang.pass.expected.json'),
    },
    {
      label: 'fail — fence tagged python rejected',
      source: loadCorpusSource('./13a-code-wrong-lang.fail.md'),
      findings: loadExpected('./13a-code-wrong-lang.fail.expected.json'),
    },
  ],
}

export default v13a
