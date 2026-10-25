import { z } from 'zod'
import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Frontmatter that is not valid YAML gives one frontmatter/yaml at the line of the error, and
// the schema does not run, so the required title is not also reported. The three errors are
// ones both engines place on the same line: an unclosed quote, a tab used as indentation, and
// a repeated key (at the repeat).
const v31: ValidationFixture = {
  id: 'v31',
  title: 'Invalid frontmatter YAML is frontmatter/yaml at the error line',
  component: 'content',
  path: 'notes/release.md',
  build: () =>
    contract({
      description: 'A note with a title.',
      frontmatter: z.object({ title: z.string() }),
      body: sections({ order: 'none', allowUnknown: true }, [section('Notes')]),
    }),
  cases: [
    {
      label: 'pass — valid frontmatter with a title',
      source: loadCorpusSource('./31-frontmatter-yaml-error.pass.md'),
      findings: loadExpected('./31-frontmatter-yaml-error.pass.expected.json'),
    },
    {
      label: 'fail — an unclosed quote',
      source: loadCorpusSource('./31-frontmatter-yaml-error.fail-quote.md'),
      findings: loadExpected('./31-frontmatter-yaml-error.fail-quote.expected.json'),
    },
    {
      label: 'fail — a tab used as indentation',
      source: loadCorpusSource('./31-frontmatter-yaml-error.fail-tab.md'),
      findings: loadExpected('./31-frontmatter-yaml-error.fail-tab.expected.json'),
    },
    {
      label: 'fail — a repeated key, reported at the repeat',
      source: loadCorpusSource('./31-frontmatter-yaml-error.fail-duplicate.md'),
      findings: loadExpected('./31-frontmatter-yaml-error.fail-duplicate.expected.json'),
    },
  ],
}

export default v31
