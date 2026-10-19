import { z } from 'zod'
import { contract, list, section, sections } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// Typed list-item read-back: a `list({ everyItem })` whose items TRANSFORM their source text into a
// typed `{ ref, text }` value, so each item reads back as that structure. Mirrors the typed-cell
// slice on the list plane. Skipped until flips `list-typed`; the read-back accessors here
// (typed `.items`) land with that component, so they are navigated through `(doc.body as any)`.
//
// `peerless`: v1 YAML has no way to express a Zod `.transform()`, so there is no `.contract.yaml`
// twin for this fixture (see tests/yaml-parity.test.ts).

/** `AC-1: do the thing` → { ref: "AC-1", text: "do the thing" }. */
const criterion = z.string().transform((raw) => {
  const [ref = '', ...rest] = raw.split(':')
  return { ref: ref.trim(), text: rest.join(':').trim() }
})

const c13: ConsumptionFixture = {
  id: 'c13',
  title: 'Typed list items via a transforming everyItem',
  component: 'list-typed',
  path: 'docs/task.md',
  source: loadSource(import.meta.url, './13-typed-list-items.md'),
  peerless: true,
  build: () =>
    contract({
      body: sections({}, [
        section('Acceptance criteria', {
          content: list({ everyItem: criterion, minItems: 1 }),
        }),
      ]),
    }),
  reads: [
    {
      label: "items[0] === { ref: 'AC-1', text: 'scaffold the gated fixtures' }",
      get: (doc) => (doc.body as any).acceptanceCriteria.lists[0].items[0],
      equals: { ref: 'AC-1', text: 'scaffold the gated fixtures' },
    },
    {
      label: "items[1].ref === 'AC-2' — the typed item carries the parsed ref",
      get: (doc) => (doc.body as any).acceptanceCriteria.lists[0].items[1].ref,
      equals: 'AC-2',
    },
    {
      label: "items[2].text === 'keep the goldens unchanged' — the parsed remainder",
      get: (doc) => (doc.body as any).acceptanceCriteria.lists[0].items[2].text,
      equals: 'keep the goldens unchanged',
    },
  ],
}

export default c13
