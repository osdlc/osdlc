import { contract, section, sections, textRule } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The body root's `forbids:` is a document rule, so its findings take the contract's
// description as hint, not the body's.
const v38: ValidationFixture = {
  id: 'v38',
  title: "A body-root text rule takes the contract's description as hint",
  component: 'text-api',
  path: 'skills/page.md',
  build: () =>
    contract({
      description: 'A skill page.',
      body: sections({ order: 'none', allowUnknown: true, description: 'The skill sections.' }, [
        section('Summary'),
      ]),
      rules: [textRule({ forbids: [{ pattern: 'TBD' }] })],
    }),
  cases: [
    {
      label: 'pass — no TBD',
      source: loadCorpusSource('./38-body-text-rule-hint.pass.md'),
      findings: loadExpected('./38-body-text-rule-hint.pass.expected.json'),
    },
    {
      label: 'fail — TBD in the Summary',
      source: loadCorpusSource('./38-body-text-rule-hint.fail.md'),
      findings: loadExpected('./38-body-text-rule-hint.fail.expected.json'),
    },
  ],
}

export default v38
