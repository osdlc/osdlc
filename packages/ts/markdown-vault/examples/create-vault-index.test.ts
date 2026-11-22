import { expect, test } from 'vitest'

import {
  createVaultIndex,
  type CreateVaultIndexOptions,
  type ExternalNote,
} from '@osdlc/markdown-vault'

test('createVaultIndex builds the model from note data, with no file access', () => {
  // #region from-data
  const notes: ExternalNote[] = [
    { path: 'Plan.md', tags: ['#project'], links: ['Ideas'], mtimeMs: 1_700_000_000_000 },
    { path: 'notes/Ideas.md', frontmatter: { status: 'open' }, aliases: ['Brainstorm'] },
  ]
  const options: CreateVaultIndexOptions = { resolveLinks: true }
  const vault = createVaultIndex(notes, options)

  expect(vault.root).toBe('')
  expect(vault.byPath.get('Plan.md')!.tags).toEqual(['project'])
  expect(vault.byPath.get('Plan.md')!.links[0]!.path).toBe('notes/Ideas.md')
  expect(vault.byPath.get('notes/Ideas.md')!.backlinks).toEqual(['Plan.md'])
  expect(vault.byPath.get('notes/Ideas.md')!.properties).toEqual({
    status: 'open',
    aliases: ['Brainstorm'],
  })
  // #endregion from-data
})

test('createVaultIndex leaves links unresolved by default', () => {
  const vault = createVaultIndex([{ path: 'A.md', links: ['B'] }, { path: 'B.md' }])

  expect(vault.byPath.get('A.md')!.links).toEqual([{ target: 'B', path: null, display: null }])
  expect(vault.byPath.get('B.md')!.backlinks).toEqual([])
})
