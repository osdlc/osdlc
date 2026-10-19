import type { SectionNode } from '../../../src/index.js'
import { contract, rule, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// section({ rules: [rule(id, fn(node, ctx))] }) — a node-local custom rule: the
// Summary section must mention the token "outcome".
const v17: ValidationFixture = {
  id: 'v17',
  title: 'Node-level custom rule',
  component: 'validate',
  path: 'docs/.../doc.md',
  build: () => {
    const sectionText = (node: SectionNode): string =>
      node.blocks
        .filter((b) => b.kind === 'paragraph')
        .map((b) => (b.kind === 'paragraph' ? b.text : ''))
        .join(' ')
        .toLowerCase()

    return contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Summary', {
          rules: [
            rule('summary/mentions-outcome', (node, ctx) =>
              sectionText(node).includes('outcome')
                ? []
                : [
                    ctx.finding({
                      id: 'summary/mentions-outcome',
                      level: 'error',
                      message: 'Summary must mention the decision outcome',
                      pos: node.pos,
                    }),
                  ],
            ),
          ],
        }),
      ]),
    })
  },
  cases: [
    {
      label: "pass — Summary prose contains 'outcome'",
      source: loadCorpusSource('./17-node-level-custom-rule.pass.md'),
      findings: loadExpected('./17-node-level-custom-rule.pass.expected.json'),
    },
    {
      label: "fail — Summary never says 'outcome'; rule fires at the heading",
      source: loadCorpusSource('./17-node-level-custom-rule.fail.md'),
      findings: loadExpected('./17-node-level-custom-rule.fail.expected.json'),
    },
  ],
}

export default v17
