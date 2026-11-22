import { createVaultIndex } from '@osdlc/markdown-vault'
import { expect, test } from 'vitest'

import { parseBase, queryExpression, runView } from '@osdlc/markdown-vault-query'

// The vault is built from data here. `scanVault` from `@osdlc/markdown-vault` builds the same
// index from a folder.
const vault = createVaultIndex([
  { path: 'tasks/write-docs.md', frontmatter: { status: 'open', due: '2026-03-01' } },
  { path: 'tasks/ship-it.md', frontmatter: { status: 'open', due: '2026-01-15' } },
  { path: 'tasks/fix-lexer.md', frontmatter: { status: 'done', due: '2026-02-01' } },
])

test('README quick start: run a view of a base file', () => {
  const base = parseBase(`
filters: file.inFolder("tasks")
views:
  - type: table
    name: Open tasks
    filters: status == "open"
    order: [file.name, due]
    sort:
      - property: due
        direction: ASC
`)
  const { rows, total } = runView(vault, base, 'Open tasks')

  expect(total).toBe(2)
  expect(rows.map((row) => row.note.file.name)).toEqual(['ship-it.md', 'write-docs.md'])
})

test('README quick start: filter with a bare expression', () => {
  const done = queryExpression(vault, 'status == "done"')

  expect(done.map((note) => note.file.path)).toEqual(['tasks/fix-lexer.md'])
})
