import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { corpus, slowInputs } from './index.ts'

const digest = (parts: string[]): string => createHash('sha256').update(parts.join('\0')).digest('hex')

test('the corpus is deterministic: one seed, the same bytes', () => {
  assert.equal(digest(corpus().bodies), digest(corpus().bodies))
  assert.notEqual(digest(corpus().bodies), digest(corpus({ seed: 1 }).bodies))
})

test('the vault has the shape of a real one', () => {
  const c = corpus()
  assert.equal(c.notes.length, 1200)
  const sizes = c.bodies.map((b) => b.length).sort((a, b) => a - b)
  const median = sizes[sizes.length >> 1] as number
  assert.ok(median > 1200 && median < 4000, `median note is ${median} bytes`)
  assert.ok((sizes.at(-1) as number) > 20_000, 'there are some large notes')
  assert.equal(c.largest.length, sizes.at(-1))
  const all = c.bodies.join('\n')
  const perKiB = (re: RegExp): number => (all.match(re)?.length ?? 0) / (all.length / 1024)
  const within = (name: string, v: number, lo: number, hi: number): void =>
    assert.ok(v >= lo && v <= hi, `${name} per KiB is ${v.toFixed(2)}, wanted ${lo} to ${hi}`)
  within('wikilinks', perKiB(/(?<!!)\[\[/g), 2, 6)
  within('embeds', perKiB(/!\[\[/g), 0.1, 1)
  within('markdown links', perKiB(/\]\([^)]+\)/g), 0.3, 1.5)
  within('tags', perKiB(/(?<=\s)#[\p{L}\p{N}_/-]+/gu), 1, 4)
  within('fences', perKiB(/^(```|~~~)/gm) / 2, 0.1, 1)
  within('callouts', perKiB(/^> \[!/gm), 0.1, 1)
})

test('every construct is present, including the tricky ones', () => {
  const all = corpus().bodies.join('\n')
  for (const [what, re] of [
    ['alias', /\[\[[^\]|]+\|[^\]]+\]\]/],
    ['heading link', /\[\[[^\]#]+#[^\]^]+\]\]/],
    ['block link', /\[\[[^\]#]+#\^[^\]]+\]\]/],
    ['self link', /\[\[#[^\]]+\]\]/],
    ['sized embed', /!\[\[[^\]|]+\|\d+x\d+\]\]/],
    ['escaped pipe in a table', /\[\[[^\]]+\\\|[^\]]+\]\]/],
    ['nested tag', /#\w+\/\w+/],
    ['unicode tag', /#(café|日本語)/],
    ['link in a code span', /`\[\[[^\]]+\]\]`/],
    ['tag in a code span', /`#[^`]+`/],
    ['fenced block', /^```\w*\n/m],
    ['tilde fence', /^~~~/m],
    ['callout', /^> \[!\w+\]-? /m],
    ['html comment', /<!-- .* -->/],
    ['markdown link with fragment', /\]\([^)]*\.md#[^)]+\)/],
    ['external link', /\]\(https:\/\//],
    ['url with a fragment', /https:\/\/example\.com\/page#/],
  ] as const) {
    assert.match(all, re, what)
  }
  assert.ok(corpus().notes.every((n) => n.text.startsWith('---\n') && n.text.includes('\n---\n')), 'frontmatter')
})

test('the slow inputs cover markdown-link and the ReDoS cases', () => {
  const names = slowInputs().map((s) => s.name)
  assert.equal(new Set(names).size, names.length)
  for (const n of ['slow/failed-md-link-open', 'slow/many-short-wikilinks', 'slow/redos-wikilink-1600', 'slow/unterminated-openers']) {
    assert.ok(names.includes(n), n)
  }
})
