import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  scanVault,
  type FileMeta,
  type LinkRef,
  type ScanOptions,
  type VaultIndex,
  type VaultNote,
} from '@osdlc/markdown-vault'

/** Write `files` (vault-relative path to content) into a fresh folder and return it. */
async function makeVault(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'markdown-vault-example-'))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return root
}

test('scanVault returns each note with its tags, links and backlinks', async () => {
  const root = await makeVault({
    'Plan.md': '---\ntags: [project]\n---\nSee [[Ideas]] and ![[diagram.png]] #todo\n',
    'notes/Ideas.md': 'Back to [[Plan|the plan]]\n',
    'notes/diagram.png': 'not really a png',
  })
  try {
    // #region scan
    const vault: VaultIndex = await scanVault(root)
    const plan: VaultNote = vault.byPath.get('Plan.md')!

    const file: FileMeta = plan.file
    expect(file.basename).toBe('Plan')
    expect(file.folder).toBe('')
    expect(plan.properties).toEqual({ tags: ['project'] })
    expect(plan.tags).toEqual(['project', 'todo'])

    const link: LinkRef = plan.links[0]!
    expect(link).toEqual({ target: 'Ideas', path: 'notes/Ideas.md', display: null })
    expect(plan.embeds[0]!.path).toBe('notes/diagram.png')
    expect(vault.byPath.get('notes/Ideas.md')!.backlinks).toEqual(['Plan.md'])
    // #endregion scan
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ScanOptions: includeNonMarkdown and tagDialect', async () => {
  const root = await makeVault({ 'A.md': '#2024 #draft\n', 'pic.png': 'x' })
  try {
    // #region options
    const options: ScanOptions = { includeNonMarkdown: false, tagDialect: 'unicode' }
    const vault = await scanVault(root, options)

    expect(vault.notes.map((note) => note.file.path)).toEqual(['A.md'])
    expect(vault.byPath.get('A.md')!.tags).toEqual(['2024', 'draft'])
    // #endregion options
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
