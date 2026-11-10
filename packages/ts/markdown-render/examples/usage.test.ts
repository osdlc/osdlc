/**
 * The package used the way a consumer uses it: through its names only. Each
 * entry point and each group of stable exports appears here.
 */

import { describe, expect, test } from 'vitest'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { unified } from 'unified'

import {
  extractOutline,
  isSafeLinkPath,
  markdownSchema,
  renderToHast,
  renderToHtml,
  renderToHtmlSync,
  sliceByBlockId,
  sliceByHeading,
  sourceHeadings,
  stripMarkdownExt,
  type LinkResolution,
} from '@osdlc/markdown-render'
import {
  defaultResolver,
  embedKind,
  remarkCallouts,
  remarkEmbeds,
  remarkWikilinks,
  splitFragment,
} from '@osdlc/markdown-render/plugins'
import { rehypeShiki } from '@osdlc/markdown-render/shiki'

const notes = new Set(['Note', 'Folder/Other'])

/** A resolver backed by a set of note names. */
function resolveLink(target: string): LinkResolution {
  return notes.has(target)
    ? { kind: 'note', path: `/notes/${target}`, display: target }
    : { kind: 'missing', display: target }
}

describe('renderToHtml', () => {
  test('renders wikilinks, embeds, tags and callouts, resolving through the host', async () => {
    const html = await renderToHtml(
      'See [[Note#Part|the note]], [[Gone]] and #project/alpha.\n\n![[pic.png|200]]\n\n> [!tip] Title\n> body',
      { resolveLink, notePath: 'Journal/today.md' },
    )
    expect(html).toContain('href="/notes/Note"')
    expect(html).toContain('data-heading="Part"')
    expect(html).toContain('wikilink-missing')
    expect(html).toContain('data-tag="project/alpha"')
    expect(html).toContain('data-embed-kind="image"')
    expect(html).toContain('data-callout="tip"')
  })

  test('an alias that carries markup stays inside the link', async () => {
    const html = await renderToHtml('[[Note|the *key* idea]]', { resolveLink })
    expect(html).toContain('>the <em>key</em> idea</a>')
  })

  test('links in code stay literal, and the output is sanitized', async () => {
    const html = await renderToHtml('`[[Note]]` <script>alert(1)</script>', { resolveLink })
    expect(html).not.toContain('class="wikilink"')
    expect(html).not.toContain('<script')
  })

  test('renderToHtmlSync gives the same markup without a highlight pass', () => {
    expect(renderToHtmlSync('==marked==')).toContain('<mark>marked</mark>')
  })

  test('rehypeShiki highlights fenced code', async () => {
    const html = await renderToHtml('```ts\nconst answer = 42\n```', { highlight: rehypeShiki() })
    expect(html).toContain('style=')
  })
})

describe('renderToHast and the outline', () => {
  test('extractOutline reads heading ids off the rendered tree', async () => {
    const tree = await renderToHast('# One\n\n## Two\n')
    expect(extractOutline(tree).map((entry) => [entry.depth, entry.text, entry.id])).toEqual([
      [1, 'One', 'one'],
      [2, 'Two', 'two'],
    ])
  })
})

describe('the slicers', () => {
  const body = '# A\n\ntext ^anchor\n\n## B\n\nunder b\n'

  test('slice a section or a block out of a body', () => {
    expect(sliceByHeading(body, 'B')).toContain('under b')
    expect(sliceByBlockId(body, 'anchor')).toContain('text')
    expect(sourceHeadings(body).map((h) => h.heading)).toEqual(['A', 'B'])
  })
})

describe('helpers', () => {
  test('path and url helpers', () => {
    expect(stripMarkdownExt('Folder/Note.md')).toBe('Folder/Note')
    expect(isSafeLinkPath('javascript:alert(1)')).toBe(false)
    expect(markdownSchema.tagNames).toContain('markdown-embed')
  })
})

describe('/plugins in a bare unified pipeline', () => {
  test('wikilinks, embeds and callouts without the render stack', async () => {
    const file = await unified()
      .use(remarkParse)
      .use(remarkWikilinks, { resolveLink })
      .use(remarkEmbeds, { resolveLink })
      .use(remarkCallouts)
      .use(remarkRehype)
      .use(rehypeStringify)
      .process('[[Note]] and ![[Note]]\n\n> [!note]\n> body')
    const html = String(file)
    expect(html).toContain('class="wikilink"')
    expect(html).toContain('<markdown-embed')
    expect(html).toContain('class="callout"')
  })

  test('the small helpers', () => {
    expect(splitFragment('^abc')).toEqual({ blockId: 'abc' })
    expect(embedKind('doc.pdf', {}, 'note')).toBe('pdf')
    expect(defaultResolver('Folder/Note').display).toBe('Note')
  })
})
