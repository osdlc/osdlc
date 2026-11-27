import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createVaultIndex } from '../src/from-data.ts'

// ---------------------------------------------------------------------------
// FileMeta derivation — must match scanVault's path-splitting exactly.
// ---------------------------------------------------------------------------

test('FileMeta: root-level file', () => {
  const index = createVaultIndex([{ path: 'note.md' }])
  const meta = index.byPath.get('note.md')!.file
  assert.equal(meta.name, 'note.md')
  assert.equal(meta.basename, 'note')
  assert.equal(meta.folder, '')
  assert.equal(meta.ext, 'md')
  assert.equal(meta.path, 'note.md')
})

test('FileMeta: nested file', () => {
  const index = createVaultIndex([{ path: 'a/b/note.md' }])
  const meta = index.byPath.get('a/b/note.md')!.file
  assert.equal(meta.name, 'note.md')
  assert.equal(meta.basename, 'note')
  assert.equal(meta.folder, 'a/b')
  assert.equal(meta.ext, 'md')
})

test('FileMeta: dotfile has no extension split point before the leading dot', () => {
  const index = createVaultIndex([{ path: '.gitignore' }])
  const meta = index.byPath.get('.gitignore')!.file
  assert.equal(meta.basename, '')
  assert.equal(meta.ext, 'gitignore')
})

test('FileMeta: size/mtime/ctime defaults and fallbacks', () => {
  const index = createVaultIndex([
    { path: 'a.md' }, // nothing supplied
    { path: 'b.md', size: 42, mtimeMs: 1000 }, // ctimeMs falls back to mtimeMs
    { path: 'c.md', mtimeMs: 1000, ctimeMs: 500 }, // both explicit
  ])
  const a = index.byPath.get('a.md')!.file
  assert.equal(a.size, 0)
  assert.equal(a.mtime.getTime(), 0)
  assert.equal(a.ctime.getTime(), 0)

  const b = index.byPath.get('b.md')!.file
  assert.equal(b.size, 42)
  assert.equal(b.mtime.getTime(), 1000)
  assert.equal(b.ctime.getTime(), 1000)

  const c = index.byPath.get('c.md')!.file
  assert.equal(c.mtime.getTime(), 1000)
  assert.equal(c.ctime.getTime(), 500)
})

// ---------------------------------------------------------------------------
// Frontmatter: object, JSON string, malformed, absent.
// ---------------------------------------------------------------------------

test('frontmatter: object form passes through', () => {
  const index = createVaultIndex([{ path: 'a.md', frontmatter: { status: 'active', count: 3 } }])
  assert.deepEqual(index.byPath.get('a.md')!.properties, { status: 'active', count: 3 })
})

test('frontmatter: JSON string form is parsed', () => {
  const index = createVaultIndex([{ path: 'a.md', frontmatter: '{"status":"active","count":3}' }])
  assert.deepEqual(index.byPath.get('a.md')!.properties, { status: 'active', count: 3 })
})

test('frontmatter: malformed JSON string is treated as empty, matching scanVault malformed-YAML handling', () => {
  const index = createVaultIndex([{ path: 'a.md', frontmatter: '{not valid json' }])
  assert.deepEqual(index.byPath.get('a.md')!.properties, {})
})

test('frontmatter: a JSON value that is not a plain object is treated as empty', () => {
  const arr = createVaultIndex([{ path: 'a.md', frontmatter: '[1,2,3]' }])
  assert.deepEqual(arr.byPath.get('a.md')!.properties, {})
  const scalar = createVaultIndex([{ path: 'b.md', frontmatter: '"just a string"' }])
  assert.deepEqual(scalar.byPath.get('b.md')!.properties, {})
})

test('frontmatter: absent or null defaults to empty object', () => {
  const index = createVaultIndex([{ path: 'a.md' }, { path: 'b.md', frontmatter: null }])
  assert.deepEqual(index.byPath.get('a.md')!.properties, {})
  assert.deepEqual(index.byPath.get('b.md')!.properties, {})
})

// ---------------------------------------------------------------------------
// title / aliases: fold into properties only when frontmatter is silent.
// ---------------------------------------------------------------------------

test('title folds into properties when frontmatter has no title key', () => {
  const index = createVaultIndex([{ path: 'a.md', title: 'From API' }])
  assert.equal(index.byPath.get('a.md')!.properties.title, 'From API')
})

test('title: frontmatter wins over the supplied title', () => {
  const index = createVaultIndex([
    { path: 'a.md', title: 'From API', frontmatter: { title: 'From YAML' } },
  ])
  assert.equal(index.byPath.get('a.md')!.properties.title, 'From YAML')
})

test('aliases folds into properties when frontmatter has no aliases key and the list is non-empty', () => {
  const index = createVaultIndex([{ path: 'a.md', aliases: ['Alt Name'] }])
  assert.deepEqual(index.byPath.get('a.md')!.properties.aliases, ['Alt Name'])

  const empty = createVaultIndex([{ path: 'b.md', aliases: [] }])
  assert.ok(!('aliases' in empty.byPath.get('b.md')!.properties))
})

test('aliases: frontmatter wins over the supplied aliases', () => {
  const index = createVaultIndex([
    { path: 'a.md', aliases: ['From API'], frontmatter: { aliases: ['From YAML'] } },
  ])
  assert.deepEqual(index.byPath.get('a.md')!.properties.aliases, ['From YAML'])
})

// ---------------------------------------------------------------------------
// Tags: union of frontmatter tags/tag keys and the supplied `tags` array.
// ---------------------------------------------------------------------------

test('tags: union of frontmatter tags and supplied tags, deduped, # stripped', () => {
  const index = createVaultIndex([
    { path: 'a.md', frontmatter: { tags: ['project', 'review'] }, tags: ['#project', 'urgent'] },
  ])
  assert.deepEqual(index.byPath.get('a.md')!.tags, ['project', 'review', 'urgent'])
})

test('tags: supplied tags alone when frontmatter carries none', () => {
  const index = createVaultIndex([{ path: 'a.md', tags: ['solo'] }])
  assert.deepEqual(index.byPath.get('a.md')!.tags, ['solo'])
})

test('tags: frontmatter tag/tags singular+plural key handling matches scanVault (via shared frontmatterTags)', () => {
  const index = createVaultIndex([{ path: 'a.md', frontmatter: { tag: 'solo-tag' } }])
  assert.deepEqual(index.byPath.get('a.md')!.tags, ['solo-tag'])
})

// ---------------------------------------------------------------------------
// links / embeds / backlinks: default unresolved; resolveLinks opts in.
// ---------------------------------------------------------------------------

test('links/embeds default to unresolved LinkRefs; backlinks default to []', () => {
  const index = createVaultIndex([
    { path: 'a.md', links: ['b'], embeds: ['c'] },
    { path: 'b.md' },
    { path: 'c.md' },
  ])
  const a = index.byPath.get('a.md')!
  assert.deepEqual(a.links, [{ target: 'b', path: null, display: null }])
  assert.deepEqual(a.embeds, [{ target: 'c', path: null, display: null }])
  assert.deepEqual(a.backlinks, [])
  // No resolution pass ran, so b.md/c.md gained no inverted backlinks either.
  assert.deepEqual(index.byPath.get('b.md')!.backlinks, [])
})

test('backlinks: supplied verbatim (deduped) when resolveLinks is not set', () => {
  const index = createVaultIndex([{ path: 'a.md', backlinks: ['x.md', 'y.md', 'x.md'] }])
  assert.deepEqual(index.byPath.get('a.md')!.backlinks, ['x.md', 'y.md'])
})

test('resolveLinks: true resolves exact-path and basename-fallback targets, matching scanVault rules', () => {
  const index = createVaultIndex(
    [
      { path: 'hub.md', links: ['spoke-1', 'orphan'] }, // basename fallback + unresolved
      { path: 'folder/spoke-1.md' },
    ],
    { resolveLinks: true },
  )
  const hub = index.byPath.get('hub.md')!
  const spoke1Ref = hub.links.find((l) => l.target === 'spoke-1')!
  assert.equal(spoke1Ref.path, 'folder/spoke-1.md')
  const orphanRef = hub.links.find((l) => l.target === 'orphan')!
  assert.equal(orphanRef.path, null)

  const spoke1 = index.byPath.get('folder/spoke-1.md')!
  assert.deepEqual(spoke1.backlinks, ['hub.md'])
})

test('resolveLinks: true unions inverted backlinks with explicitly supplied backlinks, deduped', () => {
  const index = createVaultIndex(
    [
      { path: 'a.md', links: ['c'] },
      { path: 'b.md' },
      { path: 'c.md', backlinks: ['b.md', 'a.md'] }, // 'a.md' already present, inversion must not duplicate it
    ],
    { resolveLinks: true },
  )
  assert.deepEqual(index.byPath.get('c.md')!.backlinks, ['b.md', 'a.md'])
})
