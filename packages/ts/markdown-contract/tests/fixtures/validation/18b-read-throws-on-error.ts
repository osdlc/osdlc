import { z } from 'zod'
import { contract, maxWords, optional, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The two-door contrast: read() throws on error-level findings, validate() never does.
// Encoded here as the validate() findings stream (read()'s throw is a consumption test).
const v18b: ValidationFixture = {
  id: 'v18b',
  title: 'read() throws on error-level findings',
  component: 'consumption',
  path: 'fixture.md',
  build: () => {
    const DecisionFrontmatter = z
      .object({
        id: z.string().regex(/^D-[0-9A-Z]{4}$/),
        status: z.enum(['open/proposed', 'open/accepted', 'closed/superseded']),
        title: z.string().min(1),
        related: z.array(z.string()).default([]),
      })
      .strict()

    return contract({
      frontmatter: DecisionFrontmatter,
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Summary', { anchor: 'summary', content: maxWords(120) }),
        section('Context'),
        section('Decision'),
        optional(section('Notes')),
      ]),
    })
  },
  cases: [
    {
      label: 'pass — Decision section present; both doors agree',
      source: loadCorpusSource('./18b-read-throws-on-error.pass.md'),
      findings: loadExpected('./18b-read-throws-on-error.pass.expected.json'),
    },
    {
      label: 'fail — Decision section absent; read() throws, validate() reports',
      source: loadCorpusSource('./18b-read-throws-on-error.fail.md'),
      findings: loadExpected('./18b-read-throws-on-error.fail.expected.json'),
    },
  ],
}

export default v18b
