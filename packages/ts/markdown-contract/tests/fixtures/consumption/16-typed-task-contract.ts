import { z } from 'zod'
import { contract, list, section, sections, table } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// The end-to-end DOGFOOD of structured cells: "use case 1" (a task's `Files to touch`
// table with a transforming `Location` cell + a `Kind` enum) combined with a transforming
// `Dependencies` list AND per-cell positions — all three slices exercised TOGETHER on ONE
// realistic task-shaped document. Gates on `cell-pos`, the last of the three components this
// fixture reaches (cell-typed → list-typed → cell-pos).
//
//   - `Location` (transforming cell) reads back as `{ path, symbol? }` — no consumer re-parse.
//   - `Kind` (a plain `z.enum`, no transform) reads back as the enum member.
//   - `Dependencies` (`list({ everyItem })`) reads back as typed `{ ref, text }` items.
//   - The SAME `Location` cell's `cellPos(row, col).col` and inline-code `inlineSpans(...)` are
//     asserted — positions survive the transform.
//
// TWO surprises this end-to-end test surfaces (both engine behaviours, not fixture bugs):
//   1. The transform receives the cell text with its backticks ALREADY STRIPPED — the projection
//      flattens inline-code (`` `a/b.ts#sym` `` → `a/b.ts#sym`) before the cell schema runs. So
//      unlike the canonical backticked `LOCATION_RE`, this transform parses the unbackticked
//      text; the `.md` cells stay backticked only so `inlineSpans(...)` has a code span to return.
//   2. `Doc.inlineSpans` matches its row by RAW string content, but a transformed row's `Location`
//      is an object — so the typed row won't content-match. The span read re-forms the raw cell
//      string from the typed `Location` (the parsed value round-trips to its source key) to look
//      the span up. `TableView.cellPos`, by contrast, matches by reference and takes the typed row.
//
// `peerless`: v1 YAML expresses neither a Zod `.transform()` nor the position accessors, so there
// is no `.contract.yaml` twin for this fixture (see tests/yaml-parity.test.ts).

/**
 *  use-case-1 `Location`, adjusted for the flattened (unbackticked) cell text:
 * `a/b.ts#sym` → { path: "a/b.ts", symbol: "sym" }; `a/b.ts` → { path: "a/b.ts" }.
 */
const LOCATION_RE = /^([^#`]+)(?:#([^`]+))?$/ // path or path#symbol (backticks already flattened off)
const Location = z.string().transform((s, ctx) => {
  const m = LOCATION_RE.exec(s.trim())
  if (!m) {
    ctx.addIssue({ code: 'custom', message: 'not a `path` or `path#symbol`' })
    return z.NEVER
  }
  const [, path = '', symbol] = m
  return symbol ? { path, symbol } : { path }
})

/** `T-SCTC: capture the output` → { ref: "", text: "capture the output" }. */
const dependency = z.string().transform((raw) => {
  const [ref = '', ...rest] = raw.split(':')
  return { ref: ref.trim(), text: rest.join(':').trim() }
})

/** Re-form the raw `Location` cell string from the typed value, to look up its inline span. */
function rawLocation(loc: { path: string; symbol?: string }): string {
  return loc.symbol ? `${loc.path}#${loc.symbol}` : loc.path
}

const c16: ConsumptionFixture = {
  id: 'c16',
  title: 'Worked task contract — transforming cell + list + positions together',
  component: 'cell-pos',
  path: 'docs/task.md',
  source: loadSource(import.meta.url, './16-typed-task-contract.md'),
  peerless: true,
  build: () =>
    contract({
      body: sections({}, [
        section('Files to touch', {
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            cells: {
              Location, // transforms → { path; symbol? }
              Kind: z.enum(['new', 'modify', 'delete']), // closed vocabulary, no transform
            },
          }),
        }),
        section('Dependencies', {
          content: list({ everyItem: dependency, minItems: 1 }),
        }),
      ]),
    }),
  reads: [
    {
      label:
        "filesToTouch.rows[0].Location === { path: '…/leaves.ts', symbol: 'table' } — transformed cell",
      get: (doc) => (doc.body as any).filesToTouch.rows[0].Location,
      equals: { path: 'packages/core/src/core/leaves.ts', symbol: 'table' },
    },
    {
      label: 'filesToTouch.rows[0].Location.path — the parsed path field, no consumer re-parse',
      get: (doc) => (doc.body as any).filesToTouch.rows[0].Location.path,
      equals: 'packages/core/src/core/leaves.ts',
    },
    {
      label: "filesToTouch.rows[3].Location === { path: '…/table-shim.ts' } — a symbol-less cell",
      get: (doc) => (doc.body as any).filesToTouch.rows[3].Location,
      equals: { path: 'packages/core/src/legacy/table-shim.ts' },
    },
    {
      label:
        "filesToTouch.find(r => r.Kind === 'new')?.Location.symbol === 'RowOf' — the enum read back",
      get: (doc) =>
        (doc.body as any).filesToTouch.find((r: any) => r.Kind === 'new')?.Location.symbol,
      equals: 'RowOf',
    },
    {
      label:
        "dependencies.lists[0].items[0] === { ref: 'T-SCTC', text: '…' } — transformed list item",
      get: (doc) => (doc.body as any).dependencies.lists[0].items[0],
      equals: { ref: 'T-SCTC', text: 'capture the transform output on the table node' },
    },
    {
      label: "dependencies.lists[0].items[2].ref === 'T-SCPP' — the parsed ref of the typed item",
      get: (doc) => (doc.body as any).dependencies.lists[0].items[2].ref,
      equals: 'T-SCPP',
    },
    {
      label: "cellPos(rows[0], 'Location').col — the transformed cell's own source column",
      get: (doc) => {
        const files = (doc.body as any).filesToTouch
        return files.cellPos(files.rows[0], 'Location').col
      },
      equals: 3,
    },
    {
      label:
        "inlineSpans(rows[0], 'Location') — the backticked path's inline-code span, transform intact",
      get: (doc) => {
        const files = (doc.body as any).filesToTouch
        const rawRow = { ...files.rows[0], Location: rawLocation(files.rows[0].Location) }
        return (doc as any).inlineSpans(rawRow, 'Location')
      },
      equals: [
        {
          start: { line: 10, col: 3 },
          end: { line: 10, col: 43 },
          raw: '`packages/core/src/core/leaves.ts#table`',
        },
      ],
    },
  ],
}

export default c16
