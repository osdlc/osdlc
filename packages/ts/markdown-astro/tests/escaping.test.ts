import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { test } from 'vitest'
import { unified } from 'unified'

import { remarkWikilinks } from '../src/remark-wikilinks.ts'

const dir = mkdtempSync(join(tmpdir(), 'oa-escape-'))
const manifest = join(dir, 'assets.json')
writeFileSync(
  manifest,
  JSON.stringify({
    'say "hi".mp4': 'say "hi".mp4',
    'a&b"c.pdf': 'a&b"c.pdf',
    "it's.mp3": "it's.mp3",
  }),
)

function render(md: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkWikilinks, {
        collections: [{ name: 'a"b', dir, route: null }],
        warnOnCollision: false,
        danglingRefPolicy: 'warn',
        assets: { manifest, publicBase: '/_media' },
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(md),
  )
}

test('a quote in an embedded asset name stays inside its attributes', () => {
  assert.equal(
    render('![[say "hi".mp4]]'),
    '<video src="/_media/say%20%22hi%22.mp4" data-embed-target="say &#x22;hi&#x22;.mp4" class="markdown-embed markdown-embed-video" controls></video>',
  )
})

test('a quote and an ampersand in a PDF or audio name are escaped', () => {
  const pdf = render('![[a&b"c.pdf]]')
  assert.match(pdf, /href="\/_media\/a%26b%22c\.pdf" target="_blank"/)
  assert.match(pdf, /data-embed-target="a&#x26;b&#x22;c\.pdf"/)
  const audio = render("![[it's.mp3]]")
  assert.ok(audio.startsWith('<audio src="/_media/'))
})

test('a quote, tag or collection name with a quote is escaped in the wikilink spans', () => {
  const missing = render('[[x" onmouseover="alert(1)]]')
  assert.ok(!missing.includes('" onmouseover="'))
  assert.match(missing, /wikilink-missing/)
})

test('a collection name with a quote is escaped in a resolved relation span', () => {
  writeFileSync(join(dir, 'note.md'), '# note\n')
  const html = render('[[note]]')
  assert.match(html, /data-collection="a&quot;b"/)
  assert.ok(!html.includes('data-collection="a"b"'))
})

test('an alias with markup still links when the processor passes the source file', () => {
  const html = String(
    unified()
      .use(remarkParse)
      .use(remarkWikilinks, {
        collections: [{ name: 'notes', dir, route: null }],
        warnOnCollision: false,
        danglingRefPolicy: 'warn',
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync('See [[nowhere|*Ada* and `x`]].'),
  )
  assert.match(html, /wikilink/)
  assert.ok(!html.includes('[['))
})
