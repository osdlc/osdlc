import { z } from 'zod'
import { contract, section, sections, table } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// One section, three keys (bracket / dotted camelCase / section() accessor) → the same SectionView.
// Reuses validation v18's FilesContract + its "## Files to touch" sample document.
const c03: ConsumptionFixture = {
  id: 'c03',
  title: 'Dual-key section access',
  component: 'consumption',
  path: 'docs/tasks/T-0042.md',
  source: loadSource(import.meta.url, './03-dual-key-section-access.md'),
  build: () =>
    contract({
      frontmatter: z
        .object({
          id: z.string().regex(/^T-[0-9A-Z]{4}$/),
          status: z.enum(['open/ready', 'in-progress/active', 'closed/done']),
        })
        .strict(),
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Files to touch', {
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            cells: { Kind: z.enum(['new', 'modify', 'delete']) },
          }),
        }),
      ]),
    }),
  // `Files to touch` declares a SOLE `content: table(...)`, so its dual-key keys PROMOTE to
  // the `TableView` ("the heading IS the table"): `doc.body.<section>` is the TableView, not a
  // SectionView. Bracket and dotted access give the SAME promoted TableView (the dual-key
  // invariant), while `.section(name)` gives the underlying SectionView (name/pos).
  reads: [
    {
      label: 'exact === dotted — same promoted TableView behind both keys, not a copy',
      get: (doc) => (doc.body as any)['Files to touch'] === (doc.body as any).filesToTouch,
      equals: true,
    },
    {
      label: 'section() resolves the underlying SectionView, stable across calls',
      get: (doc) =>
        (doc.body as any).section('Files to touch') === (doc.body as any).section('Files to touch'),
      equals: true,
    },
    {
      label: "section('Files to touch').name — the underlying SectionView's exact heading",
      get: (doc) => (doc.body as any).section('Files to touch').name,
      equals: 'Files to touch',
    },
    {
      label: "exact.kind === 'table' — the promoted key is the TableView (BlockView discriminant)",
      get: (doc) => (doc.body as any)['Files to touch'].kind,
      equals: 'table',
    },
    {
      label: "section('Files to touch').pos — one SourcePos, one underlying node (heading line 6)",
      get: (doc) => (doc.body as any).section('Files to touch').pos,
      equals: { line: 6, col: 1 },
    },
    {
      label: 'dotted.rowCount === 3 — the promoted TableView reads directly behind every key',
      get: (doc) => (doc.body as any).filesToTouch.rowCount,
      equals: 3,
    },
  ],
}

export default c03
