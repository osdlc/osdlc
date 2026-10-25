import { contract, docRule, extractVaultRefs, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Referential integrity, in-document arm: a docRule that pairs
// `extractVaultRefs` (the wikilink recognizer) with `doc.byAnchor` (the doc-wide
// `^anchor` index) to flag a `[[#^anchor]]` fragment whose target block does not exist IN THE
// SAME DOCUMENT. Both primitives already ship; this fixture documents the composition and
// guards it from regression.
//
// The engine strips a block's trailing `^id` token during projection and binds it so
// `byAnchor("id")` resolves, while the `[[#^id]]` wikilink survives flattening as text — so
// `extractVaultRefs` sees the reference and `byAnchor` sees (or misses) its target. The finding
// is emitted with NO `pos` (a whole-document referential check), so in a run it is stamped with
// the document path and asserted on id + level only — matching the 16 / 16a docRule precedent.
//
// `peerless: true`: an arbitrary docRule has no declarative `.contract.yaml` twin, so this opts
// out of the yaml-parity "peers exist" check (see v22–v25 and `tests/yaml-parity.test.ts`).
const v26: ValidationFixture = {
  id: 'v26',
  title: 'In-doc dead anchor — a `#^anchor` fragment that resolves nowhere',
  component: 'validate',
  peerless: true,
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [section('Refs')]),
      rules: [
        docRule('dialect/in-doc-anchor-resolves', (doc, ctx) => {
          const body = doc.body as {
            section(name: string): { text(scope: 'all'): string } | undefined
            unknown: { text(scope: 'all'): string }[]
          }
          // Concat every section's flattened subtree text — the `[[#^anchor]]` token survives.
          const declared = body.section('Refs')?.text('all') ?? ''
          const text = [declared, ...body.unknown.map((s) => s.text('all'))].join('\n')

          return extractVaultRefs(text).flatMap((ref) => {
            const fragment = ref.fragment
            if (fragment === undefined || !fragment.startsWith('^')) return []
            const id = fragment.slice(1) // strip the leading `^` → bare anchor id
            return doc.byAnchor(id) === undefined // resolves nowhere in this document
              ? [
                  ctx.finding({
                    id: 'dialect/in-doc-anchor-resolves',
                    message: `wikilink fragment "#^${id}" resolves to no ^${id} anchor in this document`,
                  }),
                ]
              : []
          })
        }),
      ],
    }),
  cases: [
    {
      label: 'pass — [[#^target]] paired with a block carrying ^target; resolves in-doc',
      source: loadCorpusSource('./26-in-doc-dead-anchor.pass.md'),
      findings: loadExpected('./26-in-doc-dead-anchor.pass.expected.json'),
    },
    {
      label: 'fail — [[#^ghost]] with no ^ghost anchor anywhere; the dead-anchor rule fires',
      source: loadCorpusSource('./26-in-doc-dead-anchor.fail.md'),
      findings: loadExpected('./26-in-doc-dead-anchor.fail.expected.json'),
    },
  ],
}

export default v26
