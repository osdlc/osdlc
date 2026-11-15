import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { remarkWikilinksFromConfig } from '../src/index.ts'
import { remarkWikilinks } from '../src/remark-wikilinks.ts'
import { slugify } from '../src/slug.ts'
import { pathKey } from '../src/wikilink-ref.ts'

test('slugify keeps letters of any script, drops marks and quotes, joins words with -', () => {
  expect(slugify('  Bob\'s "Notes" ')).toBe('bobs-notes')
  expect(slugify('Café Münchën')).toBe('cafe-munchen')
  expect(slugify('Bob\u2019s Notes')).toBe('bobs-notes')
  expect(slugify('東京 2026')).toBe('東京-2026')
  expect(slugify('---')).toBe('')
})

test('pathKey keys each segment, resolves . and .., drops .md and empty segments', () => {
  expect(pathKey('Folder/Some File.md')).toBe('folder/some-file')
  expect(pathKey('./a/../b')).toBe('b')
  expect(pathKey('../Journal/note')).toBe('journal/note')
  expect(pathKey('a//b')).toBe('a/b')
  expect(pathKey('a/b')).not.toBe(pathKey('a-b'))
  expect(pathKey('Bob’s Notes')).toBe('bobs-notes')
})

test('remarkWikilinksFromConfig reads the config, and a vault option is not a plugin option', () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-api-'))
  mkdirSync(join(root, 'src/content/posts'), { recursive: true })
  const path = join(root, 'markdown-vault-astro.config.yaml')
  writeFileSync(
    path,
    [
      'assets: { publicDir: public/_media, publicBase: /_media, vaultDir: _attachments }',
      'collections:',
      '  - { name: posts, vaultDir: Posts, contentDir: src/content/posts, route: /posts/:slug }',
      '',
    ].join('\n'),
  )

  const [attacher, options] = remarkWikilinksFromConfig(path, {
    vault: join(root, 'other-vault'),
    className: 'ref',
  })

  expect(attacher).toBe(remarkWikilinks)
  expect(options).not.toHaveProperty('vault')
  expect(options.className).toBe('ref')
  expect(options.collections).toEqual([
    {
      name: 'posts',
      dir: join(root, 'src/content/posts'),
      vaultDir: 'Posts',
      route: '/posts/:slug',
    },
  ])
  expect(options.assets).toEqual({
    manifest: join(root, '.markdown-vault-astro/assets.json'),
    publicBase: '/_media',
  })
})

test('the README lists exactly the exports tagged @experimental', () => {
  const srcDir = fileURLToPath(new URL('../src/', import.meta.url))
  const tagged: string[] = []
  for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.ts'))) {
    const text = readFileSync(join(srcDir, file), 'utf8')
    for (const m of text.matchAll(/@experimental[^]*?\*\/\s*export (?:async )?function (\w+)/g)) {
      tagged.push(m[1]!)
    }
  }

  const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8')
  const section = /## API stability\n([^]*?)\n## /.exec(readme)?.[1] ?? ''
  const listed = /Experimental: ([^\n]+)/.exec(section)?.[1] ?? ''
  const names = [...listed.matchAll(/`(\w+)`/g)].map((m) => m[1]!)

  expect(tagged.length).toBeGreaterThan(0)
  expect(names.sort()).toEqual(tagged.sort())
})
