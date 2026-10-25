import { contract, forbids, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// A code block's text ends at its last line, with no newline before the closing fence, so
// a regex anchored with `$` matches a word at the end of the block.
const v37: ValidationFixture = {
  id: 'v37',
  title: 'A code block value has no trailing newline',
  component: 'text-api',
  path: 'docs/example.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Example', { rules: [forbids([{ regex: 'TODO$' }])] }),
      ]),
    }),
  cases: [
    {
      label: 'pass — TODO is not at the end of the block',
      source: loadCorpusSource('./37-code-block-value.pass.md'),
      findings: loadExpected('./37-code-block-value.pass.expected.json'),
    },
    {
      label: 'fail — the block ends with TODO',
      source: loadCorpusSource('./37-code-block-value.fail.md'),
      findings: loadExpected('./37-code-block-value.fail.expected.json'),
    },
  ],
}

export default v37
