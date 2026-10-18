import { contract, rule, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The localization half: the same node rule fires, carrying node.pos and its own
// chosen level (warn) — a custom finding positioned like a built-in.
const v17a: ValidationFixture = {
  id: 'v17a',
  title: 'Node rule violation localizes to the node',
  component: 'validate',
  path: 'docs/.../README.md',
  build: () =>
    contract({
      body: sections({}, [
        section('Summary', {
          rules: [
            rule('summary/names-contract', (node, ctx) =>
              node.blocks.some((b) => b.kind === 'paragraph' && b.text.includes('contract'))
                ? []
                : [
                    ctx.finding({
                      id: 'summary/names-contract',
                      level: 'warn',
                      pos: node.pos,
                      message: 'Summary should name the contract it introduces',
                    }),
                  ],
            ),
          ],
        }),
      ]),
    }),
  cases: [
    {
      label: "pass — prose contains 'contract'",
      source: loadCorpusSource('./17a-node-rule-violation-with-pos.pass.md'),
      findings: loadExpected('./17a-node-rule-violation-with-pos.pass.expected.json'),
    },
    {
      label: "fail — prose omits 'contract'; rule fires at warn level",
      source: loadCorpusSource('./17a-node-rule-violation-with-pos.fail.md'),
      findings: loadExpected('./17a-node-rule-violation-with-pos.fail.expected.json'),
    },
  ],
}

export default v17a
