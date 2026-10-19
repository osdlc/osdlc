import { contract, requires, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// section-scoped `requires`: a phrase must be PRESENT in a section's subtree.
// `requires([{ pattern }])` attaches to the section's `rules` slot and compiles to a node-local
// rule over the section's text — the declarative twin of fixture 17's hand-written
// `summary/mentions-outcome` predicate ("the Summary section must mention the decision outcome").
//
// Greened by (the matcher + builders are live). The expected finding id is the
// synthesized per-entry id `text/requires/<scopeKey>/<patternHash>` (scopeKey = the section's
// generated camel key `summary`); the require miss pins at the section heading (line 1).
const v22: ValidationFixture = {
  id: 'v22',
  title: 'Section-scoped requires — phrase must be present',
  component: 'text-api',
  path: 'docs/decision.md',
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Summary', {
          rules: [requires([{ pattern: 'outcome', note: 'the decision outcome must be named' }])],
        }),
      ]),
    }),
  cases: [
    {
      label: "pass — Summary prose contains 'outcome'",
      source: loadCorpusSource('./22-text-requires-section.pass.md'),
      findings: loadExpected('./22-text-requires-section.pass.expected.json'),
    },
    {
      label: "fail — Summary never says 'outcome'; the require fires at the heading",
      source: loadCorpusSource('./22-text-requires-section.fail.md'),
      findings: loadExpected('./22-text-requires-section.fail.expected.json'),
    },
  ],
  note: 'Synthesized per-entry id `text/requires/summary/<hash>`; the miss pins at the heading.',
}

export default v22
