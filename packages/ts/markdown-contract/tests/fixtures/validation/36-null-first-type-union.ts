import { z } from 'zod'
import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// `type: ['null', string]` is the same null union as `[string, 'null']`.
const v36: ValidationFixture = {
  id: 'v36',
  title: 'A null union may list null first',
  component: 'content',
  path: 'decisions/old.md',
  build: () =>
    contract({
      frontmatter: z.object({ supersededBy: z.string().nullable() }),
      body: sections({ order: 'none', allowUnknown: true }, [section('Notes')]),
    }),
  cases: [
    {
      label: 'pass — null is allowed',
      source: loadCorpusSource('./36-null-first-type-union.pass.md'),
      findings: loadExpected('./36-null-first-type-union.pass.expected.json'),
    },
    {
      label: 'fail — a number is neither null nor a string',
      source: loadCorpusSource('./36-null-first-type-union.fail.md'),
      findings: loadExpected('./36-null-first-type-union.fail.expected.json'),
    },
  ],
}

export default v36
