import { contract, maxWords, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The content leaf fails (prose over the 120-word budget) while the anchor check
// passes. The leaf-failure id (content/max-words) is inferred, not documented, so
// only `id` is pinned.
const v09a: ValidationFixture = {
  id: 'v09a',
  title: 'maxWords exceeded',
  component: 'content',
  path: 'docs/release/brief.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Summary', { anchor: 'summary', content: maxWords(120) }),
      ]),
    }),
  cases: [
    {
      label: 'pass — anchored and under budget',
      source: loadCorpusSource('./09a-maxwords-exceeded.pass.md'),
      findings: loadExpected('./09a-maxwords-exceeded.pass.expected.json'),
    },
    {
      label: 'fail — anchored but prose runs to 128 words',
      source: loadCorpusSource('./09a-maxwords-exceeded.fail.md'),
      findings: loadExpected('./09a-maxwords-exceeded.fail.expected.json'),
    },
  ],
}

export default v09a
