import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_EMBED_DEPTH, MAX_EMBEDS_PER_DOCUMENT } from '@osdlc/markdown-render/plugins'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { remarkWikilinks } from '../src/remark-wikilinks.ts'
import type { RemarkWikilinksOptions } from '../src/remark-wikilinks.ts'

/** Write `files` under a fresh temp dir and return its path. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'oa-embed-'))
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return root
}

const notes = tree({
  'host.md': '---\ntitle: Host\n---\n\nhost body\n',
  'embedded.md': [
    '---',
    'title: Embedded',
    '---',
    '',
    'Intro links [[host]].',
    '',
    '## Part',
    '',
    'Part text.',
    '',
    '## Other',
    '',
    'A quoted block ^blk',
    '',
  ].join('\n'),
  'loop.md': '![[loop]]\n',
  'ping.md': '![[pong]]\n',
  'pong.md': '![[ping]]\n',
  'd1.md': 'level-1\n\n![[d2]]\n',
  'd2.md': 'level-2\n\n![[d3]]\n',
  'd3.md': 'level-3\n\n![[d4]]\n',
  'd4.md': 'level-4\n\n![[d5]]\n',
  'd5.md': 'level-5\n\n![[d6]]\n',
  'd6.md': 'level-6\n',
  'tiny.md': 'tiny\n',
  'refs.md':
    'Embedded [ref] and a note[^1].\n\n[ref]: https://embedded.example\n\n[^1]: embedded footnote\n',
  'table.md': '| a | b |\n| - | - |\n| 1 | 2 |\n',
})

// The manifest the transform writes: embed target -> path under the public dir.
const manifest = join(
  tree({
    'assets.json': JSON.stringify({
      'clip.mp4': 'clip.mp4',
      'song.mp3': 'media/song.mp3',
      'doc.pdf': 'doc.pdf',
      'pic.png': 'pic.png',
      'data.csv': 'data.csv',
    }),
  }),
  'assets.json',
)

const options: RemarkWikilinksOptions = {
  collections: [{ name: 'notes', dir: notes, vaultDir: 'Notes', route: '/notes/:slug' }],
  warnOnCollision: false,
  danglingRefPolicy: 'warn',
  assets: { manifest, publicBase: '/_media' },
}

/**
 * Render `markdown` through the plugin the way an Astro build does. `page` is
 * the page's file under `notes`, or `null` for a file with no path.
 */
function render(
  markdown: string,
  page: string | null = 'host.md',
  opts: RemarkWikilinksOptions = options,
  gfm = true,
): string {
  const processor = unified()
    .use(remarkParse)
    .use(gfm ? [remarkGfm] : [])
    .use(remarkWikilinks, opts)
    .use(remarkRehype)
    .use(rehypeStringify)
  const file = page === null ? { value: markdown } : { path: join(notes, page), value: markdown }
  return String(processor.processSync(file))
}

// remarkEmbeds names its node with a custom element, and this host finds the
// node by that name. If the two disagree, every embed is left as an inert
// element; this pins that each kind is rendered, and none survives.
test('no embed kind is left as the unrendered custom element', () => {
  const html = render(
    [
      '![[pic.png]]',
      '![[clip.mp4]]',
      '![[doc.pdf]]',
      '![[embedded]]',
      '![[embedded#Part]]',
      '![[nope]]',
    ].join('\n\n'),
  )
  assert.doesNotMatch(html, /<markdown-embed/)
  assert.match(html, /<img src="\/_media\/pic\.png"/)
  assert.match(html, /markdown-embed-note/)
})

test('a video embed renders a <video> at the public URL, sized like the app', () => {
  assert.equal(
    render('![[clip.mp4|300]]'),
    '<video src="/_media/clip.mp4" data-embed-target="clip.mp4" class="markdown-embed markdown-embed-video" controls width="300"></video>',
  )
})

test('an audio embed renders an <audio> with controls at its manifest path', () => {
  assert.equal(
    render('![[song.mp3]]'),
    '<audio src="/_media/media/song.mp3" data-embed-target="song.mp3" class="markdown-embed markdown-embed-audio" controls></audio>',
  )
})

test('a PDF embed renders a link, not a frame', () => {
  assert.equal(
    render('![[doc.pdf|The spec]]'),
    '<a class="markdown-embed markdown-embed-pdf" href="/_media/doc.pdf" target="_blank" rel="noopener noreferrer" data-embed-target="doc.pdf">The spec</a>',
  )
})

test('a PDF page fragment is still a PDF', () => {
  assert.match(
    render('![[doc.pdf#page=3]]'),
    /<a class="markdown-embed markdown-embed-pdf" href="\/_media\/doc\.pdf#page=3"/,
  )
})

test('a sized image embed, left for the build, renders an <img> with its size', () => {
  assert.equal(
    render('![[pic.png|300x200]]'),
    '<img src="/_media/pic.png" data-embed-target="pic.png" class="markdown-embed markdown-embed-image" alt="pic.png" width="300" height="200">',
  )
})

test('an alt|size display is sized, with the label as alt', () => {
  assert.match(
    render('![[pic.png|A caption|300]]'),
    /<img src="\/_media\/pic\.png"[^>]* alt="A caption" width="300">/,
  )
})

test('a file with no media extension that is published renders as an image', () => {
  assert.match(render('![[data.csv]]'), /<img src="\/_media\/data\.csv"/)
})

test('a note embed renders the note body inline, links in it resolved', () => {
  const html = render('![[embedded]]')
  assert.match(
    html,
    /^<div class="markdown-embed markdown-embed-note" data-embed-target="embedded">/,
  )
  assert.match(html, /<a href="\/notes\/host" class="wikilink">host<\/a>/)
  assert.match(html, /Part text\./)
  assert.doesNotMatch(html, /title: Embedded/)
})

test('a heading embed renders only that section', () => {
  const html = render('![[embedded#Part]]')
  assert.match(html, /<h2>Part<\/h2>/)
  assert.match(html, /Part text\./)
  assert.doesNotMatch(html, /Intro links/)
  assert.doesNotMatch(html, /Other/)
})

test('a block embed renders only that block', () => {
  const html = render('![[embedded#^blk]]')
  assert.match(html, /A quoted block/)
  assert.doesNotMatch(html, /Part text/)
})

test('a missing media file renders the missing-attachment placeholder', () => {
  assert.equal(
    render('![[nope.mp4]]'),
    '<div class="markdown-embed markdown-embed-missing" data-embed-target="nope.mp4">Missing attachment: nope.mp4</div>',
  )
  assert.match(render('![[other.png|300]]'), /Missing attachment: other\.png/)
})

test('without asset options every media embed is a missing attachment', () => {
  const { assets: _assets, ...noAssets } = options
  assert.match(render('![[clip.mp4]]', 'host.md', noAssets), /Missing attachment: clip\.mp4/)
})

test('a missing note or section renders the missing-embed placeholder', () => {
  assert.match(
    render('![[nope]]'),
    /markdown-embed-missing" data-embed-target="nope">Missing embed: nope</,
  )
  assert.match(render('![[embedded#No such heading]]'), /Missing embed: embedded/)
})

test('a note that embeds itself stops with the cycle placeholder', () => {
  assert.match(render('![[loop]]', 'loop.md'), /markdown-embed-cycle[^>]*>Circular embed: loop</)
  // One hop away: ping shows pong, whose embed of ping is the cycle.
  const html = render('![[pong]]', 'ping.md')
  assert.match(html, /markdown-embed-note" data-embed-target="pong"/)
  assert.match(html, /Circular embed: ping/)
})

test('a same-note embed renders the cycle placeholder, as in the app', () => {
  assert.match(render('![[#Part]]', 'embedded.md'), /markdown-embed-cycle/)
})

test('without a file path the page is not an ancestor, and a loop still stops', () => {
  const html = render('![[loop]]', null)
  assert.equal(html.match(/markdown-embed-note/g)?.length, 1)
  assert.match(html, /Circular embed: loop/)
  assert.match(render('![[tiny]]', null), /markdown-embed-note[^>]*><p>tiny<\/p>/)
})

test('nesting stops at the depth cap', () => {
  // The page is ancestor 1, so d1 to d4 render and d5 is one level too deep.
  const html = render('![[d1]]', 'host.md')
  assert.match(html, /level-4/)
  assert.doesNotMatch(html, /level-5/)
  assert.match(
    html,
    new RegExp(`markdown-embed-too-deep[^>]*>Embed nested deeper than ${MAX_EMBED_DEPTH}<`),
  )
})

test('a page past the transclusion budget says so for each extra embed', () => {
  const html = render(
    Array.from({ length: MAX_EMBEDS_PER_DOCUMENT + 2 }, () => '![[tiny]]').join('\n\n'),
  )
  assert.equal(html.match(/markdown-embed-note/g)?.length, MAX_EMBEDS_PER_DOCUMENT)
  assert.equal(html.match(/Too many embeds in this note: tiny/g)?.length, 2)
})

test("an embedded note's link definitions and footnotes stay its own", () => {
  const html = render(
    'Host [ref] and a note[^1].\n\n![[refs]]\n\n[ref]: https://host.example\n\n[^1]: host footnote\n',
  )
  assert.match(html, /Host <a href="https:\/\/host\.example">ref<\/a>/)
  assert.match(html, /Embedded <a href="https:\/\/embedded\.example">ref<\/a>/)
  assert.match(html, /host footnote/)
  assert.match(html, /embedded footnote/)
})

test("embedded text is parsed by the host's parser, with its extensions", () => {
  assert.match(render('![[table]]'), /<table>/)
  assert.doesNotMatch(render('![[table]]', 'host.md', options, false), /<table>/)
})

test('run outside a processor, a note embed renders the inert placeholder', () => {
  const run = remarkWikilinks.call(undefined, options)
  const mdast: any = {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: '![[tiny]]' }] }],
  }
  run(mdast)
  assert.deepEqual(mdast.children[0].data.hProperties, {
    className: ['markdown-embed', 'markdown-embed-inert'],
    dataEmbedTarget: 'tiny',
  })
})

test('an embed in code stays as written', () => {
  const html = render('`![[clip.mp4]]`\n\n```\n![[embedded]]\n```')
  assert.match(html, /<code>!\[\[clip\.mp4\]\]<\/code>/)
  assert.match(html, /<code>!\[\[embedded\]\]\n<\/code>/)
  assert.doesNotMatch(html, /markdown-embed/)
})
