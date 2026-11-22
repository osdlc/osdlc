import { test, vi } from 'vitest'
import assert from 'node:assert/strict'
import * as vaultModule from '@osdlc/markdown-vault'
import { createVaultIndex } from '@osdlc/markdown-vault'
import { resolveNote } from '../../src/expr/eval.ts'
import { queryExpression } from '../../src/query.ts'

// eval.ts imports the scanner's resolver from this specifier, which this
// package declares; the spy counts how often a resolver gets built.
vi.mock('@osdlc/markdown-vault', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@osdlc/markdown-vault')>()
  return { ...actual, createLinkResolver: vi.fn(actual.createLinkResolver) }
})

const createLinkResolver = vi.mocked(vaultModule.createLinkResolver)

test('one query run builds one link resolver for all its lookups', () => {
  const vault = createVaultIndex(
    [
      { path: 'sub/Target.md' },
      ...Array.from({ length: 20 }, (_, i) => ({
        path: `n${i}.md`,
        frontmatter: { up: '[[Target]]' },
        links: ['Target'],
      })),
    ],
    { resolveLinks: true },
  )
  createLinkResolver.mockClear()
  const matched = queryExpression(vault, 'up.asFile() == file("Target") && file.hasLink("Target")')
  assert.equal(matched.length, 20)
  assert.equal(createLinkResolver.mock.calls.length, 1)
  // The next run builds its own, so it sees the index as it is then.
  queryExpression(vault, 'file.hasLink("Target")')
  assert.equal(createLinkResolver.mock.calls.length, 2)
})

test('a lookup sees a note added to the vault after an earlier lookup', () => {
  const vault = createVaultIndex([{ path: 'a.md' }], { resolveLinks: true })
  assert.equal(resolveNote(vault, 'Later'), null)
  const later = createVaultIndex([{ path: 'deep/Later.md' }]).notes[0]!
  vault.notes.push(later)
  vault.byPath.set(later.file.path, later)
  assert.equal(resolveNote(vault, 'Later')?.file.path, 'deep/Later.md')
})

test('a note renamed in place is found under its new name on the next lookup', () => {
  const vault = createVaultIndex([{ path: 'a/Old.md' }, { path: 'b.md' }], { resolveLinks: true })
  assert.equal(resolveNote(vault, 'Old')?.file.path, 'a/Old.md')
  // Same array, same length: only the entry and the path map change.
  const renamed = createVaultIndex([{ path: 'a/New.md' }]).notes[0]!
  vault.byPath.delete('a/Old.md')
  vault.notes[0] = renamed
  vault.byPath.set(renamed.file.path, renamed)
  assert.equal(resolveNote(vault, 'Old'), null)
  assert.equal(resolveNote(vault, 'New')?.file.path, 'a/New.md')
})
