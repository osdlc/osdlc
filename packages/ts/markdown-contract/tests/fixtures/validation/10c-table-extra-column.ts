import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// extraColumns: "error" reports an undeclared column. Gaps & questions: Resolved
//  — content/table/column-extra (error) at the table's pos, line 3.
const v10c: ValidationFixture = {
  id: 'v10c',
  title: 'Table with an extra column',
  component: 'content',
  path: 'docs/.../README.md',
  build: () =>
    contract({
      body: sections({}, [
        section('Files', {
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            minRows: 1,
            extraColumns: 'error',
          }),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — only the three declared columns',
      source: loadCorpusSource('./10c-table-extra-column.pass.md'),
      findings: loadExpected('./10c-table-extra-column.pass.expected.json'),
    },
    {
      label: 'fail — extra undeclared Owner column',
      source: loadCorpusSource('./10c-table-extra-column.fail.md'),
      findings: loadExpected('./10c-table-extra-column.fail.expected.json'),
    },
  ],
}

export default v10c
