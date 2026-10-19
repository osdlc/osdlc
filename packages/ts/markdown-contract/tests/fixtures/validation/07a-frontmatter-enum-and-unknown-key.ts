import { z } from 'zod'
import { contract } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Two frontmatter failures at once: an enum violation and a strict unknown-key
// rejection, each remapped to its source line. frontmatter/enum is documented
// (pinned to line 3); frontmatter/unknown-key is invented and its per-key line
// depends on the unresolved S7 remap, so only its id is pinned.
const v07a: ValidationFixture = {
  id: 'v07a',
  title: 'Frontmatter enum violation + extra key',
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
      label: 'pass — valid status, no stray keys',
      source: loadCorpusSource('./07a-frontmatter-enum-and-unknown-key.pass.md'),
      findings: loadExpected('./07a-frontmatter-enum-and-unknown-key.pass.expected.json'),
    },
    {
      label: 'fail — bad enum value plus an undeclared foo key',
      source: loadCorpusSource('./07a-frontmatter-enum-and-unknown-key.fail.md'),
      findings: loadExpected('./07a-frontmatter-enum-and-unknown-key.fail.expected.json'),
    },
  ],
}

export default v07a
