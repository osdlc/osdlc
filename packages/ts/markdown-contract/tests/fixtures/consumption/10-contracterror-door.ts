import { z } from 'zod'
import { contract, maxWords, optional, section, sections } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// read() is the model-only door: on an error-level finding it throws ContractError (not undefined).
// Reuses validation v18b's DecisionContract + its FAIL document (required ## Decision absent), which
// yields one error-level structure/section-missing finding — so read() throws.
const c10: ConsumptionFixture = {
  id: 'c10',
  title: 'The ContractError door',
  component: 'consumption',
  path: 'docs/decision.md',
  source: loadSource(import.meta.url, './10-contracterror-door.md'),
  build: () =>
    contract({
      frontmatter: z
        .object({
          id: z.string().regex(/^D-[0-9A-Z]{4}$/),
          status: z.enum(['open/proposed', 'open/accepted', 'closed/superseded']),
          title: z.string().min(1),
          related: z.array(z.string()).default([]),
        })
        .strict(),
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Summary', { anchor: 'summary', content: maxWords(120) }),
        section('Context'),
        section('Decision'), // required — absent in this FAIL doc ⇒ read() throws
        optional(section('Notes')),
      ]),
    }),
  throws: 'ContractError',
}

export default c10
