import { expect, test } from 'vitest'

import { createLinkResolver, createVaultIndex } from '@osdlc/markdown-vault'

test('createLinkResolver resolves a target the way the scanner resolves a body link', () => {
  // #region resolver
  const vault = createVaultIndex([
    { path: 'Plan.md' },
    { path: 'projects/Plan.md' },
    { path: 'projects/Notes/Ideas.md' },
    { path: 'logo.png' },
  ])
  const resolve = createLinkResolver(vault)

  // An exact path wins, then the shortest path among files of the same name.
  expect(resolve('projects/Plan')?.file.path).toBe('projects/Plan.md')
  expect(resolve('plan')?.file.path).toBe('Plan.md')
  // An extension names that file, and a relative target reads from the note it is in.
  expect(resolve('logo.png')?.file.path).toBe('logo.png')
  const from = vault.byPath.get('projects/Plan.md')
  expect(resolve('./Notes/Ideas', from)?.file.path).toBe('projects/Notes/Ideas.md')
  expect(resolve('Missing')).toBeNull()
  // #endregion resolver
})
