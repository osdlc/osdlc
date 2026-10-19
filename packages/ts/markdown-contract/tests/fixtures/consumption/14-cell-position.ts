import { contract, section, sections, table } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// Position preservation: a transformed cell keeps its SOURCE geometry. `cellPos(row, col)` returns
// the per-cell `SourcePos` (its own `col`, not just the row's line), and `inlineSpans(row, col)`
// returns the ranges of the inline-code spans inside the cell — here each Location cell is a single
// `` `path` `` inline-code span. Both accessors landed with (`TableView.cellPos` /
// `Doc.inlineSpans`); they are still reached through `(doc.body as any)` / `(doc as any)` casts
// because this navigates the dynamic dual-key model facade (`doc.body.files` is untyped there).
// An inline span is `{ start, end, raw }` with mdast-native endpoints — `start` on the opening
// backtick, `end` one column PAST the closing backtick — and `raw` the verbatim backticked source.
//
// `peerless`: position accessors are a typed-model surface v1 YAML does not express, so there is
// no `.contract.yaml` twin for this fixture (see tests/yaml-parity.test.ts).

const c14: ConsumptionFixture = {
  id: 'c14',
  title: 'Per-cell position and inline-code spans preserved',
  component: 'cell-pos',
  path: 'docs/task.md',
  source: loadSource(import.meta.url, './14-cell-position.md'),
  peerless: true,
  build: () =>
    contract({
      body: sections({}, [
        section('Files', {
          content: table({ columns: ['Location', 'Kind'] }),
        }),
      ]),
    }),
  reads: [
    {
      label: "cellPos(row, 'Location').col — the first Location cell's own source column",
      get: (doc) => {
        const files = (doc.body as any).files
        return files.cellPos(files.rows[0], 'Location').col
      },
      equals: 3,
    },
    {
      label: "inlineSpans(row, 'Location') — the inline-code span range inside the first cell",
      get: (doc) => {
        const files = (doc.body as any).files
        return (doc as any).inlineSpans(files.rows[0], 'Location')
      },
      equals: [
        { start: { line: 5, col: 3 }, end: { line: 5, col: 23 }, raw: '`src/core/leaves.ts`' },
      ],
    },
  ],
}

export default c14
