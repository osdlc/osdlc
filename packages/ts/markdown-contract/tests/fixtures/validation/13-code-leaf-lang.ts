import { code, contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The code({ lang }) content leaf: assert the fence's info-string language.
// Note: the original example inferred `content/code-lang`; reconciled to the
//  `content/<leaf>/<check>` scheme → content/code/lang. Level + line unchanged.
const v13: ValidationFixture = {
  id: 'v13',
  title: 'Code leaf: language',
  component: 'content',
  path: 'docs/.../README.md',
  build: () =>
    contract({
      body: sections({}, [section('Example', { content: code({ lang: 'ts' }) })]),
    }),
  cases: [
    {
      label: 'pass — fence tagged ts matches declared lang',
      source: loadCorpusSource('./13-code-leaf-lang.pass.md'),
      findings: loadExpected('./13-code-leaf-lang.pass.expected.json'),
    },
    {
      label: 'fail — fence tagged js does not match required ts',
      source: loadCorpusSource('./13-code-leaf-lang.fail.md'),
      findings: loadExpected('./13-code-leaf-lang.fail.expected.json'),
    },
  ],
}

export default v13
