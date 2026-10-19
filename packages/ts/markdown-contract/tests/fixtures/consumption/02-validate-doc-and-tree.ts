import { z } from 'zod'
import { contract, section, sections } from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// validate() → findings + doc + tree. Reuses validation v08's unified frontmatter + body contract,
// on a document that passes. The consumption harness reads through validate()'s `doc` (read()), so
// the findings/tree arm is exercised structurally via the typed model reads here.
const c02: ConsumptionFixture = {
  id: 'c02',
  title: 'validate() → findings + doc + tree',
  component: 'consumption',
  path: 'notes/note.md',
  source: loadSource(import.meta.url, './02-validate-doc-and-tree.md'),
  build: () =>
    contract({
      frontmatter: z
        .object({
          id: z.string().regex(/^D-[0-9A-Z]{4}$/),
          status: z.enum(['open/proposed', 'open/accepted', 'closed/superseded']),
          title: z.string().min(1),
        })
        .strict(),
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Summary'),
        section('Context'),
      ]),
    }),
  reads: [
    {
      label: 'doc.frontmatter.id — typed from the frontmatter Zod',
      get: (doc) => (doc.frontmatter as any).id,
      equals: 'D-0099',
    },
    {
      label: 'doc.body.overview... — typed SectionView read (Summary prose)',
      get: (doc) => (doc.body as any).summary.text(),
      equals:
        'Replace the bespoke body-schema scanners with a combinator grammar over a positioned section tree.',
    },
  ],
}

export default c02
