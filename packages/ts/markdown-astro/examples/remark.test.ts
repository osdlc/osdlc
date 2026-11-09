import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { expect, test } from 'vitest'

// The README examples, run through the package names the way a consumer imports them.
import { remarkWikilinks, remarkWikilinksFromConfig } from '@osdlc/markdown-astro'
import { remarkWikilinks as fromSubpath } from '@osdlc/markdown-astro/remark'

function site(): string {
  const root = mkdtempSync(join(tmpdir(), 'markdown-astro-example-'))
  mkdirSync(join(root, 'src/content/posts'), { recursive: true })
  writeFileSync(join(root, 'src/content/posts/hello.md'), 'Hello\n')
  writeFileSync(
    join(root, 'markdown-astro.config.yaml'),
    [
      'collections:',
      '  - { name: posts, vaultDir: Posts, contentDir: src/content/posts, route: /posts/:slug }',
      '',
    ].join('\n'),
  )
  return root
}

function html(plugin: unknown, markdown: string): string {
  const [attacher, options] = plugin as [never, never]
  return String(
    unified()
      .use(remarkParse)
      .use(attacher, options)
      .use(remarkRehype)
      .use(rehypeStringify)
      .processSync(markdown),
  )
}

test('README: a wikilink to a note in a routed collection becomes a link', () => {
  const root = site()
  const collections = [
    {
      name: 'posts',
      dir: join(root, 'src/content/posts'),
      vaultDir: 'Posts',
      route: '/posts/:slug',
    },
  ]
  expect(html([remarkWikilinks, { collections }], 'See [[hello]].')).toBe(
    '<p>See <a href="/posts/hello" class="wikilink">hello</a>.</p>',
  )
  expect(fromSubpath).toBe(remarkWikilinks)
})

test('README: remarkWikilinksFromConfig builds the same plugin from the config, with a vault', () => {
  const root = site()
  const plugin = remarkWikilinksFromConfig(join(root, 'markdown-astro.config.yaml'), {
    vault: join(root, 'elsewhere'),
  })
  expect(html(plugin, 'See [[hello]].')).toContain('<a href="/posts/hello"')
})
