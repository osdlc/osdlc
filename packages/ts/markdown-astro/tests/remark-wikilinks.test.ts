import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { remarkWikilinks } from '../src/remark-wikilinks.ts'

/** Build a throwaway content tree and return the collection dir. */
function fixture(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'oa-wl-'))
  for (const rel of files) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, '# x')
  }
  return root
}

/** Render a single `[[link]]` paragraph and return the produced node. */
function resolveLink(target: string, collections: any[], opts: any = {}) {
  // Default to the legacy soft-degrade so resolution-focused tests aren't
  // tripped by the hard-fail default; policy-specific tests pass it explicitly.
  const run = remarkWikilinks({
    collections,
    warnOnCollision: false,
    danglingRefPolicy: 'warn',
    ...opts,
  })
  const tree = {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: `[[${target}]]` }] }],
  }
  run(tree)
  return tree.children[0]!.children[0] as any
}

test('resolves bare name and vault-relative path to the same route', () => {
  // The file lived at vault `00/posts/some-file.md` and now lives at
  // src/content/posts/some-file.md. Links written against the vault layout
  // must still resolve.
  const dir = fixture(['some-file.md', 'sub/nested.md'])
  const cols = [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }]

  assert.equal(resolveLink('some-file', cols).url, '/posts/some-file')
  assert.equal(resolveLink('00/posts/some-file', cols).url, '/posts/some-file')
  assert.equal(resolveLink('00/posts/some-file.md', cols).url, '/posts/some-file')
  // nested file via bare name and via vault path:
  assert.equal(resolveLink('nested', cols).url, '/posts/sub/nested')
  assert.equal(resolveLink('00/posts/sub/nested', cols).url, '/posts/sub/nested')
  // a path that matches neither bare name nor the real vault path does NOT resolve:
  assert.equal(resolveLink('posts/some-file', cols).type, 'html')
})

test('label defaults to the last path segment unless aliased', () => {
  const dir = fixture(['some-file.md'])
  const cols = [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }]
  const link = resolveLink('00/posts/some-file', cols)
  assert.equal(link.children[0].value, 'some-file')
})

test('route:null collection renders a relation span, not a link', () => {
  const dir = fixture(['erasmus.md'])
  const cols = [{ name: 'people', dir, vaultDir: 'People', route: null }]
  const node = resolveLink('erasmus', cols)
  assert.equal(node.type, 'html')
  assert.match(node.value, /class="wikilink"/)
  assert.doesNotMatch(node.value, /wikilink-missing/)
})

test('unresolved target renders a missing span', () => {
  const dir = fixture(['a.md'])
  const cols = [{ name: 'posts', dir, vaultDir: 'Posts', route: '/posts/:slug' }]
  const node = resolveLink('does-not-exist', cols)
  assert.equal(node.type, 'html')
  assert.match(node.value, /wikilink-missing/)
})

test('collection order decides ambiguous bare names; path link disambiguates', () => {
  const posts = fixture(['ada.md'])
  const people = fixture(['ada.md'])
  const cols = [
    { name: 'posts', dir: posts, vaultDir: 'Posts', route: '/posts/:slug' },
    { name: 'people', dir: people, vaultDir: 'People', route: null },
  ]
  // bare [[Ada]] -> posts wins (listed first) -> a link
  assert.equal(resolveLink('Ada', cols).url, '/posts/ada')
  // explicit vault path to people -> relation span
  assert.equal(resolveLink('People/ada', cols).type, 'html')
})

test("danglingRefPolicy 'error' throws on a missing target, naming the link", () => {
  const dir = fixture(['a.md'])
  const cols = [{ name: 'posts', dir, vaultDir: 'Posts', route: '/posts/:slug' }]
  assert.throws(
    () => resolveLink('does-not-exist', cols, { danglingRefPolicy: 'error' }),
    (err: Error) => err instanceof Error && /does-not-exist/.test(err.message),
  )
})

test("danglingRefPolicy 'warn' degrades a missing target to a wikilink-missing span", () => {
  const dir = fixture(['a.md'])
  const cols = [{ name: 'posts', dir, vaultDir: 'Posts', route: '/posts/:slug' }]
  let node: any
  assert.doesNotThrow(() => {
    node = resolveLink('does-not-exist', cols, { danglingRefPolicy: 'warn' })
  })
  assert.equal(node.type, 'html')
  assert.match(node.value, /wikilink-missing/)
})

test('a routed link is a plain mdast link node with only the wikilink class', () => {
  const dir = fixture(['some-file.md'])
  const cols = [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }]
  const link = resolveLink('some-file', cols)
  assert.equal(link.type, 'link')
  // No data-* attributes on routed links — the class is the only decoration.
  assert.deepEqual(link.data, { hProperties: { className: ['wikilink'] } })
})

test('a #heading fragment is dropped from resolution and display', () => {
  const dir = fixture(['some-file.md'])
  const cols = [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }]
  const link = resolveLink('some-file#Some Section', cols)
  assert.equal(link.type, 'link')
  assert.equal(link.url, '/posts/some-file')
  assert.equal(link.children[0].value, 'some-file')
})

test('a #^block-id fragment is dropped from resolution and display', () => {
  const dir = fixture(['some-file.md'])
  const cols = [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }]
  const link = resolveLink('some-file#^ab12', cols)
  assert.equal(link.type, 'link')
  assert.equal(link.url, '/posts/some-file')
  assert.equal(link.children[0].value, 'some-file')
})

test('an alias wins over a heading fragment', () => {
  const dir = fixture(['some-file.md'])
  const cols = [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }]
  const link = resolveLink('some-file#Section|My Label', cols)
  assert.equal(link.url, '/posts/some-file')
  assert.equal(link.children[0].value, 'My Label')
})

test('fragment-only [[#Heading]] stays literal text', () => {
  const dir = fixture(['some-file.md'])
  const cols = [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }]
  const node = resolveLink('#Section', cols)
  assert.equal(node.type, 'text')
  assert.equal(node.value, '[[#Section]]')
})

test('empty [[]] stays literal text', () => {
  const node = resolveLink('', [])
  assert.equal(node.type, 'text')
  assert.equal(node.value, '[[]]')
})

test('a fragment-only link between real links rides along as literal text', () => {
  const dir = fixture(['some-file.md'])
  const cols = [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }]
  const run = remarkWikilinks({
    collections: cols,
    warnOnCollision: false,
    danglingRefPolicy: 'warn',
  })
  const tree: any = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: 'before [[some-file]] mid [[#x]] after' }],
      },
    ],
  }
  run(tree)
  const children = tree.children[0].children
  assert.equal(children.length, 3)
  assert.equal(children[0].value, 'before ')
  assert.equal(children[1].type, 'link')
  assert.equal(children[2].value, ' mid [[#x]] after')
})

test('className option renames the class on relation and missing spans', () => {
  const dir = fixture(['a.md'])
  const cols = [{ name: 'people', dir, vaultDir: 'People', route: null }]
  const relation = resolveLink('a', cols, { className: 'wl' })
  assert.equal(relation.type, 'html')
  assert.match(relation.value, /class="wl"/)
  const missing = resolveLink('nope', cols, { className: 'wl' })
  assert.match(missing.value, /class="wl wl-missing"/)
})

test('a whitespace-only target stays literal text', () => {
  // markdown-render's tokenizer trims the target before the builder sees it,
  // so whitespace-only is indistinguishable from `[[]]` and stays literal
  // rather than reaching the dangling-link path.
  const node = resolveLink('   ', [])
  assert.equal(node.type, 'text')
  assert.equal(node.value, '[[   ]]')
})

test('an empty alias falls back to the default label', () => {
  // Changed with the delegation: `[[x|]]` used to keep the empty alias and
  // render an empty link label. markdown-render normalizes an empty alias away,
  // so the label falls back to the target's last path segment.
  const dir = fixture(['some-file.md'])
  const cols = [{ name: 'posts', dir, vaultDir: '00/posts', route: '/posts/:slug' }]
  const link = resolveLink('some-file|', cols)
  assert.equal(link.type, 'link')
  assert.equal(link.children[0].value, 'some-file')
})

test("danglingRefPolicy defaults to 'error' when omitted", () => {
  const dir = fixture(['a.md'])
  const cols = [{ name: 'posts', dir, vaultDir: 'Posts', route: '/posts/:slug' }]
  const run = remarkWikilinks({ collections: cols, warnOnCollision: false })
  const tree = {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: '[[does-not-exist]]' }] }],
  }
  assert.throws(() => run(tree), /does-not-exist/)
})

test('typographic quotes from smartypants still resolve links and media embeds', async () => {
  // Astro runs remark-smartypants before user plugins, so `[[Bob's Notes]]`
  // reaches this plugin as `Bob’s Notes`.
  const { default: remarkParse } = await import('remark-parse')
  const { default: remarkRehype } = await import('remark-rehype')
  const { default: rehypeStringify } = await import('rehype-stringify')
  const { unified } = await import('unified')
  const dir = fixture(["Bob's Notes.md"])
  const manifest = join(dir, 'assets.json')
  writeFileSync(manifest, JSON.stringify({ "Bob's clip.mp4": "Bob's clip.mp4" }))
  const html = String(
    unified()
      .use(remarkParse)
      .use(remarkWikilinks, {
        collections: [{ name: 'notes', dir, route: '/notes/:slug' }],
        warnOnCollision: false,
        assets: { manifest, publicBase: '/_media' },
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync('See [[Bob\u2019s Notes]].\n\n![[Bob\u2019s clip.mp4]]\n'),
  )
  assert.match(html, /<a href="\/notes\/Bob&#x27;s%20Notes"/)
  assert.match(html, /<video src="\/_media\/Bob&#x27;s%20clip\.mp4"/)
})

test('a [[file.pdf]] link to a published attachment links its copy, under the error policy', () => {
  const dir = fixture(['a.md'])
  const manifest = join(dir, 'assets.json')
  writeFileSync(manifest, JSON.stringify({ 'report.pdf': 'docs/report.pdf' }))
  const node = resolveLink('report.pdf', [{ name: 'notes', dir, route: '/notes/:slug' }], {
    danglingRefPolicy: 'error',
    assets: { manifest, publicBase: '/_media' },
  })
  assert.equal(node.type, 'link')
  assert.equal(node.url, '/_media/docs/report.pdf')
  assert.equal(node.children[0].value, 'report.pdf')
})

test('typed [[type/slug]] resolves through the collection type', () => {
  const dir = fixture(['rec.md'])
  const cols = [{ name: 'records', dir, route: '/r/:slug', type: 'health' }]
  assert.equal(resolveLink('health/rec', cols).url, '/r/rec')
})
