import { describe, expect, test } from 'vitest'
import { BLOCK_ID_RE } from '../src/index.ts'
import { html } from './helpers.ts'

describe('remarkBlockIds', () => {
  test('a trailing marker becomes id + data-block-id on the paragraph', async () => {
    const out = await html('A paragraph. ^abc123')
    expect(out).toContain('id="abc123"')
    expect(out).toContain('data-block-id="abc123"')
    expect(out).not.toContain('^abc123')
    expect(out).toContain('A paragraph.')
  })

  test('the marker text is removed with its leading space', async () => {
    const out = await html('A paragraph. ^abc')
    expect(out).toContain('>A paragraph.<')
  })

  test('a standalone marker attaches to the block above it', async () => {
    const out = await html('> a quote\n\n^quoteid')
    expect(out).toContain('data-block-id="quoteid"')
    expect(out).toContain('<blockquote')
    expect(out.match(/<p/g)?.length ?? 0).toBeLessThan(2)
  })

  test('a list item can own a block id', async () => {
    const out = await html('- one\n- two ^itemid')
    expect(out).toContain('data-block-id="itemid"')
  })

  test('a marker on a nested list item goes to that item, not its parent', async () => {
    const out = await html('- a\n  - b ^abc')
    expect(out).toMatch(/<li data-line="1">a\s*<ul[^>]*>\s*<li[^>]*id="abc"[^>]*>b<\/li>/)
    expect(out.match(/data-block-id/g)).toHaveLength(1)
  })

  test('a marker on a list item inside a callout goes to the item', async () => {
    const out = await html('> [!note] T\n> - x ^q')
    expect(out).toMatch(/<li[^>]*data-block-id="q"[^>]*>x<\/li>/)
    expect(out.match(/data-block-id/g)).toHaveLength(1)
  })

  test('a marker on the continuation line of a paragraph owns it', async () => {
    const out = await html('para\n^abc')
    expect(out).toContain('data-block-id="abc"')
    expect(out).not.toContain('^abc')
    expect(out).toMatch(/>para<\/p>/)
    const item = await html('- item\n  ^abc')
    expect(item).toMatch(/<li[^>]*data-block-id="abc"[^>]*>item<\/li>/)
  })

  test('a mid-line caret is NOT a block id (D-0008)', async () => {
    const out = await html('a ^notanid b')
    expect(out).not.toContain('data-block-id')
    expect(out).toContain('^notanid')
  })

  test('a caret inside inline markup is not a block id and keeps its text', async () => {
    // Review finding #1: the marker is followed by `**`, so it is not
    // line-terminal. Taking the deepest last text node deleted `^id` from
    // inside the bold run and minted an id from it.
    const out = await html('text **bold ^id** tail')
    expect(out).not.toContain('data-block-id')
    expect(out).toContain('<strong>bold ^id</strong>')
  })

  test('a caret inside a link label is not a block id', async () => {
    const out = await html('text [label ^id](https://example.com)')
    expect(out).not.toContain('data-block-id')
    expect(out).toContain('label ^id')
  })

  test('a caret inside a list item emphasis is not a block id', async () => {
    const out = await html('- item *em ^id*')
    expect(out).not.toContain('data-block-id')
    expect(out).toContain('em ^id')
  })

  test('a caret in a table cell is not a block id', async () => {
    const out = await html('| a | b |\n|---|---|\n| c | d ^id |')
    expect(out).not.toContain('data-block-id')
    expect(out).toContain('d ^id')
  })

  test('a marker after inline markup still owns the block', async () => {
    const out = await html('Prefix *see* suffix ^abc')
    expect(out).toContain('data-block-id="abc"')
    expect(out).toContain('<em>see</em>')
  })

  test('a blockquote marker still reaches the blockquote', async () => {
    const out = await html('> quote ^qid')
    expect(out).toContain('data-block-id="qid"')
    expect(out).not.toContain('^qid')
  })

  test('a caret in code is untouched', async () => {
    const out = await html('literal `x ^abc` here')
    expect(out).not.toContain('data-block-id')
  })

  test('a heading can own a block id', async () => {
    const out = await html('# Title ^headid')
    expect(out).toContain('data-block-id="headid"')
    expect(out).toContain('id="headid"')
  })

  test('a block id on a heading suppresses the slug id', async () => {
    const out = await html('# Title ^headid')
    expect(out).not.toContain('id="title"')
  })

  test('a standalone marker with no block above it stays literal text', async () => {
    const out = await html('^abc')
    expect(out).toContain('^abc')
    expect(out).not.toContain('data-block-id')
  })

  test('a standalone marker first inside a container stays literal text', async () => {
    const quote = await html('> ^abc')
    expect(quote).toContain('^abc')
    expect(quote).not.toContain('data-block-id')
    const item = await html('- ^abc')
    expect(item).toContain('^abc')
    expect(item).not.toContain('data-block-id')
  })

  test('a callout whose whole body is a marker keeps it as literal text', async () => {
    const out = await html('> [!note]\n> ^abc')
    expect(out).toContain('^abc')
    expect(out).not.toContain('data-block-id')
  })

  test('a titled callout whose body is only a marker keeps it as literal text', async () => {
    const out = await html('> [!note] Title\n> ^abc')
    expect(out).toContain('^abc')
    expect(out).not.toContain('data-block-id')
  })

  test('a marker on its own line inside a paragraph owns that paragraph', async () => {
    // sliceByBlockId reads the same line as the end of block `abc`, so the
    // renderer must agree that the paragraph is the block.
    const out = await html('text\n^abc')
    expect(out).toContain('id="abc"')
    expect(out).not.toContain('^abc')
    expect(out).toMatch(/>text<\/p>/)
  })

  test('the exported BLOCK_ID_RE still reads a single line', () => {
    // Hosts run it on whole strings; the paragraph pass applies it per line.
    expect(BLOCK_ID_RE.exec('text\n^abc')).toBeNull()
    expect(BLOCK_ID_RE.exec('text ^abc')?.[1]).toBe('abc')
  })

  test('a paragraph made only of marker lines stays literal text', async () => {
    const out = await html('para\n\n^abc\n^def')
    expect(out).toContain('^abc')
    expect(out).toContain('^def')
    expect(out).not.toContain('data-block-id')
  })

  test('a trailing marker on a tight item with a nested list anchors the item', async () => {
    // remark-rehype unwraps a tight item's paragraph, so an id put on the
    // paragraph would vanish along with the marker.
    const out = await html('- a ^x\n  - b')
    expect(out).toMatch(/<li id="x" data-block-id="x"[^>]*>a\s*<ul/)
    expect(out).not.toContain('^x')
  })

  test('a trailing marker on a nested list item stays on that item', async () => {
    const out = await html('- a\n  - b ^abc\n- c')
    expect(out).toMatch(/<li id="abc" data-block-id="abc"[^>]*>b<\/li>/)
    expect(out.match(/data-block-id/g)?.length).toBe(1)
  })

  test('a trailing marker on a list item inside a quote stays on the item', async () => {
    const out = await html('> - x\n> - y ^q')
    expect(out).toMatch(/<li id="q" data-block-id="q"[^>]*>y<\/li>/)
    expect(out).not.toMatch(/<blockquote[^>]*id=/)
  })

  test('a trailing marker under a quote or heading in an item stays on the item', async () => {
    // Only a nested list stops the descent; `sliceByBlockId` takes the whole
    // item's lines for these, so the item is the block.
    for (const source of ['- a\n  > q ^x', '- # H ^x']) {
      const out = await html(source)
      expect(out).toMatch(/<li id="x" data-block-id="x"/)
      expect(out.match(/data-block-id/g)?.length).toBe(1)
      expect(out).not.toContain('^x')
    }
  })

  test('a standalone marker after raw HTML stays literal text', async () => {
    const out = await html('<details><summary>s</summary>\nbody\n</details>\n\n^abc')
    expect(out).toContain('^abc')
  })

  test('a standalone marker after a definition or footnote stays literal text', async () => {
    expect(await html('[a]: http://x\n\n^abc')).toContain('^abc')
    expect(await html('x[^1]\n\n[^1]: note\n\n^abc')).toContain('^abc')
  })

  test('a trailing marker on a one-line callout title anchors the callout', async () => {
    const out = await html('> [!note] Title ^abc')
    expect(out).toMatch(/<div class="callout"[^>]*id="abc"/)
    expect(out).toContain('>Title</div>')
    expect(out).not.toContain('^abc')
  })
})
