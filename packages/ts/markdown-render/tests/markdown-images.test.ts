import { describe, expect, test } from 'vitest'
import { html, vaultResolver } from './helpers.ts'
import { splitMarkdownImage } from '../src/index.ts'

const resolveLink = vaultResolver(['assets/diagram.png', 'assets/clip.mp4', 'assets/paper.pdf'])

describe('splitMarkdownImage', () => {
  test('claims a relative target naming an embeddable file', () => {
    expect(splitMarkdownImage('assets/diagram.png')).toBe('assets/diagram.png')
    expect(splitMarkdownImage('cat.png')).toBe('cat.png')
    expect(splitMarkdownImage('clip.mp4')).toBe('clip.mp4')
    expect(splitMarkdownImage('paper.pdf')).toBe('paper.pdf')
  })

  test('percent-decodes, because a vault path holds the real characters', () => {
    expect(splitMarkdownImage('assets/my%20image.png')).toBe('assets/my image.png')
  })

  test('drops a fragment rather than forwarding it', () => {
    // `#page=3` is neither a heading nor a block id, and `paper.pdf#page=3` is
    // not a path any vault holds — sending it to the resolver guarantees a miss.
    expect(splitMarkdownImage('assets/paper.pdf#page=3')).toBe('assets/paper.pdf')
  })

  test('refuses everything that is not a vault attachment reference', () => {
    // A scheme-bearing URL is an external image the browser fetches itself.
    expect(splitMarkdownImage('https://example.com/a.png')).toBeNull()
    expect(splitMarkdownImage('data:image/png;base64,AAAA')).toBeNull()
    expect(splitMarkdownImage('blob:abc')).toBeNull()
    // An absolute path is a host route, and `//host/x` is an off-site jump.
    expect(splitMarkdownImage('/assets/a.png')).toBeNull()
    expect(splitMarkdownImage('//evil.example/a.png')).toBeNull()
    // No extension is not an attachment reference — matching Obsidian, where a
    // non-markdown target only resolves when it carries its extension.
    expect(splitMarkdownImage('Some Note')).toBeNull()
    expect(splitMarkdownImage('assets/diagram')).toBeNull()
    // An extension the dialect does not embed stays a plain image.
    expect(splitMarkdownImage('archive/notes.zip')).toBeNull()
    expect(splitMarkdownImage('')).toBeNull()
    expect(splitMarkdownImage('#anchor')).toBeNull()
  })
})

describe('remarkMarkdownImages', () => {
  test('a relative image becomes a markdown-embed, not an img', async () => {
    const out = await html('![](assets/diagram.png)', { resolveLink })
    expect(out).toContain('<markdown-embed')
    expect(out).toContain('data-embed-target="assets/diagram.png"')
    expect(out).toContain('data-embed-path="/vault/assets/diagram.png"')
    // The element must survive sanitization with the stock schema, which is the
    // whole reason this is not an `<img src>` rewrite: `hast-util-sanitize`
    // pins `protocols.src` to http/https, so a `blob:` src would be stripped.
    expect(out).not.toContain('<img')
  })

  test('classification matches the wikilink spelling of the same file', async () => {
    for (const [target, kind] of [
      ['assets/diagram.png', 'image'],
      ['assets/clip.mp4', 'video'],
      ['assets/paper.pdf', 'pdf'],
    ] as const) {
      const md = await html(`![](${target})`, { resolveLink })
      const wiki = await html(`![[${target}]]`, { resolveLink })
      expect(md).toContain(`data-embed-kind="${kind}"`)
      // One classification decides the element for both spellings; a reader
      // cannot tell them apart, so neither should the renderer. The output is
      // byte-identical, which is the strongest form of that promise.
      expect(md).toBe(wiki)
    }
  })

  test('alt text becomes the embed display text', async () => {
    const out = await html('![a diagram](assets/diagram.png)', { resolveLink })
    expect(out).toContain('data-embed-display="a diagram"')
  })

  test('an unresolvable target carries no path', async () => {
    const out = await html('![](assets/gone.png)', { resolveLink })
    expect(out).toContain('data-resolved-kind="missing"')
    expect(out).not.toContain('data-embed-path')
  })

  test('an external image is left as a plain img', async () => {
    const out = await html('![alt](https://example.com/a.png)', { resolveLink })
    expect(out).toContain('<img')
    expect(out).toContain('https://example.com/a.png')
    expect(out).not.toContain('<markdown-embed')
  })

  test('a lone image is lifted out of its paragraph, like the wikilink form', async () => {
    // `remarkEmbeds`' unwrap pass is what does this, which is why this plugin
    // runs before it. Without that ordering the two spellings of one embed
    // would differ in block-level-ness.
    const out = await html('![](assets/diagram.png)', { resolveLink })
    expect(out).not.toMatch(/<p[^>]*>\s*<markdown-embed/)
  })

  test('an image among text stays inline', async () => {
    const out = await html('see ![](assets/diagram.png) here', { resolveLink })
    expect(out).toMatch(/<p[^>]*>[\s\S]*<markdown-embed/)
  })

  test('a reference-style image is claimed the same as the inline form', async () => {
    for (const source of [
      '![cap][d]\n\n[d]: assets/diagram.png',
      '![cap][]\n\n[cap]: assets/diagram.png',
      '![cap]\n\n[cap]: assets/diagram.png',
    ]) {
      const out = await html(source, { resolveLink })
      expect(out).toContain('<markdown-embed')
      expect(out).toContain('data-embed-target="assets/diagram.png"')
      expect(out).toContain('data-embed-display="cap"')
      expect(out).not.toContain('<img')
    }
  })

  test('a reference-style image of an external URL stays an <img>', async () => {
    const out = await html('![cap][d]\n\n[d]: https://example.com/a.png', { resolveLink })
    expect(out).toContain('<img src="https://example.com/a.png"')
  })
})

describe('hostile embed paths', () => {
  test('a percent-encoded scheme never reaches data-embed-path', async () => {
    const out = await html('![](javascript%3Aalert(1).png)')
    expect(out).not.toContain('data-embed-path')
  })

  test('a wikilink embed whose resolver returns a scheme path drops it', async () => {
    const out = await html('![[a.png]]', {
      resolveLink: () => ({ kind: 'attachment', path: 'javascript:alert(1).png', display: 'a' }),
    })
    expect(out).not.toContain('data-embed-path')
  })
})
