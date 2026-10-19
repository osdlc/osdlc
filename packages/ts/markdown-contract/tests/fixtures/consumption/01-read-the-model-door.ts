import { contract, section, sections } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// Contract.read() — the model-only door. Reuses validation v01's one-required-section contract.
const c01: ConsumptionFixture = {
  id: 'c01',
  title: 'The read() door',
  component: 'consumption',
  path: 'notes/overview.md',
  source: loadSource(import.meta.url, './01-read-the-model-door.md'),
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [section('Overview')]),
    }),
  reads: [
    {
      label: "doc.body.overview.name === 'Overview'",
      // body is typed `unknown` on the generic Doc; fixtures navigate the dual-key facade dynamically.
      get: (doc) => (doc.body as any).overview.name,
      equals: 'Overview',
    },
    {
      label: 'doc.body.overview.text() === the section prose',
      get: (doc) => (doc.body as any).overview.text(),
      equals: 'A one-paragraph summary of the thing.',
    },
  ],
}

export default c01
