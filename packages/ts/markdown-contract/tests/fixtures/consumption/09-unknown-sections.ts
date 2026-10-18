import { contract, gap, optional, section, sections } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// gap()/allowUnknown admissions land in body.unknown: SectionView[] — a positional list, read by
// index or iteration. Reuses validation v05's StatusContract (strict prefix + gap tail) + its doc,
// where "Risks" slots into the gap.
const c09: ConsumptionFixture = {
  id: 'c09',
  title: 'Unknown sections',
  component: 'consumption',
  path: 'status.md',
  source: loadSource(import.meta.url, './09-unknown-sections.md'),
  build: () =>
    contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        section('Title'),
        section('Overview'),
        section('Status'),
        gap(),
        optional(section('Appendix')),
      ]),
    }),
  reads: [
    {
      label: "doc.body.status.text() === 'On track.'",
      get: (doc) => (doc.body as any).status.text(),
      equals: 'On track.',
    },
    {
      label: "doc.body.appendix.text() === 'Source dashboards.'",
      get: (doc) => (doc.body as any).appendix.text(),
      equals: 'Source dashboards.',
    },
    {
      label: 'doc.body.unknown.length === 1',
      get: (doc) => (doc.body as any).unknown.length,
      equals: 1,
    },
    {
      label: "doc.body.unknown[0].name === 'Risks' — heading text is the only handle",
      get: (doc) => (doc.body as any).unknown[0].name,
      equals: 'Risks',
    },
    {
      // Reconciled: the `## Risks` heading is on line 13, positioned with col by the projection;
      // the original example's bare `{ line: 13 }` was shorthand. The model preserves positions verbatim.
      label: 'doc.body.unknown[0].pos === { line: 13, col: 1 } — heading SourcePos, intact',
      get: (doc) => (doc.body as any).unknown[0].pos,
      equals: { line: 13, col: 1 },
    },
    {
      label: "doc.body.unknown[0].text() === 'Capacity headroom is thin.'",
      get: (doc) => (doc.body as any).unknown[0].text(),
      equals: 'Capacity headroom is thin.',
    },
    {
      label: "doc.body.unknown.map(s => s.name) === ['Risks']",
      get: (doc) => (doc.body as any).unknown.map((s: any) => s.name),
      equals: ['Risks'],
    },
  ],
}

export default c09
