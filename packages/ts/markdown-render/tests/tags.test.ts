import { describe, expect, test } from 'vitest'
import { html } from './helpers.ts'

describe('remarkTags', () => {
  test('a simple tag becomes an anchor', async () => {
    const out = await html('about #project today')
    expect(out).toContain('<a class="tag" data-tag="project">#project</a>')
  })

  test('nested tags keep their slashes', async () => {
    const out = await html('about #project/alpha today')
    expect(out).toContain('data-tag="project/alpha"')
    expect(out).toContain('>#project/alpha</a>')
  })

  test('a tag at the start of a line is tagged', async () => {
    const out = await html('#start of line')
    expect(out).toContain('data-tag="start"')
  })

  test('a tag after an opening paren is tagged', async () => {
    const out = await html('see (#inside)')
    expect(out).toContain('data-tag="inside"')
  })

  test('mid-word hashes are NOT tags', async () => {
    const out = await html('C# and foo#bar')
    expect(out).not.toContain('class="tag"')
  })

  test('all-digit hashes are NOT tags', async () => {
    const out = await html('issue #123 filed')
    expect(out).not.toContain('class="tag"')
  })

  test('digits mixed with letters ARE tags', async () => {
    const out = await html('milestone #q1-2026 shipped')
    expect(out).toContain('data-tag="q1-2026"')
  })

  test('tags inside a code fence are NOT tokenized', async () => {
    const out = await html('```\n#project\n```')
    expect(out).not.toContain('class="tag"')
  })

  test('tags inside inline code are NOT tokenized', async () => {
    const out = await html('literal `#project` here')
    expect(out).not.toContain('class="tag"')
  })

  test('a heading marker is not a tag', async () => {
    const out = await html('# Heading')
    expect(out).toContain('<h1')
    expect(out).not.toContain('class="tag"')
  })

  test('a wikilink heading fragment does not leak a tag', async () => {
    const out = await html('[[Note#Section]]')
    expect(out).not.toContain('class="tag"')
  })

  test('link text is not scanned for tags', async () => {
    const out = await html('[a #b](https://example.com)')
    expect(out).not.toContain('class="tag"')
  })

  test('several tags in one line all tokenize', async () => {
    const out = await html('#one #two #three')
    expect(out.match(/class="tag"/g)).toHaveLength(3)
  })
})

describe('remarkTags: the alphabet is Unicode, not ASCII', () => {
  // An ASCII-only class did not reject an accented tag, it truncated it: the
  // body showed `#sant` plus a stray `é` while the tag rail — fed by a census
  // that has always used the backend's Unicode dialect — listed `santé`.
  test('an accented tag is one tag, not a tag plus debris', async () => {
    const out = await html('about #santé today')
    expect(out).toContain('data-tag="santé"')
    expect(out).toContain('>#santé</a>')
    expect(out).not.toContain('data-tag="sant"')
  })

  test('non-Latin scripts are tags', async () => {
    for (const [tag, script] of [
      ['日本語', 'Japanese'],
      ['Ελληνικά', 'Greek'],
      ['кириллица', 'Cyrillic'],
    ]) {
      const out = await html(`about #${tag} ${script}`)
      expect(out).toContain(`data-tag="${tag}"`)
    }
  })

  test('a hyphenated Unicode tag keeps its tail', async () => {
    expect(await html('#über-cool')).toContain('data-tag="über-cool"')
  })

  test('the rules that are not about the alphabet are unchanged', async () => {
    expect(await html('#2024')).not.toContain('data-tag')
    expect(await html('#1')).not.toContain('data-tag')
    expect(await html('C# is a language')).not.toContain('data-tag')
    expect(await html('foo#bar')).not.toContain('data-tag')
    expect(await html('(#draft)')).toContain('data-tag="draft"')
  })

  test('a long run of digits after a # stays cheap', async () => {
    const start = performance.now()
    await html(`#${'1'.repeat(20_000)}`)
    expect(performance.now() - start).toBeLessThan(500)
  })
})

describe('tags inside a markdown link (review finding #4)', () => {
  test('a tag inside link text stays literal', async () => {
    const out = await html('[see #tag here](https://example.com)')
    expect(out).not.toContain('data-tag')
    expect(out).toContain('>see #tag here</a>')
  })

  test('a tag nested in emphasis inside link text stays literal', async () => {
    const out = await html('[see *#tag* here](https://example.com)')
    expect(out).not.toContain('data-tag')
  })

  test('a tag outside the link still tokenizes', async () => {
    const out = await html('[see](https://example.com) and #tag')
    expect(out).toContain('data-tag="tag"')
  })
})

describe('tagDialect', () => {
  const tags = async (body: string, options = {}) =>
    Array.from((await html(body, options)).matchAll(/data-tag="([^"]*)"/g), (m) => m[1])

  test('a ~~~ fence and a link destination hold no tag', async () => {
    expect(await tags('~~~\n#fenced\n~~~\n\n[see](#section) #real')).toEqual(['real'])
  })

  test('defaults to obsidian', async () => {
    expect(await tags('#2024 (#draft) #santé')).toEqual(['draft', 'santé'])
  })

  test('unicode tags an all-digit run and not a tag after (', async () => {
    expect(await tags('#2024 (#draft) #santé', { tagDialect: 'unicode' })).toEqual([
      '2024',
      'santé',
    ])
  })

  test('ascii cuts a tag at the first non-ASCII character', async () => {
    expect(await tags('#2024 (#draft) #santé', { tagDialect: 'ascii' })).toEqual(['draft', 'sant'])
  })
})
