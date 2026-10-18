import { contract, section, sections, table } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// Two typed tables in one section via the content record, each named by ^anchor → its own
// TableView<Row>. Reuses validation v15's DecisionTablesContract + its "## Decision" sample doc.
const c06: ConsumptionFixture = {
  id: 'c06',
  title: 'Named tables via the content record',
  component: 'consumption',
  path: 'docs/README.md',
  source: loadSource(import.meta.url, './06-named-tables-content-record.md'),
  build: () =>
    contract({
      body: sections({}, [
        section('Decision', {
          content: {
            components: table({ anchor: 'components', columns: ['#', 'Component', 'Resolution'] }),
            risks: table({ anchor: 'risks', columns: ['Risk', 'Mitigation'] }),
          },
        }),
      ]),
    }),
  reads: [
    {
      label: 'decision.components.rowCount === 2',
      get: (doc) => (doc.body as any).decision.components.rowCount,
      equals: 2,
    },
    {
      label: 'decision.risks.rowCount === 1',
      get: (doc) => (doc.body as any).decision.risks.rowCount,
      equals: 1,
    },
    {
      label: "decision.components.column('Component') === ['projection', 'grammar']",
      get: (doc) => (doc.body as any).decision.components.column('Component'),
      equals: ['projection', 'grammar'],
    },
    {
      label: "decision.risks.find(r => r.Risk.includes('gfm'))?.Mitigation === 'pin in spike S6'",
      get: (doc) =>
        (doc.body as any).decision.risks.find((r: any) => r.Risk.includes('gfm'))?.Mitigation,
      equals: 'pin in spike S6',
    },
    {
      label: 'decision.components.rowPos(0).line — source line of the first components row',
      get: (doc) => (doc.body as any).decision.components.rowPos(0).line,
      equals: 5,
    },
  ],
}

export default c06
