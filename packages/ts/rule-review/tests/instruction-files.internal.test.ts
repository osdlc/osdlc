/**
 * The default lister behind `instructionFiles`: git's tracked and untracked
 * instruction files, matched by exact name.
 */
import { expect, test } from 'vitest'

// Internal: the default lister.
import { gitFileLister } from '../src/providers/instruction-files.ts'
import { makeRepo, writeFile as write } from './fixture-repo.ts'

test('gitFileLister lists tracked and untracked instruction files', async () => {
  const { root } = makeRepo({ 'CLAUDE.md': 'r\n', 'src/AGENTS.md': 'a\n', 'src/a.ts': 'x\n' })
  write(root, 'docs/CLAUDE.md', 'new\n') // untracked, so not yet in git

  expect([...(await gitFileLister(root))].sort()).toEqual([
    'CLAUDE.md',
    'docs/CLAUDE.md',
    'src/AGENTS.md',
  ])
})

test('gitFileLister skips a tracked file whose name only ends in CLAUDE.md or AGENTS.md', async () => {
  const { root } = makeRepo({
    'CLAUDE.md': 'r\n',
    'docs/AGENTS.md': 'a\n',
    'docs/SUBAGENTS.md': 'a design note\n',
    'NOTES-CLAUDE.md': 'a note\n',
  })

  expect([...(await gitFileLister(root))].sort()).toEqual(['CLAUDE.md', 'docs/AGENTS.md'])
})
