import { contract, list, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The `list()` content leaf: every item a checkbox, minItems floor.
// Note: the original example guessed `list/every-item` for a non-checkbox item;
// reconciled to the  `content/<leaf>/<check>` scheme → content/list/item-kind
// (the `everyItem` kind check). Level + line are unchanged.
const v12: ValidationFixture = {
  id: 'v12',
  title: 'List leaf: checkbox items + minItems',
  component: 'content',
  path: 'docs/.../task.md',
  build: () =>
    contract({
      body: sections({}, [
        section('Acceptance criteria', {
          content: list({ everyItem: 'checkbox', minItems: 1 }),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — all three items are checkboxes, count clears minItems',
      source: loadCorpusSource('./12-list-leaf-checkbox-minitems.pass.md'),
      findings: loadExpected('./12-list-leaf-checkbox-minitems.pass.expected.json'),
    },
    {
      label: 'fail — third item is a plain bullet, everyItem violated',
      source: loadCorpusSource('./12-list-leaf-checkbox-minitems.fail.md'),
      findings: loadExpected('./12-list-leaf-checkbox-minitems.fail.expected.json'),
    },
  ],
}

export default v12
