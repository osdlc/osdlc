import { contract, list, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The minItems floor (raised to 2): the count assertion fires, not everyItem.
// Note: the original example pinned `list/min-items`; reconciled to the
// `content/<leaf>/<check>` scheme → content/list/min-items. Level + line unchanged.
const v12b: ValidationFixture = {
  id: 'v12b',
  title: 'List below minItems',
  component: 'content',
  path: 'docs/.../task.md',
  build: () =>
    contract({
      body: sections({}, [
        section('Acceptance criteria', {
          content: list({ everyItem: 'checkbox', minItems: 2 }),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — two checkbox items meet minItems: 2',
      source: loadCorpusSource('./12b-list-below-minitems.pass.md'),
      findings: loadExpected('./12b-list-below-minitems.pass.expected.json'),
    },
    {
      label: 'fail — single-item list falls below minItems: 2',
      source: loadCorpusSource('./12b-list-below-minitems.fail.md'),
      findings: loadExpected('./12b-list-below-minitems.fail.expected.json'),
    },
  ],
}

export default v12b
