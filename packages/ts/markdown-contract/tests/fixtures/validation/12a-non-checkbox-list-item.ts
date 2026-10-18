import { contract, list, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Edge on 12: the everyItem: "checkbox" predicate fails on a single bare bullet.
// Note: the original example guessed `content/every-item`; reconciled to the
//  `content/<leaf>/<check>` scheme → content/list/item-kind. The original example
// pinned line 4, but the bare bullet sits on source line 5 (the finding localizes to
// item.pos); line corrected to 5.
const v12a: ValidationFixture = {
  id: 'v12a',
  title: 'Non-checkbox AC item',
  component: 'content',
  path: 'docs/tasks/T-XXXX.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Acceptance criteria', {
          content: list({ everyItem: 'checkbox', minItems: 1 }),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — every bullet is a checkbox, clears minItems',
      source: loadCorpusSource('./12a-non-checkbox-list-item.pass.md'),
      findings: loadExpected('./12a-non-checkbox-list-item.pass.expected.json'),
    },
    {
      label: 'fail — one plain bullet among three checkbox items',
      source: loadCorpusSource('./12a-non-checkbox-list-item.fail.md'),
      findings: loadExpected('./12a-non-checkbox-list-item.fail.expected.json'),
    },
  ],
}

export default v12a
