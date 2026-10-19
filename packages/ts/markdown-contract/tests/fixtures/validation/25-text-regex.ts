import { contract, requires, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// `regex` match spec: a single regex entry expresses an OR-of-literals (the
// v1 disjunction escape). The `Failure modes` section must document at least one lease failure
// marker — `LEASE-CONFLICT ref=` or `LEASE-MISSING ref=` — captured as one alternation. A
// regex miss reports like a `requires` miss, at the section heading.
//
// Greened by (the matcher + builders are live). The expected finding id is the
// synthesized per-entry id `text/requires/<scopeKey>/<patternHash>` (scopeKey = the section's
// generated camel key `failureModes`); a regex miss reports like a `requires` miss, at the heading.
const v25: ValidationFixture = {
  id: 'v25',
  title: 'Regex requires — one alternation entry expresses OR-of-literals',
  component: 'text-api',
  path: 'docs/skill.md',
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Failure modes', {
          rules: [
            requires([{ regex: 'LEASE-(CONFLICT|MISSING) ref=', note: 'lease failure markers' }]),
          ],
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — a LEASE-CONFLICT marker matches the alternation',
      source: loadCorpusSource('./25-text-regex.pass.md'),
      findings: loadExpected('./25-text-regex.pass.expected.json'),
    },
    {
      label: 'fail — no lease marker present; the regex require fires at the heading',
      source: loadCorpusSource('./25-text-regex.fail.md'),
      findings: loadExpected('./25-text-regex.fail.expected.json'),
    },
  ],
  note: 'Synthesized id `text/requires/failureModes/<hash>`; a regex miss pins at the heading.',
}

export default v25
