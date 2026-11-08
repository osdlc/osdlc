/**
 * Benchmarks for the vault-to-Astro transform and the build-time remark plugin, on a generated
 * vault: notes with wikilinks, embeds (image, media, note, heading), markdown links, code spans
 * and fences, callouts and frontmatter, plus assets. The vault is deterministic and has no real
 * content. Run with `pnpm run bench`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { afterAll, test } from 'vitest'

import type { MarkdownAstroConfig } from '../src/config.ts'
import { remarkWikilinks } from '../src/remark-wikilinks.ts'
import { transform } from '../src/run.ts'

const NOTES = 200
const IMAGES = 20

/** A small deterministic generator (mulberry32), so every run builds the same vault. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function noteBody(i: number, rand: () => number): string {
  const pick = (n: number) => Math.floor(rand() * n)
  const lines = [
    '---',
    `title: Note ${i}`,
    `cover: "[[image-${pick(IMAGES)}.png]]"`,
    'tags: [a, b]',
    '---',
    '',
  ]
  for (let p = 0; p < 12; p++) {
    lines.push(
      `Paragraph ${p} links to [[note-${pick(NOTES)}]], [[note-${pick(NOTES)}|an alias]] and ` +
        `[[note-${pick(NOTES)}#Heading]], with \`[[in-code]]\` and a [link](note-${pick(NOTES)}.md).`,
      '',
    )
    if (p % 3 === 0) lines.push(`![[image-${pick(IMAGES)}.png]]`, '')
    if (p % 4 === 0) lines.push(`![[image-${pick(IMAGES)}.png|300]]`, '')
    if (p % 5 === 0) lines.push(`![[note-${pick(NOTES)}#Heading]]`, '')
    if (p % 6 === 0) lines.push('> [!note] A callout', '> with a [[wikilink]].', '')
    if (p % 7 === 0) lines.push('```ts', 'const s = "![[not-an-embed]]"', '```', '')
  }
  lines.push('## Heading', '', 'The end.', '')
  return lines.join('\n')
}

const root = mkdtempSync(join(tmpdir(), 'markdown-astro-bench-'))
const vault = join(root, 'vault')
mkdirSync(join(vault, 'Notes'), { recursive: true })
mkdirSync(join(vault, '_attachments'), { recursive: true })
const rand = rng(20261108)
for (let i = 0; i < NOTES; i++)
  writeFileSync(join(vault, 'Notes', `note-${i}.md`), noteBody(i, rand))
for (let i = 0; i < IMAGES; i++) writeFileSync(join(vault, '_attachments', `image-${i}.png`), 'png')

const config: MarkdownAstroConfig = {
  astroRoot: join(root, 'site'),
  vault,
  assets: { publicDir: 'public/_media', publicBase: '/_media', vaultDir: '_attachments' },
  frontmatterAssets: ['cover'],
  collections: [
    { name: 'notes', vaultDir: 'Notes', contentDir: 'src/content/notes', route: '/notes/:slug' },
  ],
  danglingRefPolicy: 'warn',
}

transform(config)
const sample = noteBody(0, rng(1))
const processor = unified()
  .use(remarkParse)
  .use(remarkWikilinks, {
    collections: [
      {
        name: 'notes',
        dir: join(config.astroRoot, 'src/content/notes'),
        vaultDir: 'Notes',
        route: '/notes/:slug',
      },
    ],
    warnOnCollision: false,
    danglingRefPolicy: 'warn',
    assets: {
      manifest: join(config.astroRoot, '.markdown-astro/assets.json'),
      publicBase: '/_media',
    },
  })
  .use(remarkRehype)
  .use(rehypeStringify)

afterAll(() => rmSync(root, { recursive: true, force: true }))

/**
 * Time each case in turn, in the shape of the other packages' gated benchmarks (one test, its
 * `bench` fixture, a record of named cases), so this file joins the perf gate unchanged. It uses
 * its own generated vault until the shared corpus is available here.
 */
test('markdown-astro', async ({ bench }) => {
  const cases: Record<string, () => void> = {
    'transform: 200 notes, 20 assets': () => {
      transform(config, { verbose: false })
    },
    'remarkWikilinks: one note, with embeds': () => {
      processor.processSync(sample)
    },
  }
  for (const [name, fn] of Object.entries(cases)) await bench(name, fn).run()
})
