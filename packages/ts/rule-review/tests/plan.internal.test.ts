/**
 * The scope matcher that `planJobs` and the check runner share.
 */
import { expect, test } from 'vitest'

// Internal: the matcher `planJobs` and the check runner share.
import { selectByScope, type ScopeEntry, type ScopeSelection } from '../src/select.ts'

const changed = ['src/a.ts', 'src/b.ts', 'README.md']

test('selectByScope is the matcher planning is built on', () => {
  const entries: ScopeEntry[] = [
    { id: 'ts', patterns: ['**/*.ts'] },
    { id: 'md', patterns: ['**/*.md'] },
  ]
  // exclude removes files from the changeset before matching.
  const selection: ScopeSelection = selectByScope(entries, changed, ['**/b.ts'])

  expect(selection.covered.get('ts')).toEqual(['src/a.ts'])
  expect(selection.covered.get('md')).toEqual(['README.md'])
  expect(selection.unmatched).toEqual([])
})
