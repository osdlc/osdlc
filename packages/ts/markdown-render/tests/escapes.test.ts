/**
 * Escaped dialect syntax stays literal.
 *
 * CommonMark resolves `\[` to `[` while parsing, so without `plugins/escapes.ts`
 * every dialect tokenizer would see `\[\[Note]]` as `[[Note]]` and activate on it.
 */

import { describe, expect, test } from 'vitest'
import { html, vaultResolver } from './helpers.ts'

const resolve = { resolveLink: vaultResolver(['Note.md', 'Note']) }

describe('escaped dialect syntax is literal', () => {
  test('an escaped wikilink is not a link', async () => {
    const out = await html('\\[\\[Not a link]]', resolve)
    expect(out).toContain('[[Not a link]]')
    expect(out).not.toContain('<a')
  })

  test('an escaped tag is not a tag', async () => {
    const out = await html('\\#tag')
    expect(out).toContain('#tag')
    expect(out).not.toContain('class="tag"')
  })

  test('an escaped highlight is not a mark', async () => {
    const out = await html('\\==mark==')
    expect(out).toContain('==mark==')
    expect(out).not.toContain('<mark>')
  })

  test('an escaped embed is not an embed', async () => {
    const out = await html('!\\[\\[Note]]', resolve)
    expect(out).toContain('![[Note]]')
    expect(out).not.toContain('markdown-embed')
  })

  test('an escaped block id is not stripped and does not mint an id', async () => {
    const out = await html('text \\^notid')
    expect(out).toContain('text ^notid')
    expect(out).not.toContain('data-block-id')
    expect(out).not.toContain('id="notid"')
  })

  test('an escaped comment renders its own text', async () => {
    // Both markers escaped is the spelling that survives whole. With only the
    // opener escaped (`\%%…%%`) the trailing `%%` is still a real, unpaired
    // delimiter and opens a comment to the end of the note — but the content
    // between them is no longer deleted, which is the leak this guards against.
    expect(await html('\\%\\%not a comment\\%\\%')).toContain('%%not a comment%%')
    expect(await html('\\%%not a comment%%')).toContain('%%not a comment')
  })

  test('an escaped callout marker is not a callout', async () => {
    const out = await html('> \\[!note] not a callout')
    expect(out).toContain('<blockquote')
    expect(out).not.toContain('class="callout')
  })
})

describe('escaping changes nothing else', () => {
  test('the unescaped spellings still work', async () => {
    const out = await html('[[Note]] #tag ==m== text ^id', resolve)
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('class="tag"')
    expect(out).toContain('<mark>m</mark>')
    expect(out).toContain('data-block-id="id"')
  })

  test('CommonMark escapes remark handles itself are untouched', async () => {
    expect(await html('a \\*not em\\* b')).toContain('a *not em* b')
    expect(await html('a \\`not code\\` b')).toContain('a `not code` b')
  })

  test('an escaped bracket inside markdown link text survives', async () => {
    const out = await html('[a \\[ b](https://example.com)')
    expect(out).toContain('>a [ b</a>')
  })

  test('an escaped pipe in a table cell is still a wikilink alias', async () => {
    // `| [[Note\|alias]] |` is how Obsidian spells an aliased wikilink in a
    // table, so `\|` must stay a separator rather than becoming a literal.
    const out = await html('| a |\n|---|\n| [[Note\\|alias]] |', resolve)
    expect(out).toContain('>alias</a>')
  })

  test('no sentinel character ever reaches the output', async () => {
    const out = await html(
      '\\[\\[x]] \\#t \\==m== \\^i \\%\\%c\\%\\% \\!bang\\!\n\n# \\#Heading\n\n[l](https://e.com/\\(1\\))',
    )
    expect(out).not.toMatch(/[\uE000-\uF8FF]/)
  })

  test("resolveLink is handed the author's target, never a sentinel", async () => {
    // Wikilinks (both passes) and embeds resolve before `remarkUnescape` runs.
    const seen: string[] = []
    const resolveLink = (target: string) => {
      seen.push(target)
      return { kind: 'note' as const, path: `/vault/${target}`, display: target }
    }
    await html('See [[Hello\\!]], [[Mid\\!x|**bold**]] and ![[Wow\\=x]]', { resolveLink })
    expect(seen).toEqual(expect.arrayContaining(['Hello!', 'Mid!x', 'Wow=x']))
    expect(seen.join('')).not.toMatch(/\uE000/)
  })

  test('a heading slug is built from the unescaped text', async () => {
    // The `#` is back before the slugger sees it, so it slugs away as
    // punctuation rather than leaving a placeholder in the anchor.
    const out = await html('# A \\# B')
    expect(out).toContain('A # B')
    expect(out).toMatch(/id="a-+b"/)
  })
})

describe('a link directly followed by an escape', () => {
  test('a wikilink still links', async () => {
    const out = await html('[[Note]]\\#x')
    expect(out).toContain('data-wikilink="Note"')
    expect(out).toContain('#x')
  })

  test('a wikilink with a formatted alias still links', async () => {
    const out = await html('[[N|*x*]]\\#x')
    expect(out).toContain('data-wikilink="N"')
    expect(out).toContain('<em>x</em>')
  })

  test('an embed followed by an escape still embeds', async () => {
    expect(await html('![[img.png]]\\!')).toContain('<markdown-embed')
  })
})
