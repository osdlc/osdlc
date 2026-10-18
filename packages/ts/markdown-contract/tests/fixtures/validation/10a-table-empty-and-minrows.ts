import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// A header-only table with the right columns but zero data rows. The original example
// inferred `content/table-min-rows`; reconciled to the
// `content/<leaf>/<check>` scheme → content/table/min-rows, the id the validator emits.
const v10a: ValidationFixture = {
  id: 'v10a',
  title: 'Empty table / below minRows',
  component: 'content',
  path: 'docs/.../task.md',
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
      label: 'pass — columns match and one data row',
      source: loadCorpusSource('./10a-table-empty-and-minrows.pass.md'),
      findings: loadExpected('./10a-table-empty-and-minrows.pass.expected.json'),
    },
    {
      label: 'fail — data row dropped, header-only table',
      source: loadCorpusSource('./10a-table-empty-and-minrows.fail.md'),
      findings: loadExpected('./10a-table-empty-and-minrows.fail.expected.json'),
    },
  ],
}

export default v10a
