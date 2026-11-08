import { describe, expect, test } from 'vitest'
import { html } from './helpers.ts'
import { defaultTitle } from '../src/index.ts'

describe('remarkCallouts', () => {
  test('a bare callout gets the type as its title', async () => {
    const out = await html('> [!note]\n> body')
    expect(out).toContain('class="callout"')
    expect(out).toContain('data-callout="note"')
    expect(out).toContain('<div class="callout-title">Note</div>')
    expect(out).toContain('<div class="callout-content"><p')
    expect(out).toContain('body')
  })

  test('an explicit title wins over the default', async () => {
    const out = await html('> [!tip] Try this\n> body')
    expect(out).toContain('<div class="callout-title">Try this</div>')
  })

  test('the title keeps its inline markup', async () => {
    const out = await html('> [!tip] Try **this**\n> body')
    expect(out).toContain('<div class="callout-title">Try <strong>this</strong></div>')
  })

  test('a `-` marker records a collapsed fold state', async () => {
    const out = await html('> [!warning]- Careful\n> body')
    expect(out).toContain('data-fold="-"')
  })

  test('a `+` marker records an expanded fold state', async () => {
    const out = await html('> [!warning]+ Careful\n> body')
    expect(out).toContain('data-fold="+"')
  })

  test('no marker means no fold attribute', async () => {
    const out = await html('> [!warning] Careful\n> body')
    expect(out).not.toContain('data-fold')
  })

  test('the type is lowercased', async () => {
    const out = await html('> [!WARNING] Careful')
    expect(out).toContain('data-callout="warning"')
  })

  test('block content inside the callout is preserved', async () => {
    const out = await html('> [!info] Title\n> para\n>\n> - one\n> - two\n>\n> ```ts\n> x\n> ```')
    expect(out).toContain('<ul')
    expect(out).toContain('<li')
    expect(out).toContain('language-ts')
  })

  test('callouts nest', async () => {
    const out = await html('> [!note] Outer\n> body\n>\n> > [!tip] Inner\n> > inner body')
    expect(out).toContain('data-callout="note"')
    expect(out).toContain('data-callout="tip"')
    expect(out.indexOf('data-callout="note"')).toBeLessThan(out.indexOf('data-callout="tip"'))
  })

  test('a plain blockquote is left alone', async () => {
    const out = await html('> just a quote')
    expect(out).toContain('<blockquote')
    expect(out).not.toContain('callout')
  })

  test('a bracketed non-callout opener is left alone', async () => {
    const out = await html('> [not a callout] text')
    expect(out).toContain('<blockquote')
    expect(out).not.toContain('class="callout"')
  })

  test('a hard break ends the title line, as a newline does', async () => {
    // Two trailing spaces or a backslash parse as a `break` node, not a
    // newline in a text node; the body must still leave the title.
    for (const source of ['> [!note] Title  \n> body text', '> [!note] Title\\\n> body text']) {
      const out = await html(source)
      expect(out).toContain('<div class="callout-title">Title</div>')
      expect(out).toMatch(/<div class="callout-content"><p[^>]*>body text<\/p><\/div>/)
    }
  })

  test('a title-only callout has an empty content div', async () => {
    const out = await html('> [!note] Only a title')
    expect(out).toContain('<div class="callout-content"></div>')
  })
})

describe('an untitled callout is titled the same however its type is spelled', () => {
  test('defaultTitle title-cases rather than only capitalizing', () => {
    expect(defaultTitle('DANGER')).toBe('Danger')
    expect(defaultTitle('danger')).toBe('Danger')
    expect(defaultTitle('Danger')).toBe('Danger')
    expect(defaultTitle('my-type')).toBe('My-type')
  })

  test('an uppercase type renders a title-cased heading', async () => {
    // `data-callout` is lowercased either way, so these are the same callout;
    // only the default title disagreed.
    const out = await html('> [!DANGER]\n> body')
    expect(out).toContain('data-callout="danger"')
    expect(out).toContain('>Danger<')
    expect(out).not.toContain('>DANGER<')
  })

  test('an author-written title is untouched', async () => {
    expect(await html('> [!DANGER] LOUD ON PURPOSE\n> body')).toContain('LOUD ON PURPOSE')
  })

  test('a title line ending in a hard break keeps the body out of the title', async () => {
    for (const source of ['> [!tip] Title  \n> body text', '> [!tip] Title\\\n> body text']) {
      const out = await html(source)
      expect(out).toContain('<div class="callout-title">Title</div>')
      expect(out).toMatch(/<div class="callout-content"><p[^>]*>body text<\/p><\/div>/)
    }
  })

  test('a lone embed on the line after the title is lifted out of its paragraph', async () => {
    for (const source of ['> [!note]\n> ![[Other]]', '> [!note] Title\n> ![[Other]]']) {
      const out = await html(source)
      expect(out).toMatch(/<div class="callout-content"><markdown-embed[^>]*data-line="2"/)
      expect(out).not.toContain('<p')
    }
  })

  test('a lone markdown image on the line after the title is lifted too', async () => {
    const out = await html('> [!note] Title\n> ![](pic.png)')
    expect(out).toMatch(/<div class="callout-content"><markdown-embed[^>]*data-line="2"/)
    expect(out).not.toContain('<p')
  })
})
