import { z } from 'zod'
import { contract } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// contract({ frontmatter: ZodType }) — the frontmatter plane alone, strict Zod
// object, free body. Gaps & questions: None; the enum finding localizes to the
// offending status: line (3).
const v07: ValidationFixture = {
  id: 'v07',
  title: 'Frontmatter only (Zod)',
  component: 'content',
  path: 'docs/.../README.md',
  build: () =>
    contract({
      frontmatter: z.strictObject({
        id: z.string().regex(/^D-[0-9A-Z]{4}$/),
        status: z.enum(['open/proposed', 'open/accepted', 'closed/superseded']),
        title: z.string().min(1),
      }),
    }),
  cases: [
    {
      label: 'pass — well-formed frontmatter, no stray keys',
      source: loadCorpusSource('./07-frontmatter-only-zod.pass.md'),
      findings: loadExpected('./07-frontmatter-only-zod.pass.expected.json'),
    },
    {
      label: 'fail — status outside the enum',
      source: loadCorpusSource('./07-frontmatter-only-zod.fail.md'),
      findings: loadExpected('./07-frontmatter-only-zod.fail.expected.json'),
    },
  ],
}

export default v07
