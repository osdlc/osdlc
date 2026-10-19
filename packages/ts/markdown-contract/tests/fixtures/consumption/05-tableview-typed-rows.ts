import { z } from 'zod'
import { contract, section, sections, table } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// TableView<Row> — iteration, column(), find(), rowPos(), rowCount, columns, pos. Reuses validation
// v11's FilesContract (Kind enum cell, Location pattern) + its "## Files" sample document.
const c05: ConsumptionFixture = {
  id: 'c05',
  title: 'TableView typed rows',
  component: 'consumption',
  path: 'docs/task.md',
  source: loadSource(import.meta.url, './05-tableview-typed-rows.md'),
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
  reads: [
    {
      label: "files.columns === ['File', 'Kind', 'Location']",
      get: (doc) => (doc.body as any).files.columns,
      equals: ['File', 'Kind', 'Location'],
    },
    {
      label: 'files.rowCount === 3',
      get: (doc) => (doc.body as any).files.rowCount,
      equals: 3,
    },
    {
      // Reconciled: `files` promotes to the TableView (sole `content: table(...)`), so `.pos`
      // is the TABLE block's SourcePos — the table starts on line 3 (heading line 1, blank line 2),
      // with col, as the projection positions it. the original example's `{ line: 1 }` named the heading.
      label: "files.pos === { line: 3, col: 1 } — the table block's SourcePos",
      get: (doc) => (doc.body as any).files.pos,
      equals: { line: 3, col: 1 },
    },
    {
      label: "files.column('Kind') — the enum union column",
      get: (doc) => (doc.body as any).files.column('Kind'),
      equals: ['add', 'modify', 'delete'],
    },
    {
      label: "files.column('File') — string[] column",
      get: (doc) => (doc.body as any).files.column('File'),
      equals: ['grammar.ts', 'leaves.ts', 'legacy.ts'],
    },
    {
      label: "files.find(r => r.Kind === 'delete')?.File === 'legacy.ts'",
      get: (doc) => (doc.body as any).files.find((r: any) => r.Kind === 'delete')?.File,
      equals: 'legacy.ts',
    },
    {
      label: "files.find((r, i) => i === 0)?.File === 'grammar.ts'",
      get: (doc) => (doc.body as any).files.find((_r: any, i: number) => i === 0)?.File,
      equals: 'grammar.ts',
    },
    {
      // Reconciled: the `legacy.ts` body row is on line 7 (heading 1, blank 2, header 3,
      // separator 4, grammar.ts 5, leaves.ts 6, legacy.ts 7), positioned with col by the
      // projection; the original example's `{ line: 6 }` miscounted (it skipped the separator row).
      label: "files.rowPos(2) === { line: 7, col: 1 } — the legacy.ts row's source line",
      get: (doc) => (doc.body as any).files.rowPos(2),
      equals: { line: 7, col: 1 },
    },
  ],
}

export default c05
