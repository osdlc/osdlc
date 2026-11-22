import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import nodePath from 'node:path'
import { test } from 'vitest'

import { createVaultIndex } from '../src/from-data.ts'
import { createLinkResolver, extractInlineTags, extractLinks, scanVault } from '../src/scan.ts'

// The scanner's tag alphabet is the same set `@osdlc/markdown-render` renders
// and the same one the Rust census counts. When it was ASCII-only, an accented
// tag was not rejected — it was silently cut short, so the vault indexed
// `sant` for a note that reads `#santé`.
test('inline tags accept any Unicode letter', () => {
  assert.deepEqual(extractInlineTags('a #santé b'), ['santé'])
  assert.deepEqual(extractInlineTags('a #日本語 b'), ['日本語'])
  assert.deepEqual(extractInlineTags('a #Ελληνικά b'), ['Ελληνικά'])
  assert.deepEqual(extractInlineTags('a #кириллица b'), ['кириллица'])
  assert.deepEqual(extractInlineTags('a #über-cool b'), ['über-cool'])
})

test('the ASCII cases are unchanged', () => {
  assert.deepEqual(extractInlineTags('#tag and #nested/like/this'), ['tag', 'nested/like/this'])
  assert.deepEqual(extractInlineTags('(#draft)'), ['draft'])
  assert.deepEqual(extractInlineTags('#numbers123'), ['numbers123'])
})

test('a purely numeric tag is still not a tag', () => {
  assert.deepEqual(extractInlineTags('#1 and #2024'), [])
})

test('a mid-word hash is still not a tag', () => {
  assert.deepEqual(extractInlineTags('C# and foo#bar'), [])
})

test('code regions are still blanked before scanning', () => {
  assert.deepEqual(extractInlineTags('```\n#nottag\n```\n\n`#alsonot`\n\n#real'), ['real'])
})

test('a tilde fence is skipped for tags and links', () => {
  const body = '~~~\n#nottag [[NotLink]]\n~~~\n\n#real [[Real]]'
  assert.deepEqual(extractInlineTags(body), ['real'])
  assert.deepEqual(
    extractLinks(body).links.map((l) => l.target),
    ['Real'],
  )
})

test('a link destination is not a tag', () => {
  assert.deepEqual(extractInlineTags('[see](#section)\n\n[x]: #def'), [])
})

test('inline tags follow the dialect', () => {
  const body = '#2024 (#draft) #santé'
  assert.deepEqual(extractInlineTags(body), ['draft', 'santé'])
  assert.deepEqual(extractInlineTags(body, { tagDialect: 'unicode' }), ['2024', 'santé'])
  assert.deepEqual(extractInlineTags(body, { tagDialect: 'ascii' }), ['draft', 'sant'])
})

// ---------------------------------------------------------------------------
// resolveVaultLinks. `createVaultIndex` is the smallest way to hand the
// resolver a vault, so these drive it through that rather than hand-building
// `FileMeta` records; the rules under test are `scan.ts`'s.
// ---------------------------------------------------------------------------

test('resolveVaultLinks: a target naming a non-markdown file resolves by basename', () => {
  const index = createVaultIndex(
    [
      { path: 'hub.md', links: ['spoke'], embeds: ['note.png'] },
      { path: 'assets/note.png' },
      { path: 'assets/spoke.md' },
    ],
    { resolveLinks: true },
  )
  const hub = index.byPath.get('hub.md')!
  assert.equal(hub.embeds[0]!.path, 'assets/note.png')
  assert.equal(hub.links[0]!.path, 'assets/spoke.md')
  assert.deepEqual(index.byPath.get('assets/note.png')!.backlinks, ['hub.md'])
})

test('resolveVaultLinks: a basename that itself contains a dot still resolves', () => {
  const index = createVaultIndex([{ path: 'hub.md', links: ['v1.2'] }, { path: 'notes/v1.2.md' }], {
    resolveLinks: true,
  })
  assert.equal(index.byPath.get('hub.md')!.links[0]!.path, 'notes/v1.2.md')
})

test('resolveVaultLinks: a folder-qualified target only matches on a path-segment boundary', () => {
  const index = createVaultIndex(
    [{ path: 'hub.md', links: ['b/note'] }, { path: 'aab/note.md' }, { path: 'zz/b/note.md' }],
    { resolveLinks: true },
  )
  // 'aab/note.md' ends with the string 'b/note.md' but not with the folder 'b'.
  assert.equal(index.byPath.get('hub.md')!.links[0]!.path, 'zz/b/note.md')
  assert.deepEqual(index.byPath.get('zz/b/note.md')!.backlinks, ['hub.md'])
  assert.deepEqual(index.byPath.get('aab/note.md')!.backlinks, [])
})

test('resolveVaultLinks: a folder-qualified target still matches a vault-root path', () => {
  const index = createVaultIndex([{ path: 'hub.md', links: ['b/note'] }, { path: 'b/note.md' }], {
    resolveLinks: true,
  })
  assert.equal(index.byPath.get('hub.md')!.links[0]!.path, 'b/note.md')
})

test('resolveVaultLinks: resolving one target does not change how a later one resolves', () => {
  const vault = [{ path: 'a/long/Alpha/note.md' }, { path: 'bb/Alpha/note.md' }]
  const alone = createVaultIndex([{ path: 'hub.md', links: ['Alpha/note'] }, ...vault], {
    resolveLinks: true,
  })
  // Identical vault and identical target, with one unrelated link resolved first.
  const preceded = createVaultIndex([{ path: 'hub.md', links: ['note', 'Alpha/note'] }, ...vault], {
    resolveLinks: true,
  })
  const expected = alone.byPath.get('hub.md')!.links[0]!.path
  assert.ok(expected !== null)
  assert.equal(preceded.byPath.get('hub.md')!.links[1]!.path, expected)
})

test('resolveVaultLinks: a target written with an extension prefers the file with that name', () => {
  const index = createVaultIndex(
    [{ path: 'hub.md', embeds: ['note.png'] }, { path: 'note.md' }, { path: 'assets/note.png' }],
    { resolveLinks: true },
  )
  // Shortest path would pick 'note.md'; a markdown note is not the named image.
  assert.equal(index.byPath.get('hub.md')!.embeds[0]!.path, 'assets/note.png')
})

test('resolveVaultLinks: a target whose named extension exists nowhere stays unresolved', () => {
  const index = createVaultIndex([{ path: 'hub.md', embeds: ['note.png'] }, { path: 'note.md' }], {
    resolveLinks: true,
  })
  assert.equal(index.byPath.get('hub.md')!.embeds[0]!.path, null)
})

test('resolveVaultLinks: a folder-qualified target keeps its folder for a non-markdown file', () => {
  const index = createVaultIndex(
    [
      { path: 'hub.md', embeds: ['sub/note.png'] },
      { path: 'note.md' },
      { path: 'x/sub/note.png' },
      { path: 'y/note.png' },
    ],
    { resolveLinks: true },
  )
  // 'y/note.png' is the shorter path, but only 'x/sub/note.png' is in 'sub'.
  assert.equal(index.byPath.get('hub.md')!.embeds[0]!.path, 'x/sub/note.png')
})

test('resolveVaultLinks: a `.md` target is not shadowed by a file whose basename spells it', () => {
  const index = createVaultIndex(
    [{ path: 'hub.md', links: ['note.md'] }, { path: 'note.md.txt' }, { path: 'deep/note.md' }],
    { resolveLinks: true },
  )
  assert.equal(index.byPath.get('hub.md')!.links[0]!.path, 'deep/note.md')
})

test('resolveVaultLinks: an extensionless target prefers the markdown note over a shorter same-name file', () => {
  const index = createVaultIndex(
    [{ path: 'hub.md', links: ['note'] }, { path: 'note.png' }, { path: 'deep/note.md' }],
    { resolveLinks: true },
  )
  // Shortest path would pick 'note.png'; an extensionless link means the note.
  assert.equal(index.byPath.get('hub.md')!.links[0]!.path, 'deep/note.md')
  assert.deepEqual(index.byPath.get('deep/note.md')!.backlinks, ['hub.md'])
  assert.deepEqual(index.byPath.get('note.png')!.backlinks, [])
})

test('resolveVaultLinks: a folder-qualified target with no match in that folder stays unresolved', () => {
  const index = createVaultIndex(
    [
      { path: 'hub.md', links: ['b/note', 'projects/plan'], embeds: ['sub/note.png'] },
      { path: 'aab/note.md' },
      { path: 'archive/plan.md' },
      { path: 'y/note.png' },
    ],
    { resolveLinks: true },
  )
  const hub = index.byPath.get('hub.md')!
  assert.equal(hub.links[0]!.path, null)
  assert.equal(hub.links[1]!.path, null)
  assert.equal(hub.embeds[0]!.path, null)
  assert.deepEqual(index.byPath.get('aab/note.md')!.backlinks, [])
  assert.deepEqual(index.byPath.get('archive/plan.md')!.backlinks, [])
  assert.deepEqual(index.byPath.get('y/note.png')!.backlinks, [])
})

test("resolveVaultLinks: a relative target resolves against the linking note's folder", () => {
  const index = createVaultIndex(
    [
      { path: 'a/hub.md', links: ['../b/note', './sib', './note', '../../outside'] },
      { path: 'b/note.md' },
      { path: 'a/sib.md' },
      { path: 'note.md' },
      { path: 'a/note.md' },
      { path: 'outside.md' },
    ],
    { resolveLinks: true },
  )
  const links = index.byPath.get('a/hub.md')!.links
  assert.equal(links[0]!.path, 'b/note.md')
  assert.equal(links[1]!.path, 'a/sib.md')
  // Shortest path would pick the root 'note.md'; './' names the linking note's folder.
  assert.equal(links[2]!.path, 'a/note.md')
  // A path that climbs out of the vault names nothing in it.
  assert.equal(links[3]!.path, null)
  assert.deepEqual(index.byPath.get('b/note.md')!.backlinks, ['a/hub.md'])
  assert.deepEqual(index.byPath.get('note.md')!.backlinks, [])
})

test('resolveVaultLinks: a dotted name prefers the markdown note over a shorter same-name file', () => {
  const index = createVaultIndex(
    [{ path: 'hub.md', links: ['v1.2'] }, { path: 'v1.2.png' }, { path: 'deep/v1.2.md' }],
    { resolveLinks: true },
  )
  // '.2' is part of the name, not an extension: the link means the note 'v1.2.md'.
  assert.equal(index.byPath.get('hub.md')!.links[0]!.path, 'deep/v1.2.md')
  assert.deepEqual(index.byPath.get('v1.2.png')!.backlinks, [])
})

test('resolveVaultLinks: a relative target with no file at its joined path stays unresolved', () => {
  const index = createVaultIndex(
    [
      { path: 'root.md', links: ['./note'] },
      { path: 'a/hub.md', links: ['../note', '../b/note'] },
      { path: 'deep/note.md' },
      { path: 'z/b/note.md' },
    ],
    { resolveLinks: true },
  )
  // './note' from the root names 'note.md', and '../b/note' from 'a/' names
  // 'b/note.md'. Neither exists, so a same-name note elsewhere is not the one meant.
  assert.equal(index.byPath.get('root.md')!.links[0]!.path, null)
  const links = index.byPath.get('a/hub.md')!.links
  assert.equal(links[0]!.path, null)
  assert.equal(links[1]!.path, null)
  assert.deepEqual(index.byPath.get('deep/note.md')!.backlinks, [])
  assert.deepEqual(index.byPath.get('z/b/note.md')!.backlinks, [])
})

test('resolveVaultLinks: a relative target matches its joined path case-insensitively', () => {
  const index = createVaultIndex(
    [{ path: 'a/hub.md', links: ['../B/Note'] }, { path: 'b/note.md' }],
    { resolveLinks: true },
  )
  assert.equal(index.byPath.get('a/hub.md')!.links[0]!.path, 'b/note.md')
})

test('resolveVaultLinks: an extensionless target resolves to a markdown note, not an attachment', () => {
  const index = createVaultIndex(
    [
      { path: 'hub.md', links: ['note', 'v1.2'] },
      { path: 'deep/folder/note.md' },
      { path: 'note.png' },
      { path: 'docs/v1.2.md' },
      { path: 'v1.2.pdf' },
    ],
    { resolveLinks: true },
  )
  const hub = index.byPath.get('hub.md')!
  assert.equal(hub.links[0]!.path, 'deep/folder/note.md')
  assert.equal(hub.links[1]!.path, 'docs/v1.2.md')
  assert.deepEqual(index.byPath.get('note.png')!.backlinks, [])
  assert.deepEqual(index.byPath.get('deep/folder/note.md')!.backlinks, ['hub.md'])
})

test('resolveVaultLinks: an extensionless target skips a same-length non-markdown file', () => {
  const index = createVaultIndex(
    [{ path: 'hub.md', links: ['note'] }, { path: 'a/note.js' }, { path: 'a/note.md' }],
    { resolveLinks: true },
  )
  assert.equal(index.byPath.get('hub.md')!.links[0]!.path, 'a/note.md')
})

test('resolveVaultLinks: an extensionless exact path prefers the `.md` note over a bare file', () => {
  const index = createVaultIndex(
    [{ path: 'hub.md', links: ['note'] }, { path: 'note' }, { path: 'note.md' }],
    { resolveLinks: true },
  )
  assert.equal(index.byPath.get('hub.md')!.links[0]!.path, 'note.md')
  assert.deepEqual(index.byPath.get('note.md')!.backlinks, ['hub.md'])
})

test('resolveVaultLinks: an extensionless target resolves to a file with no extension', () => {
  const index = createVaultIndex(
    [
      { path: 'hub.md', links: ['Makefile', 'note'] },
      { path: 'scripts/Makefile' },
      { path: 'x/note' },
      { path: 'a/b/note.md' },
    ],
    { resolveLinks: true },
  )
  const hub = index.byPath.get('hub.md')!
  assert.equal(hub.links[0]!.path, 'scripts/Makefile')
  // A '.md' note still wins over a shorter bare file of the same name.
  assert.equal(hub.links[1]!.path, 'a/b/note.md')
})

test('resolveVaultLinks: a folder-qualified target whose folder matches nothing stays unresolved', () => {
  const index = createVaultIndex(
    [{ path: 'hub.md', links: ['b/note', 'missing/note'] }, { path: 'aab/note.md' }],
    { resolveLinks: true },
  )
  const hub = index.byPath.get('hub.md')!
  assert.equal(hub.links[0]!.path, null)
  assert.equal(hub.links[1]!.path, null)
  assert.deepEqual(index.byPath.get('aab/note.md')!.backlinks, [])
})

test('resolveVaultLinks: a relative target resolves to the note at its joined path', () => {
  const index = createVaultIndex(
    [
      { path: 'a/hub.md', links: ['../b/note', './sibling'] },
      { path: 'b/note.md' },
      { path: 'a/sibling.md' },
    ],
    { resolveLinks: true },
  )
  const hub = index.byPath.get('a/hub.md')!
  assert.equal(hub.links[0]!.path, 'b/note.md')
  assert.equal(hub.links[1]!.path, 'a/sibling.md')
})

async function makeVault(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'markdown-vault-test-'))
  for (const [relative, content] of Object.entries(files)) {
    const absolute = nodePath.join(root, relative)
    await fs.mkdir(nodePath.dirname(absolute), { recursive: true })
    await fs.writeFile(absolute, content, 'utf8')
  }
  return root
}

/** Whether this machine lets the test process create a symlink (Windows may not). */
const canSymlink = await (async () => {
  const dir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'markdown-vault-probe-'))
  try {
    await fs.writeFile(nodePath.join(dir, 'target'), '')
    await fs.symlink(nodePath.join(dir, 'target'), nodePath.join(dir, 'link'))
    return true
  } catch {
    return false
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})()

/** A test that runs only where a symlink can be created. */
const symlinkTest = test.skipIf(!canSymlink)

symlinkTest(
  'scanVault: a symlinked note is indexed and resolves as a link target',
  async ({ onTestFinished }) => {
    const root = await makeVault({
      'A.md': 'see [[Linked]]\n',
      'sub/Note B.md': 'body\n',
    })
    onTestFinished(() => fs.rm(root, { recursive: true, force: true }))
    await fs.symlink(nodePath.join(root, 'sub', 'Note B.md'), nodePath.join(root, 'Linked.md'))

    const index = await scanVault(root)
    assert.deepEqual(index.notes.map((n) => n.file.path).sort(), [
      'A.md',
      'Linked.md',
      'sub/Note B.md',
    ])
    assert.equal(index.byPath.get('A.md')!.links[0]!.path, 'Linked.md')
    assert.deepEqual(index.byPath.get('Linked.md')!.backlinks, ['A.md'])
  },
)

test('scanVault: an extensionless link resolves to the note, not a shorter attachment', async ({
  onTestFinished,
}) => {
  const root = await makeVault({
    'src.md': 'see [[note]]\n',
    'a/note.md': 'body\n',
    'note.png': 'x',
  })
  onTestFinished(() => fs.rm(root, { recursive: true, force: true }))

  const index = await scanVault(root)
  assert.equal(index.byPath.get('src.md')!.links[0]!.path, 'a/note.md')
  assert.deepEqual(index.byPath.get('a/note.md')!.backlinks, ['src.md'])
  assert.deepEqual(index.byPath.get('note.png')!.backlinks, [])
})

test('scanVault: an extensionless link prefers `TODO.md` over a bare `TODO` file', async ({
  onTestFinished,
}) => {
  const root = await makeVault({ TODO: 'plain\n', 'TODO.md': 'body\n', 'a.md': 'see [[TODO]]\n' })
  onTestFinished(() => fs.rm(root, { recursive: true, force: true }))

  const index = await scanVault(root)
  assert.equal(index.byPath.get('a.md')!.links[0]!.path, 'TODO.md')
  assert.deepEqual(index.byPath.get('TODO.md')!.backlinks, ['a.md'])
})

symlinkTest('scanVault: a symlinked directory is walked', async ({ onTestFinished }) => {
  const root = await makeVault({ 'real/Deep.md': 'body\n' })
  onTestFinished(() => fs.rm(root, { recursive: true, force: true }))
  await fs.symlink(nodePath.join(root, 'real'), nodePath.join(root, 'linked'))

  const index = await scanVault(root)
  assert.deepEqual(index.notes.map((n) => n.file.path).sort(), ['linked/Deep.md', 'real/Deep.md'])
})

symlinkTest(
  'scanVault: a broken symlink is skipped rather than thrown on',
  async ({ onTestFinished }) => {
    const root = await makeVault({ 'A.md': 'body\n' })
    onTestFinished(() => fs.rm(root, { recursive: true, force: true }))
    await fs.symlink(nodePath.join(root, 'gone.md'), nodePath.join(root, 'Dangling.md'))

    const index = await scanVault(root)
    assert.deepEqual(
      index.notes.map((n) => n.file.path),
      ['A.md'],
    )
  },
)

test('scanVault: tagDialect picks the inline tag rule, default obsidian', async ({
  onTestFinished,
}) => {
  const root = await makeVault({ 'A.md': '---\ntags: [fm]\n---\n#2024 (#draft)\n' })
  onTestFinished(() => fs.rm(root, { recursive: true, force: true }))

  const tagsOf = async (options = {}) => (await scanVault(root, options)).byPath.get('A.md')!.tags
  assert.deepEqual(await tagsOf(), ['fm', 'draft'])
  assert.deepEqual(await tagsOf({ tagDialect: 'unicode' }), ['fm', '2024'])
})

symlinkTest(
  'scanVault: a symlink pointing back up the tree terminates',
  async ({ onTestFinished }) => {
    const root = await makeVault({ 'deep/A.md': 'body\n' })
    onTestFinished(() => fs.rm(root, { recursive: true, force: true }))
    await fs.symlink(root, nodePath.join(root, 'deep', 'up'))

    const index = await scanVault(root)
    assert.ok(index.notes.some((n) => n.file.path === 'deep/A.md'))
  },
)

test('extractLinks treats a backslash before the alias pipe as an escape', () => {
  const { links, embeds } = extractLinks(
    '| [[Note\\|alias]] | [[Note#Heading\\|alias]] | ![[Pic\\|300]] | [[Plain|alias]] | [[Lit\\]] |',
  )
  assert.deepEqual(
    links.map((l) => [l.target, l.display]),
    [
      ['Note', 'alias'],
      ['Note', 'alias'],
      ['Plain', 'alias'],
      ['Lit\\', null],
    ],
  )
  assert.deepEqual(
    embeds.map((l) => [l.target, l.display]),
    [['Pic', '300']],
  )
})

test('extractLinks reads the alias from the source, splits at a pipe outside code, and an empty alias is null', () => {
  const { links } = extractLinks('[[Note|the `x` label]] [[Other|]] [[a `x|y` b|Label]]')
  assert.deepEqual(
    links.map((l) => [l.target, l.display]),
    [
      ['Note', 'the `x` label'],
      ['Other', null],
      ['a       b', 'Label'],
    ],
  )
})

test('extractLinks strips only one backslash before the pipe', () => {
  const { links } = extractLinks('[[Note\\\\|alias]]')
  assert.deepEqual(
    links.map((l) => l.target),
    ['Note\\'],
  )
})

test('extractLinks skips a link whose only target is the escape', () => {
  const { links } = extractLinks('[[\\|alias]] [[ \\|alias]] [[|alias]] [[#H]] [[Kept]]')
  assert.deepEqual(
    links.map((l) => l.target),
    ['Kept'],
  )
})

test('createLinkResolver resolves a target the way resolveVaultLinks resolved the body link', () => {
  const index = createVaultIndex(
    [
      { path: 'hub.md', links: ['b/note', 'cover.png'] },
      { path: 'aab/note.md' },
      { path: 'zz/b/note.md' },
      { path: 'img/cover.png' },
      { path: 'cover.md' },
    ],
    { resolveLinks: true },
  )
  const resolve = createLinkResolver(index)
  for (const ref of index.byPath.get('hub.md')!.links) {
    assert.equal(resolve(ref.target)?.file.path ?? null, ref.path, ref.target)
  }
  assert.equal(resolve('b/note')?.file.path, 'zz/b/note.md')
  assert.equal(resolve('cover.png')?.file.path, 'img/cover.png')
  assert.equal(resolve('missing'), null)
})

symlinkTest(
  'scanVault: a symlink that points outside the vault is followed and its files are indexed',
  async ({ onTestFinished }) => {
    const outside = await makeVault({ 'secret.md': '---\nsecret: hunter2\n---\nbody\n' })
    const root = await makeVault({ 'A.md': 'body\n' })
    onTestFinished(() => fs.rm(outside, { recursive: true, force: true }))
    onTestFinished(() => fs.rm(root, { recursive: true, force: true }))
    await fs.symlink(outside, nodePath.join(root, 'leak'))

    const index = await scanVault(root)
    assert.deepEqual(index.notes.map((n) => n.file.path).sort(), ['A.md', 'leak/secret.md'])
    assert.deepEqual(index.byPath.get('leak/secret.md')!.properties, { secret: 'hunter2' })
  },
)

test('scanVault: includeNonMarkdown false indexes Markdown notes only', async ({
  onTestFinished,
}) => {
  const root = await makeVault({ 'A.md': 'see [[pic.png]]\n', 'pic.png': 'x', Makefile: '' })
  onTestFinished(() => fs.rm(root, { recursive: true, force: true }))

  const all = await scanVault(root)
  assert.deepEqual(
    all.notes.map((n) => n.file.path),
    ['A.md', 'Makefile', 'pic.png'],
  )
  const only = await scanVault(root, { includeNonMarkdown: false })
  assert.deepEqual(
    only.notes.map((n) => n.file.path),
    ['A.md'],
  )
  assert.equal(only.byPath.get('A.md')!.links[0]!.path, null)
})

test('scanVault: skips dot entries and node_modules, at any depth', async ({ onTestFinished }) => {
  const root = await makeVault({
    'A.md': 'body\n',
    '.hidden.md': 'x',
    '.obsidian/app.json': '{}',
    '.git/HEAD': 'x',
    '.trash/old.md': 'x',
    'node_modules/pkg/index.md': 'x',
    'sub/node_modules/pkg/index.md': 'x',
    'sub/.cache/c.md': 'x',
    'sub/B.md': 'body\n',
  })
  onTestFinished(() => fs.rm(root, { recursive: true, force: true }))

  const index = await scanVault(root)
  assert.deepEqual(
    index.notes.map((n) => n.file.path),
    ['A.md', 'sub/B.md'],
  )
})

test('scanVault: paths are vault-relative and notes come back in path order', async ({
  onTestFinished,
}) => {
  const root = await makeVault({ 'b/z.md': '', 'a/y.md': '', 'c.md': '' })
  onTestFinished(() => fs.rm(root, { recursive: true, force: true }))

  const index = await scanVault(root)
  assert.equal(index.root, root)
  assert.deepEqual(
    index.notes.map((n) => n.file.path),
    ['a/y.md', 'b/z.md', 'c.md'],
  )
  assert.deepEqual(index.byPath.get('a/y.md')!.file.folder, 'a')
})

test('scanVault: rejects when the root does not exist', async () => {
  await assert.rejects(scanVault(nodePath.join(os.tmpdir(), 'markdown-vault-no-such-root')))
})

test('scanVault: reads frontmatter and frontmatter tags next to inline tags, deduped', async ({
  onTestFinished,
}) => {
  const root = await makeVault({
    'A.md': '---\ntags: [x, "#y"]\ntitle: T\n---\n#x #z\n',
    'B.md': '---\ntag: one two\n---\n',
  })
  onTestFinished(() => fs.rm(root, { recursive: true, force: true }))

  const index = await scanVault(root)
  assert.deepEqual(index.byPath.get('A.md')!.tags, ['x', 'y', 'z'])
  assert.deepEqual(index.byPath.get('A.md')!.properties.title, 'T')
  assert.deepEqual(index.byPath.get('B.md')!.tags, ['one', 'two'])
})

test('extractInlineTags: keeps duplicates and takes the dialect in an options object', () => {
  assert.deepEqual(extractInlineTags('#a #a'), ['a', 'a'])
  assert.deepEqual(extractInlineTags('#2024', {}), [])
  assert.deepEqual(extractInlineTags('#2024', { tagDialect: 'unicode' }), ['2024'])
})
