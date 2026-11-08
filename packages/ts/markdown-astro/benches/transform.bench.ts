/**
 * Gated benchmarks for the vault-to-Astro transform and the build-time remark plugin, on the
 * shared synthetic corpus (bench/README.md). The corpus is written to a temporary vault for
 * `transform`; the remark plugin runs over the same bodies. The corpus's ReDoS cases time the
 * plugin on pathological input.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { afterAll, test } from 'vitest'

import { corpus } from '../../../../bench/corpus/index.ts'
import { runCases } from '../../../../bench/suite.ts'
import type { MarkdownAstroConfig } from '../src/config.ts'
import { remarkWikilinks } from '../src/remark-wikilinks.ts'
import { transform } from '../src/run.ts'

const { notes, largest, slow } = corpus()

const root = mkdtempSync(join(tmpdir(), 'markdown-astro-bench-'))
const vault = join(root, 'vault')
for (const note of notes) {
  const file = join(vault, 'Notes', note.path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, note.text)
}

const config: MarkdownAstroConfig = {
  astroRoot: join(root, 'site'),
  vault,
  assets: { publicDir: 'public/_media', publicBase: '/_media', vaultDir: '_attachments' },
  frontmatterAssets: [],
  collections: [
    { name: 'notes', vaultDir: 'Notes', contentDir: 'src/content/notes', route: '/notes/:slug' },
  ],
  danglingRefPolicy: 'warn',
}

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
  })
  .use(remarkRehype)
  .use(rehypeStringify)

afterAll(() => rmSync(root, { recursive: true, force: true }))

test('transform', ({ bench }) =>
  runCases(bench, {
    vault: () => {
      transform(config, { verbose: false })
    },
  }))

test('remarkWikilinks', ({ bench }) => {
  const warn = console.warn
  console.warn = () => {}
  return runCases(bench, {
    'largest-note': () => {
      processor.processSync(largest)
    },
    ...Object.fromEntries(
      slow
        .filter(({ name }) => name.startsWith('slow/redos-'))
        .map(({ name, body }) => [
          name,
          () => {
            processor.processSync(body)
          },
        ]),
    ),
  }).finally(() => {
    console.warn = warn
  })
})
