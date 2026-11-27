import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createVaultIndex, type VaultIndex } from '@osdlc/markdown-vault'
import { parseExpression } from '../../src/expr/parser.ts'
import { evaluate, resolveNote, runLinkResolver, type EvalContext } from '../../src/expr/eval.ts'
import { FileValue, LinkValue, type Value } from '../../src/expr/values.ts'

// Expression-side link resolution (frontmatter links, link(), file(), asFile,
// hasLink, linksTo) has to agree with the scanner, which resolved every
// `note.links` path these values get compared against.

function vaultOf(...notes: Parameters<typeof createVaultIndex>[0]): VaultIndex {
  return createVaultIndex(notes, { resolveLinks: true })
}

function evalAt(vault: VaultIndex, path: string, expression: string): Value {
  const note = vault.byPath.get(path)
  assert.ok(note, `${path} is in the vault`)
  const ctx: EvalContext = { note, vault, formulas: {} }
  return evaluate(parseExpression(expression), ctx)
}

const pathOf = (v: Value): string | null => (v instanceof FileValue ? v.note.file.path : null)

test('resolveNote follows the scanner: segment boundaries, extensions, heading subpaths', () => {
  const vault = vaultOf(
    { path: 'Project.md' },
    { path: 'attachments/cover.png' },
    { path: 'aab/note.md' },
    { path: 'x/b/note.md' },
    {
      path: 'Src.md',
      frontmatter: {
        related: '[[Project#Tasks]]',
        cover: '[[cover.png]]',
        parent: '[[b/note]]',
      },
      links: ['Project', 'b/note'],
      embeds: ['cover.png'],
    },
  )
  // What the scanner resolved the body links to.
  const src = vault.byPath.get('Src.md')!
  assert.deepEqual(
    src.links.map((l) => l.path),
    ['Project.md', 'x/b/note.md'],
  )
  assert.equal(src.embeds[0]?.path, 'attachments/cover.png')

  assert.equal(resolveNote(vault, 'b/note')?.file.path, 'x/b/note.md')
  assert.equal(resolveNote(vault, 'cover.png')?.file.path, 'attachments/cover.png')
  assert.equal(resolveNote(vault, 'Project#Tasks')?.file.path, 'Project.md')

  assert.equal(pathOf(evalAt(vault, 'Src.md', 'related.asFile()')), 'Project.md')
  assert.equal(pathOf(evalAt(vault, 'Src.md', 'cover.asFile()')), 'attachments/cover.png')
  assert.equal(pathOf(evalAt(vault, 'Src.md', 'parent.asFile()')), 'x/b/note.md')
  assert.equal(pathOf(evalAt(vault, 'Src.md', 'file("cover.png")')), 'attachments/cover.png')
  assert.equal(evalAt(vault, 'Src.md', 'file.hasLink(related)'), true)
  assert.equal(evalAt(vault, 'Src.md', 'file.hasLink(parent)'), true)
  assert.equal(evalAt(vault, 'Src.md', 'file.hasLink("b/note")'), true)
  assert.equal(evalAt(vault, 'Src.md', 'file.hasLink(file("cover.png"))'), true)
  assert.equal(evalAt(vault, 'Src.md', 'file.links[0] == related'), true)
})

test('a heading subpath takes no part in resolution, as the scanner drops it', () => {
  const vault = vaultOf(
    { path: 'notes/Target.md' },
    {
      path: 'Y.md',
      frontmatter: { up: '[[Target#Intro]]', here: '[[#Intro]]' },
      links: ['Target'],
    },
  )
  const up = evalAt(vault, 'Y.md', 'up')
  assert.ok(up instanceof LinkValue)
  assert.equal(up.resolvedPath, 'notes/Target.md')
  assert.equal(evalAt(vault, 'Y.md', 'up == link("Target")'), true)
  assert.equal(evalAt(vault, 'Y.md', 'file.hasLink(up)'), true)
  assert.equal(
    pathOf(evalAt(vault, 'Y.md', 'link("[[Target#Intro]]").asFile()')),
    'notes/Target.md',
  )
})

test('a link keeps its heading subpath for display and string comparison', () => {
  const vault = vaultOf(
    { path: 'notes/Target.md' },
    {
      path: 'Y.md',
      frontmatter: { up: '[[Target#Intro]]', here: '[[#Intro]]' },
      links: ['Target'],
    },
  )
  assert.equal(evalAt(vault, 'Y.md', 'up.toString()'), 'Target#Intro')
  assert.equal(evalAt(vault, 'Y.md', 'here.toString()'), '#Intro')
  assert.equal(evalAt(vault, 'Y.md', 'up == "Target#Intro"'), true)
  assert.equal(evalAt(vault, 'Y.md', 'link("[[Target#Intro]]").toString()'), 'Target#Intro')
})

test('an external URL never resolves to a vault note by its last path segment', () => {
  const vault = vaultOf({ path: 'README.md' }, { path: 'a.md', links: ['README'] })
  const url = 'https://github.com/x/README'
  assert.equal(evalAt(vault, 'a.md', `link("${url}").asFile()`), null)
  assert.equal(evalAt(vault, 'a.md', `file("${url}")`), null)
  assert.equal(evalAt(vault, 'a.md', `file.hasLink("${url}")`), false)
  assert.equal(evalAt(vault, 'a.md', `link("${url}").linksTo(file("README"))`), false)
  assert.equal(evalAt(vault, 'a.md', `link("${url}").name`), null)
})

test('an unresolved link with a heading matches the same body link without it', () => {
  // [[Missing]] in the body resolves nowhere, so hasLink compares targets, and
  // the scanner stored that target without a subpath.
  const vault = vaultOf({
    path: 'A.md',
    frontmatter: { up: '[[Missing#Intro]]' },
    links: ['Missing'],
  })
  assert.equal(evalAt(vault, 'A.md', 'file.hasLink(up)'), true)
  assert.equal(evalAt(vault, 'A.md', 'file.hasLink(link("Missing#Intro"))'), true)
  assert.equal(evalAt(vault, 'A.md', 'file.hasLink(link("Other#Intro"))'), false)
})

test('a relative link resolves from the folder of the note it was written in', () => {
  const vault = vaultOf(
    { path: 'sib.md' },
    { path: 'notes/sib.md' },
    { path: 'notes/a.md', frontmatter: { rel: '[[./sib]]' }, links: ['./sib'] },
    { path: 'other/b.md', frontmatter: { up: '[[../notes/a]]' } },
  )
  assert.equal(vault.byPath.get('notes/a.md')!.links[0]?.path, 'notes/sib.md')
  const shared = runLinkResolver(vault)
  for (const resolveLink of [undefined, shared]) {
    const at = (path: string, expression: string): Value => {
      const note = vault.byPath.get(path)!
      const ctx: EvalContext = {
        note,
        vault,
        formulas: {},
        ...(resolveLink ? { resolveLink } : {}),
      }
      return evaluate(parseExpression(expression), ctx)
    }
    assert.equal(pathOf(at('notes/a.md', 'rel.asFile()')), 'notes/sib.md')
    assert.equal(pathOf(at('notes/a.md', 'file("./sib")')), 'notes/sib.md')
    assert.equal(pathOf(at('notes/a.md', 'link("./sib").asFile()')), 'notes/sib.md')
    assert.equal(at('notes/a.md', 'file.hasLink(rel)'), true)
    // Another note's frontmatter resolves from that note, not the row.
    assert.equal(pathOf(at('other/b.md', 'up.asFile().properties.rel.asFile()')), 'notes/sib.md')
  }
  assert.equal(resolveNote(vault, './sib')?.file.path, 'sib.md')
})

test("an unresolved relative link in another note's frontmatter stays unresolved", () => {
  const vault = vaultOf(
    { path: 'notes/a.md' },
    { path: 'notes/x.md' },
    { path: 'other/b.md', frontmatter: { up: '[[./x]]' } },
  )
  const up = evalAt(vault, 'notes/a.md', 'file("other/b").properties.up')
  assert.ok(up instanceof LinkValue)
  assert.equal(up.resolvedPath, null)
  assert.equal(evalAt(vault, 'notes/a.md', 'file("other/b").properties.up.asFile()'), null)
})
