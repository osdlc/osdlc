import { z } from 'zod'
import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// One cell outside its declared z.enum → one localized cell finding. The original example
// guessed `content/enum`; reconciled to the  `content/<leaf>/<check>`
// scheme → content/table/cell. The S7 row remap is now implemented (the finding
// localizes via rowPos(1) → the `rename` row on line 6), so line is pinned too.
const v11a: ValidationFixture = {
  id: 'v11a',
  title: 'Cell enum violation',
  component: 'content',
  path: 'docs/.../TASK.md',
  build: () =>
    contract({
      body: sections({}, [
        section('Files to touch', {
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            cells: { Kind: z.enum(['add', 'modify', 'delete']) },
          }),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — every Kind cell in the enum',
      source: loadCorpusSource('./11a-cell-enum-violation.pass.md'),
      findings: loadExpected('./11a-cell-enum-violation.pass.expected.json'),
    },
    {
      label: 'fail — row 2 Kind is rename, outside the enum',
      source: loadCorpusSource('./11a-cell-enum-violation.fail.md'),
      findings: loadExpected('./11a-cell-enum-violation.fail.expected.json'),
    },
  ],
}

export default v11a
