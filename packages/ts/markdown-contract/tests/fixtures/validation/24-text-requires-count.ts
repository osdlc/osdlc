import { contract, requires, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// occurrence count on a `requires` entry: a phrase must appear at least `min`
// times in the bound scope. Here every checklist step must be marked `DONE` — the section
// requires the `DONE` marker at least twice. A below-`min` document is a count violation,
// reported under the `text/count` area (distinct from a plain presence `text/requires` miss).
//
// Greened by (the matcher + builders are live). The expected finding id is the
// synthesized per-entry id `text/count/checklist/<patternHash>` (a `min`/`max` violation keeps
// the `count` finding kind); the count violation pins at the section heading (line 1). Note the
// `DONE` markers live in list items — the section scope text includes every block, not just prose.
const v24: ValidationFixture = {
  id: 'v24',
  title: 'Occurrence count — phrase must appear at least min times',
  component: 'text-api',
  path: 'docs/checklist.md',
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Checklist', {
          rules: [requires([{ pattern: 'DONE', min: 2, note: 'every step must be marked DONE' }])],
        }),
      ]),
    }),
  cases: [
    {
      label: "pass — 'DONE' appears twice, meeting the minimum",
      source: loadCorpusSource('./24-text-requires-count.pass.md'),
      findings: loadExpected('./24-text-requires-count.pass.expected.json'),
    },
    {
      label: "fail — 'DONE' appears once, below min:2; the count fires at the heading",
      source: loadCorpusSource('./24-text-requires-count.fail.md'),
      findings: loadExpected('./24-text-requires-count.fail.expected.json'),
    },
  ],
  note: 'Synthesized id `text/count/checklist/<hash>`; a below-min count pins at the heading.',
}

export default v24
