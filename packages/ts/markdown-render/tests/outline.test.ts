import { describe, expect, test } from 'vitest'
import { extractOutline, renderToHast } from '../src/index.ts'
import { html, vaultResolver } from './helpers.ts'

describe('heading ids', () => {
  test('ids are github-slugger slugs', async () => {
    const out = await html('# Hello There\n\n## A Sub-Heading!')
    expect(out).toContain('id="hello-there"')
    expect(out).toContain('id="a-sub-heading"')
  })

  test('duplicate headings get stable numbered suffixes', async () => {
    const out = await html('# Same\n\n# Same\n\n# Same')
    expect(out).toContain('id="same"')
    expect(out).toContain('id="same-1"')
    expect(out).toContain('id="same-2"')
  })

  test('the same document always slugs the same way', async () => {
    const source = '# One\n\n## Two\n\n# One'
    expect(await html(source)).toBe(await html(source))
  })

  test('a heading id is derived from rendered text, not source text', async () => {
    const out = await html('# See [[Some/Note|the note]]', {
      resolveLink: vaultResolver(['Some/Note']),
    })
    expect(out).toContain('id="see-the-note"')
  })

  test('a stripped comment does not leak into the slug', async () => {
    const out = await html('# Title %%hidden%%')
    expect(out).toContain('id="title"')
  })

  test('a block id anywhere in the note reserves its slug', async () => {
    // The `^foo` is the target of `#^foo` links and cannot move, so the
    // heading that would slug to the same string takes the suffix.
    const out = await html('para ^foo\n\n# Foo\n\ntext')
    expect(out).toContain('<p id="foo" data-block-id="foo"')
    expect(out).toContain('<h1 id="foo-1"')
    expect(out).not.toContain('<h1 id="foo"')
  })

  test('a block id on a later block still reserves the slug', async () => {
    const out = await html('# Foo\n\npara ^foo')
    expect(out).toContain('<p id="foo" data-block-id="foo"')
    expect(out).toContain('<h1 id="foo-1"')
  })

  test('a fence block id reserves its slug too', async () => {
    const out = await html('```ts\nx\n```\n^foo\n\n# Foo')
    expect(out).toContain('id="foo"')
    expect(out).toContain('<h1 id="foo-1"')
  })

  test('the outline points at the heading, not the block that shares its name', async () => {
    const tree = await renderToHast('para ^foo\n\n# Foo')
    expect(extractOutline(tree)).toEqual([{ depth: 1, text: 'Foo', id: 'foo-1' }])
  })

  test('a heading does not take the ids remark-rehype gives footnotes', async () => {
    const label = await html('# Footnote label\n\nText[^1]\n\n[^1]: note')
    expect(label).toContain('<h1 id="footnote-label-1"')
    expect(label.match(/id="footnote-label"/g)).toHaveLength(1)

    // The footnote's own ids carry a prefix no slug can spell, so a heading
    // that reads like one keeps its slug.
    const fn = await html('# User content fn 1\n\nText[^1]\n\n[^1]: note')
    expect(fn).toContain('<h1 id="user-content-fn-1"')
    expect(fn.match(/id="markdownRender_fn-1"/g)).toHaveLength(1)
  })

  test('a heading keeps its slug when no footnote id can equal it', async () => {
    // An unreferenced definition is never rendered, so it reserves nothing.
    const unused = await html('# User content fn 1\n\n[^1]: note')
    expect(unused).toContain('<h1 id="user-content-fn-1"')
    // `[^a.b]` renders as `markdownRender_fn-a.b`; the heading slugs to `…-ab`.
    const dotted = await html('# User content fn ab\n\nx[^a.b]\n\n[^a.b]: note')
    expect(dotted).toContain('<h1 id="user-content-fn-ab"')
    expect(dotted).toContain('id="markdownRender_fn-a.b"')
  })
})

describe('extractOutline', () => {
  test('collects every heading in document order with depth, text, and id', async () => {
    const tree = await renderToHast('# One\n\ntext\n\n## Two\n\n### Three\n\n# Four')
    expect(extractOutline(tree)).toEqual([
      { depth: 1, text: 'One', id: 'one' },
      { depth: 2, text: 'Two', id: 'two' },
      { depth: 3, text: 'Three', id: 'three' },
      { depth: 1, text: 'Four', id: 'four' },
    ])
  })

  test('headings nested inside callouts are still found', async () => {
    const tree = await renderToHast('> [!note] Title\n> # Inside')
    expect(extractOutline(tree).map((entry) => entry.text)).toEqual(['Inside'])
  })

  test('the outline ids match the ids on the page', async () => {
    const source = '# A\n\n# A'
    const tree = await renderToHast(source)
    const rendered = await html(source)
    for (const entry of extractOutline(tree)) {
      expect(rendered).toContain(`id="${entry.id}"`)
    }
  })

  test('the hidden GFM footnotes label is not an outline entry', async () => {
    // remark-gfm emits `<h2 class="sr-only" id="footnote-label">` for screen
    // readers. The author never wrote it and the page does not show it.
    const tree = await renderToHast('# Intro\n\nText[^1]\n\n## Usage\n\n[^1]: A note.\n')
    expect(extractOutline(tree)).toEqual([
      { depth: 1, text: 'Intro', id: 'intro' },
      { depth: 2, text: 'Usage', id: 'usage' },
    ])
  })

  test('a footnote reference in a heading is not part of its outline text', async () => {
    // The id is slugged from the heading's own text, so the outline text is too.
    const tree = await renderToHast('# Intro[^1]\n\nText.\n\n[^1]: A note.\n')
    expect(extractOutline(tree)[0]).toEqual({ depth: 1, text: 'Intro', id: 'intro' })
  })

  test('a document with no headings has an empty outline', async () => {
    expect(extractOutline(await renderToHast('just text'))).toEqual([])
  })
})

describe('headings without a slug', () => {
  test('get no id attribute rather than an empty one', async () => {
    for (const md of ['#', '# !!!']) {
      const out = await html(md)
      expect(out).not.toContain('id=')
    }
  })

  test('the outline entry carries an empty id, and later empty headings add no numbering', async () => {
    const tree = await renderToHast('# !!!\n\n# ???\n\n# Real')
    expect(extractOutline(tree).map((e) => e.id)).toEqual(['', '', 'real'])
  })
})
