import { z } from 'zod'
import { contract, section, sections, table } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// Backward-compat guard for : a contract with NO transforming cells reads back
// BYTE-IDENTICAL rows (raw `Record<string, string>`), exactly as it does before structured cells
// land. Same shape as c05 (a Kind enum + a Location pattern), but no `.transform()` anywhere — so
// the enum/pattern only VALIDATE, they never rewrite a cell. This fixture is gated on `consumption`
// (already `true`), so it ACTUALLY RUNS and demonstrates the no-golden-moves criterion, while the
// three transform/position fixtures (c12–c14) stay skipped under their `false` gates. It keeps its
// real `.contract.yaml` twin (a no-transform contract round-trips through v1 YAML).

const c15: ConsumptionFixture = {
  id: 'c15',
  title: 'No-transform contract reads back byte-identical rows',
  component: 'consumption',
  path: 'docs/task.md',
  source: loadSource(import.meta.url, './15-no-transform-parity.md'),
  build: () =>
    contract({
      body: sections({}, [
        section('Files', {
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            cells: {
              Kind: z.enum(['modify', 'delete']),
              Location: z.string().regex(/^[A-Za-z0-9._/-]+$/),
            },
          }),
        }),
      ]),
    }),
  reads: [
    {
      label: 'files.rowCount === 3',
      get: (doc) => (doc.body as any).files.rowCount,
      equals: 3,
    },
    {
      label: 'files.rows — raw string rows, unchanged (no transform applied)',
      get: (doc) => (doc.body as any).files.rows,
      equals: [
        { Location: 'src/core/leaves.ts', Kind: 'modify', Change: 'make table() generic' },
        { Location: 'src/core/types.ts', Kind: 'modify', Change: 'confirm the Row slot' },
        { Location: 'src/legacy.ts', Kind: 'delete', Change: 'remove legacy path' },
      ],
    },
    {
      label: "files.column('Location') === the raw cell strings, verbatim",
      get: (doc) => (doc.body as any).files.column('Location'),
      equals: ['src/core/leaves.ts', 'src/core/types.ts', 'src/legacy.ts'],
    },
    {
      label: "files.find(r => r.Kind === 'delete')?.Location === 'src/legacy.ts'",
      get: (doc) => (doc.body as any).files.find((r: any) => r.Kind === 'delete')?.Location,
      equals: 'src/legacy.ts',
    },
  ],
}

export default c15
