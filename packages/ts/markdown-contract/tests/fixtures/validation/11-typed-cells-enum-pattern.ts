import { z } from 'zod'
import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// table({ cells: { Col: ZodType } }) — per-cell Zod over a declared column. The
// the original example guessed `table/cell`; reconciled to the
// `content/<leaf>/<check>` scheme → content/table/cell. Its row-precise pos is now
// pinned via rowPos(i), but the example pinned id-only, so only `id` is asserted here.
const v11: ValidationFixture = {
  id: 'v11',
  title: 'Typed cells: enum / pattern',
  component: 'content',
  path: 'docs/.../task.md',
  build: () =>
    contract({
      body: sections({}, [
        section('Files', {
          content: table({
            columns: ['File', 'Kind', 'Location'],
            cells: {
              Kind: z.enum(['add', 'modify', 'delete']),
              Location: z.string().regex(/^[A-Za-z0-9._/-]+\/$/),
            },
          }),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — every Kind and Location cell conforms',
      source: loadCorpusSource('./11-typed-cells-enum-pattern.pass.md'),
      findings: loadExpected('./11-typed-cells-enum-pattern.pass.expected.json'),
    },
    {
      label: 'fail — row 2 Kind outside the enum',
      source: loadCorpusSource('./11-typed-cells-enum-pattern.fail.md'),
      findings: loadExpected('./11-typed-cells-enum-pattern.fail.expected.json'),
    },
  ],
}

export default v11
