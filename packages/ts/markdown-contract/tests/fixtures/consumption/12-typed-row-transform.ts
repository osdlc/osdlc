import { z } from 'zod'
import { contract, section, sections, table } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// Typed table-row read-back: the `Location` cell TRANSFORMS its source string into a typed
// `{ path, symbol? }` value, so the row reads back as that structure (not the raw string). A row
// whose Location carries a `#symbol` suffix parses to `{ path, symbol }`; a bare path parses to
// `{ path }`. `Kind` is a plain enum (no transform). Skipped until flip `cell-typed`.
//
// `peerless`: v1 YAML has no way to express a Zod `.transform()`, so there is no `.contract.yaml`
// twin for this fixture (see tests/yaml-parity.test.ts).

/** `src/x.ts#sym` → { path: "src/x.ts", symbol: "sym" }; `src/x.ts` → { path: "src/x.ts" }. */
const Location = z.string().transform((raw) => {
  const [path, symbol] = raw.split('#')
  return symbol ? { path, symbol } : { path }
})

const c12: ConsumptionFixture = {
  id: 'c12',
  title: 'Typed table row via a transforming cell',
  component: 'cell-typed',
  path: 'docs/task.md',
  source: loadSource(import.meta.url, './12-typed-row-transform.md'),
  peerless: true,
  build: () =>
    contract({
      body: sections({}, [
        section('Files', {
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            cells: {
              Location,
              Kind: z.enum(['add', 'modify', 'delete']),
            },
          }),
        }),
      ]),
    }),
  reads: [
    {
      label: "files.rows[0].Location === { path: 'src/core/leaves.ts', symbol: 'table' }",
      get: (doc) => (doc.body as any).files.rows[0].Location,
      equals: { path: 'src/core/leaves.ts', symbol: 'table' },
    },
    {
      label: 'files.rows[0].Location.path — the parsed path field of the typed cell',
      get: (doc) => (doc.body as any).files.rows[0].Location.path,
      equals: 'src/core/leaves.ts',
    },
    {
      label: "files.rows[1].Location === { path: 'src/core/types.ts' } — a symbol-less cell",
      get: (doc) => (doc.body as any).files.rows[1].Location,
      equals: { path: 'src/core/types.ts' },
    },
    {
      label: "files.find(r => r.Kind === 'delete')?.Location.path === 'src/legacy.ts'",
      get: (doc) => (doc.body as any).files.find((r: any) => r.Kind === 'delete')?.Location.path,
      equals: 'src/legacy.ts',
    },
  ],
}

export default c12
