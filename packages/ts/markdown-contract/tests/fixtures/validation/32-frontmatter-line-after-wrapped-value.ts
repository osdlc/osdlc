import { z } from 'zod'
import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// A frontmatter finding is placed on its key's line even after a value that wraps onto a
// second line, and inside a mapping whose value carries a YAML anchor (`&o`).
const v32: ValidationFixture = {
  id: 'v32',
  title: 'Frontmatter lines after a wrapped value and an anchored mapping',
  component: 'content',
  path: 'notes/summary.md',
  build: () =>
    contract({
      frontmatter: z.object({
        summary: z.string().optional(),
        count: z.int().optional(),
        owner: z.object({ id: z.int().optional() }).optional(),
      }),
      body: sections({ order: 'none', allowUnknown: true }, [section('Notes')]),
    }),
  cases: [
    {
      label: 'pass — every value has its type',
      source: loadCorpusSource('./32-frontmatter-line-after-wrapped-value.pass.md'),
      findings: loadExpected('./32-frontmatter-line-after-wrapped-value.pass.expected.json'),
    },
    {
      label: 'fail — count and owner.id are words, each reported on its own line',
      source: loadCorpusSource('./32-frontmatter-line-after-wrapped-value.fail.md'),
      findings: loadExpected('./32-frontmatter-line-after-wrapped-value.fail.expected.json'),
    },
  ],
}

export default v32
