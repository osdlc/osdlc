import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// table({ columns, minRows }) content leaf. Gaps & questions: None. FAIL drops the
// data rows → content/table/min-rows on the table header, line 3.
// Note: the original example pinned the bare `table/min-rows`; reconciled to the
//  `content/<leaf>/<check>` scheme (content/table/min-rows), the id the
// validator emits. Level + line are unchanged.
const v10: ValidationFixture = {
  id: 'v10',
  title: 'Table leaf: columns + minRows',
  component: 'content',
  path: 'docs/.../README.md',
  build: () =>
    contract({
      body: sections({}, [
        section('Files', {
          content: table({ columns: ['Location', 'Kind', 'Change'], minRows: 1 }),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — columns match and two data rows',
      source: loadCorpusSource('./10-table-leaf-columns-minrows.pass.md'),
      findings: loadExpected('./10-table-leaf-columns-minrows.pass.expected.json'),
    },
    {
      label: 'fail — header-only table, zero data rows',
      source: loadCorpusSource('./10-table-leaf-columns-minrows.fail.md'),
      findings: loadExpected('./10-table-leaf-columns-minrows.fail.expected.json'),
    },
  ],
}

export default v10
