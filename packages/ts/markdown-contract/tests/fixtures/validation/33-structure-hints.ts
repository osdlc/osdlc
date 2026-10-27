import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// Findings about a level, not one section (a duplicate, an alias pair, a key collision, the
// order), take the level's description as their hint, not a section's.
const v33: ValidationFixture = {
  id: 'v33',
  title: 'Level findings take the level description as hint',
  component: 'structure',
  path: 'notes/task.md',
  build: () =>
    contract({
      body: sections(
        {
          order: 'recognized-relative',
          allowUnknown: true,
          description: 'The standard note sections.',
        },
        [
          section('Context', { description: 'Why the note exists.' }),
          section(['Goal', 'Aim'], { description: 'What the work is for.' }),
          section('Files to touch', { description: 'One line per file.' }),
        ],
      ),
    }),
  cases: [
    {
      label: 'pass — each section once, in order',
      source: loadCorpusSource('./33-structure-hints.pass.md'),
      findings: loadExpected('./33-structure-hints.pass.expected.json'),
    },
    {
      label: 'fail — Context repeats',
      source: loadCorpusSource('./33-structure-hints.fail-duplicate.md'),
      findings: loadExpected('./33-structure-hints.fail-duplicate.expected.json'),
    },
    {
      label: 'fail — Goal and its alias Aim both appear',
      source: loadCorpusSource('./33-structure-hints.fail-alias.md'),
      findings: loadExpected('./33-structure-hints.fail-alias.expected.json'),
    },
    {
      label: 'fail — Files To Touch collides with Files to touch',
      source: loadCorpusSource('./33-structure-hints.fail-key-collision.md'),
      findings: loadExpected('./33-structure-hints.fail-key-collision.expected.json'),
    },
    {
      label: 'fail — Context comes after Goal',
      source: loadCorpusSource('./33-structure-hints.fail-order.md'),
      findings: loadExpected('./33-structure-hints.fail-order.expected.json'),
    },
  ],
}

export default v33
