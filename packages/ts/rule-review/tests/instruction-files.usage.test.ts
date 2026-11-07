/**
 * The built-in provider reads CLAUDE.md and AGENTS.md as scoped rule sources.
 * Each file governs its own directory and everything under it. `@path` imports
 * are inlined. Files outside the project root are never read.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  instructionFiles,
  INSTRUCTION_KIND,
  type DiscoveryContext,
  type FileLister,
  type InstructionFilesOptions,
} from '../src/index.ts'
// Internal: the default lister.
import { gitFileLister } from '../src/providers/instruction-files.ts'
import { makeRepo, writeFile as write } from './fixture-repo.ts'

test('instructionFiles mints one scoped source per instruction file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rule-review-instr-'))
  write(root, 'CLAUDE.md', 'Repo-wide rules.\n')
  write(root, 'src/CLAUDE.md', 'Rules for src.\n')

  // A custom lister instead of gitFileLister, so no git repo is needed. The
  // default `gitFileLister` asks git for the same paths.
  const list: FileLister = () => ['CLAUDE.md', 'src/CLAUDE.md']
  const options: InstructionFilesOptions = { list }
  const provider = instructionFiles(options)

  expect(provider.id).toBe('instruction-files')

  const ctx: DiscoveryContext = { projectRoot: root, changedFiles: ['src/a.ts'] }
  const sources = await provider.discover(ctx)

  expect(sources.map((s) => s.id)).toEqual(['instruction:CLAUDE.md', 'instruction:src/CLAUDE.md'])
  expect(sources[0]!.kind).toBe(INSTRUCTION_KIND)
  // The root file governs everything; the src file governs src/**.
  expect(sources[0]!.patterns).toEqual(['**'])
  expect(sources[1]!.patterns).toEqual(['src/**'])
  expect(sources[1]!.depth).toBe(1)
})

test('a CLAUDE.md @path import is inlined', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rule-review-instr-'))
  write(root, 'CLAUDE.md', 'See @./rules/base.md for the rules.\n')
  write(root, 'rules/base.md', 'The imported rule.\n')

  const provider = instructionFiles({ list: () => ['CLAUDE.md'] })
  const sources = await provider.discover({ projectRoot: root, changedFiles: [] })

  expect(sources[0]!.text).toContain('The imported rule.')
})

test('a file reached first through a deeper import is still expanded within the depth limit', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rule-review-instr-'))
  write(root, 'CLAUDE.md', '@x.md\n@y.md\n')
  write(root, 'x.md', '@y.md\n')
  write(root, 'y.md', '@z.md\n')
  write(root, 'z.md', 'Z RULE\n')

  // z.md is two imports from CLAUDE.md through y.md, so the default depth of 2 reaches it.
  const [source] = await instructionFiles({ list: () => ['CLAUDE.md'] }).discover({
    projectRoot: root,
    changedFiles: [],
  })

  expect(source!.text).toContain('Z RULE')
})

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
