import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildRefIndex, resolveRef, wikilinkRef } from '../src/wikilink-ref.ts'

/** Build a throwaway content tree and return the collection dir. */
function fixture(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'oa-ref-'))
  for (const rel of files) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, '# x')
  }
  return root
}

test('resolveRef resolves bare stem to the correct {collection,id,href}', () => {
  const dir = fixture(['some-file.md', 'sub/nested.md'])
  const index = buildRefIndex(
    [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }],
    new Map(),
  )
  assert.deepEqual(resolveRef('some-file', index), {
    collection: 'posts',
    id: 'some-file',
    href: '/posts/some-file',
  })
})

test('resolveRef resolves a content-relative path', () => {
  const dir = fixture(['sub/nested.md'])
  const index = buildRefIndex(
    [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }],
    new Map(),
  )
  assert.deepEqual(resolveRef('sub/nested', index), {
    collection: 'posts',
    id: 'sub/nested',
    href: '/posts/sub/nested',
  })
})

test('resolveRef resolves a vault path', () => {
  const dir = fixture(['some-file.md'])
  const index = buildRefIndex(
    [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }],
    new Map(),
  )
  assert.deepEqual(resolveRef('00/posts/some-file', index), {
    collection: 'posts',
    id: 'some-file',
    href: '/posts/some-file',
  })
  // .md suffix is normalised away too:
  assert.equal(resolveRef('00/posts/some-file.md', index)?.id, 'some-file')
})

test('resolveRef typed type/slug bypasses config order to reach the mapped collection', () => {
  // Both collections contain a file with the same bare stem. Config order would
  // pick `posts` for a bare/untyped link, but the `health` type prefix must
  // select the `health` collection deterministically.
  const posts = fixture(['record.md'])
  const health = fixture(['record.md'])
  const index = buildRefIndex(
    [
      { name: 'posts', dir: posts, vaultDir: 'Posts', route: '/posts/:slug' },
      { name: 'health', dir: health, vaultDir: 'Health', route: '/health/:slug' },
    ],
    new Map([['health', 'health']]),
  )

  // Untyped bare name -> posts wins (config order):
  assert.equal(resolveRef('record', index)?.collection, 'posts')
  // Typed prefix -> health, bypassing config order:
  assert.deepEqual(resolveRef('health/record', index), {
    collection: 'health',
    id: 'record',
    href: '/health/record',
  })
})

test('resolveRef returns null for an unrecognised target', () => {
  const dir = fixture(['a.md'])
  const index = buildRefIndex(
    [{ name: 'posts', dir, vaultDir: 'Posts', route: '/posts/:slug' }],
    new Map(),
  )
  assert.equal(resolveRef('does-not-exist', index), null)
})

test('resolveRef returns null for a known type with an unresolvable slug', () => {
  const health = fixture(['record.md'])
  const index = buildRefIndex(
    [{ name: 'health', dir: health, vaultDir: 'Health', route: '/health/:slug' }],
    new Map([['health', 'health']]),
  )
  assert.equal(resolveRef('health/nope', index), null)
})

test("wikilinkRef('health') accepts a well-formed typed reference", () => {
  const schema = wikilinkRef('health')
  assert.equal(schema.safeParse('[[health/slug-abc]]').success, true)
})

test("wikilinkRef('health') rejects malformed references", () => {
  const schema = wikilinkRef('health')
  assert.equal(schema.safeParse('[[slug-abc]]').success, false) // no type prefix
  assert.equal(schema.safeParse('[[health/slug abc]]').success, false) // space in slug
  assert.equal(schema.safeParse('').success, false) // empty string
  assert.equal(schema.safeParse('[[other/slug-abc]]').success, false) // wrong type
})

test("wikilinkRef('location') accepts a trailing |alias with spaces", () => {
  const schema = wikilinkRef('location')
  // The display alias may contain spaces and a `|`; only the slug must be clean.
  assert.equal(schema.safeParse("[[location/grandma-jos-cedar-rapids|Grandma Jo's]]").success, true)
  assert.equal(schema.safeParse('[[location/city-library|City Library]]').success, true)
  // A space in the SLUG portion (before the `|`) is still rejected.
  assert.equal(schema.safeParse('[[location/bad slug|Alias]]').success, false)
  // A missing type prefix is still rejected even with an alias.
  assert.equal(schema.safeParse("[[grandma-jos|Grandma Jo's]]").success, false)
})

test('wikilinkRef with an index resolves the slug, ignoring the |alias', () => {
  const location = fixture(['grandma-jos-cedar-rapids.md'])
  const index = buildRefIndex(
    [{ name: 'location', dir: location, vaultDir: 'Location', route: '/location/:slug' }],
    new Map([['location', 'location']]),
  )
  const schema = wikilinkRef('location', index)
  assert.equal(schema.safeParse("[[location/grandma-jos-cedar-rapids|Grandma Jo's]]").success, true)
  assert.equal(schema.safeParse('[[location/missing-place|Whatever]]').success, false)
})

test('wikilinkRef with an index also asserts the target resolves', () => {
  const health = fixture(['record.md'])
  const index = buildRefIndex(
    [{ name: 'health', dir: health, vaultDir: 'Health', route: '/health/:slug' }],
    new Map([['health', 'health']]),
  )
  const schema = wikilinkRef('health', index)
  assert.equal(schema.safeParse('[[health/record]]').success, true)
  assert.equal(schema.safeParse('[[health/missing]]').success, false)
})

test('resolveRef resolves relative ./ and ../ links', () => {
  const dir = fixture(['note.md'])
  const index = buildRefIndex(
    [{ name: 'posts', dir, vaultDir: 'Posts', route: '/posts/:slug' }],
    new Map(),
  )
  assert.equal(resolveRef('./note', index)?.id, 'note')
  assert.equal(resolveRef('../Posts/note', index)?.id, 'note')
  // a `..` mid-path climbs out of the folder before it:
  assert.equal(resolveRef('Posts/x/../note', index)?.id, 'note')
})

test('non-Latin note names get distinct keys', () => {
  const dir = fixture(['trips/日本.md', 'trips/東京.md', '日本語.md'])
  const collisions: string[] = []
  const index = buildRefIndex([{ name: 'notes', dir, route: '/n/:slug' }], new Map(), (m) =>
    collisions.push(m),
  )
  assert.deepEqual(collisions, [])
  assert.equal(resolveRef('trips/日本', index)?.id, 'trips/日本')
  assert.equal(resolveRef('trips/東京', index)?.id, 'trips/東京')
  assert.equal(resolveRef('日本語', index)?.id, '日本語')
})

test('an exact path key wins over a nested file with the same stem', () => {
  // readdir lists `archive` before `roadmap.md`, so the nested stem is indexed first.
  const dir = fixture(['archive/roadmap.md', 'roadmap.md'])
  const index = buildRefIndex([{ name: 'notes', dir, route: '/notes/:slug' }], new Map())
  assert.deepEqual(resolveRef('roadmap', index), {
    collection: 'notes',
    id: 'roadmap',
    href: '/notes/roadmap',
  })
  assert.equal(resolveRef('archive/roadmap', index)?.id, 'archive/roadmap')
})

test('a $ pattern in a note id is put into the href as written', () => {
  const dir = fixture(['price $& tax.md'])
  const index = buildRefIndex([{ name: 'n', dir, route: '/n/:slug' }], new Map([['n', 'n']]))
  assert.equal(resolveRef('price $& tax', index)?.href, '/n/price $& tax')
  assert.equal(resolveRef('n/price $& tax', index)?.href, '/n/price $& tax')
})

test('resolveRef keeps non-Latin letters in the key', () => {
  const dir = fixture(['trip.md', 'Москва.md', 'हिन्दी.md'])
  const index = buildRefIndex([{ name: 'notes', dir, route: null }], new Map())
  assert.equal(resolveRef('Москва', index)?.id, 'Москва')
  assert.equal(resolveRef('हिन्दी', index)?.id, 'हिन्दी')
  // The non-Latin part is not dropped, so this does not collapse onto `trip`.
  assert.equal(resolveRef('Ελλάδα trip', index), null)
})
