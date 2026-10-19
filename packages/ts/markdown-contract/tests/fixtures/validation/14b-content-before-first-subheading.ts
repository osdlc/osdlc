import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Projection edge: pre-subheading blocks attach to the parent SectionNode.blocks;
// the children grammar resolves the H3s independently.
const v14b: ValidationFixture = {
  id: 'v14b',
  title: 'Content before the first sub-heading',
  component: 'validate',
  path: 'docs/.../README.md',
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Decision', {
          children: sections({ order: 'strict', allowUnknown: true }, [
            section('Components', {
              content: table({ columns: ['#', 'Component', 'Resolution'], minRows: 1 }),
            }),
          ]),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — lead paragraph and table sit in Decision.blocks; child grammar still matches',
      source: loadCorpusSource('./14b-content-before-first-subheading.pass.md'),
      findings: loadExpected('./14b-content-before-first-subheading.pass.expected.json'),
    },
    {
      // The required ### Components child is absent and has no heading of its own, so the
      // section-missing finding carries no pos — line not pinned.
      label: 'fail — ### Components heading dropped; required subsection absent',
      source: loadCorpusSource('./14b-content-before-first-subheading.fail.md'),
      findings: loadExpected('./14b-content-before-first-subheading.fail.expected.json'),
    },
  ],
}

export default v14b
