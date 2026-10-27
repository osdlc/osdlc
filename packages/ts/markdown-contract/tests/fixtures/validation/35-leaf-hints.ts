import { z } from 'zod'
import type { LeafSpec } from '../../../src/index.js'
import { contract, list, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// A cell or item finding takes the leaf's description, else the section's. A description on
// the cell's own schema is not used.
const described = (leaf: LeafSpec, description: string): LeafSpec => {
  // As the YAML loader attaches a leaf's `description:`.
  ;(leaf.config as Record<string, unknown>).description = description
  return leaf
}

const v35: ValidationFixture = {
  id: 'v35',
  title: 'Cell and item findings take the leaf description, else the section one',
  component: 'content',
  path: 'tasks/change.md',
  build: () =>
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Files', {
          description: 'The files this change touches.',
          content: described(
            table({
              columns: ['File', 'Kind'],
              cells: { Kind: z.enum(['add', 'modify', 'delete']).describe('The kind of change.') },
            }),
            'One row per file.',
          ),
        }),
        section('Owners', {
          description: 'Who reviews the change.',
          content: table({ columns: ['Name'], cells: { Name: z.string().min(3) } }),
        }),
        section('Steps', {
          content: described(list({ everyItem: z.string().min(5) }), 'One step per item.'),
        }),
      ]),
    }),
  cases: [
    {
      label: 'pass — every cell and item is valid',
      source: loadCorpusSource('./35-leaf-hints.pass.md'),
      findings: loadExpected('./35-leaf-hints.pass.expected.json'),
    },
    {
      label: 'fail — a bad Kind, a short Name and a short step, each with its hint',
      source: loadCorpusSource('./35-leaf-hints.fail.md'),
      findings: loadExpected('./35-leaf-hints.fail.expected.json'),
    },
  ],
}

export default v35
