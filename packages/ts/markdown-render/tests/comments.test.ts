/**
 * The `%%comment%%` contract.
 *
 * `%%` is a document-level delimiter: a comment opened in one block runs to the
 * next `%%` wherever that falls, and an unclosed one runs to the end of the
 * note. The paragraph-scoped scan this replaced leaked both forms.
 */

import { describe, expect, test } from 'vitest'
import { html } from './helpers.ts'

describe('%% comments spanning more than one paragraph', () => {
  test('a comment opened and closed in different paragraphs hides all of them', async () => {
    const out = await html('before\n\n%%\nsecret one\n\nsecret two\n%%\n\nafter')
    expect(out).not.toContain('secret one')
    expect(out).not.toContain('secret two')
    expect(out).toContain('before')
    expect(out).toContain('after')
    expect(out.match(/<p/g)).toHaveLength(2)
  })

  test('a comment swallows whole blocks between its markers', async () => {
    const out = await html('a %%\n\n```\nsecret code\n```\n\n> secret quote\n\n%% b')
    expect(out).not.toContain('secret code')
    expect(out).not.toContain('secret quote')
    expect(out).not.toContain('<pre')
    expect(out).not.toContain('<blockquote')
    expect(out).toContain('a')
    expect(out).toContain('b')
  })

  test('a comment spanning list items removes the items between', async () => {
    const out = await html('- a %%\n- secret\n- %% b')
    expect(out).not.toContain('secret')
    expect(out.match(/<li/g)).toHaveLength(2)
  })
})

describe('unclosed %% comments', () => {
  test('an unclosed block comment hides everything after it', async () => {
    const out = await html('before\n\n%% secret\n\nmore secret')
    expect(out).not.toContain('secret')
    expect(out).toContain('before')
  })

  test('an unclosed inline comment hides the rest of the note', async () => {
    const out = await html('visible %% hidden rest\n\nand this paragraph too')
    expect(out).not.toContain('hidden rest')
    expect(out).not.toContain('and this paragraph')
    expect(out).toContain('visible')
  })

  test('an unclosed comment hides a heading and its body', async () => {
    const out = await html('intro\n\n%%\n\n# Secret heading\n\nsecret body')
    expect(out).not.toContain('Secret heading')
    expect(out).not.toContain('secret body')
    expect(out).not.toContain('<h1')
    expect(out).toContain('intro')
  })
})

describe('what a comment must not reach', () => {
  test('a wikilink inside a comment never reaches the host resolver', async () => {
    const seen: string[] = []
    const out = await html('a %%[[Secret Note]]%% b', {
      resolveLink: (target: string) => {
        seen.push(target)
        return { kind: 'missing' as const, display: target }
      },
    })
    expect(seen).toEqual([])
    expect(out).not.toContain('Secret')
  })

  test('an embed inside a comment never becomes a node', async () => {
    const out = await html('a %%![[Secret Note]]%% b')
    expect(out).not.toContain('markdown-embed')
    expect(out).not.toContain('Secret')
  })
})

describe('what a comment must leave alone', () => {
  test('%% inside inline code is literal', async () => {
    expect(await html('literal `%%x%%` here')).toContain('%%x%%')
  })

  test('%% inside a fence is literal', async () => {
    const out = await html('```\n%%x%%\n```\n\nafter')
    expect(out).toContain('%%x%%')
    expect(out).toContain('after')
  })

  test('an &nbsp; spacer paragraph survives, with or without a comment elsewhere', async () => {
    // The prune pass is for blocks a comment emptied. A non-breaking space is
    // content an author typed on purpose, not blank.
    for (const source of ['a\n\n&nbsp;\n\nb', 'a %%x%%\n\n&nbsp;\n\n*&nbsp;*\n\nb']) {
      const out = await html(source)
      expect(out.match(/<p[^>]*>/g)).toHaveLength(source.includes('*') ? 4 : 3)
      expect(out).toContain('\u00a0')
    }
    expect(await html('- &nbsp;\n- x')).toMatch(/<li[^>]*>\u00a0<\/li>/)
  })

  test('two comments in one paragraph both go, and the text between stays', async () => {
    const out = await html('one %%a%% two %%b%% three')
    expect(out).not.toContain('%%')
    expect(out).toContain('one')
    expect(out).toContain('two')
    expect(out).toContain('three')
  })

  test('a non-breaking-space spacer paragraph survives', async () => {
    // `&nbsp;` is content to CommonMark, not a blank line; only a paragraph a
    // comment emptied may be pruned.
    for (const spacer of ['&nbsp;', '&emsp;', '\u00a0']) {
      const out = await html(`Line one\n\n${spacer}\n\nLine two`)
      expect(out.match(/<p/g)).toHaveLength(3)
    }
    expect((await html('a %%x%%\n\n&nbsp;\n\nb')).match(/<p/g)).toHaveLength(3)
  })
})

describe('what the document-order scan costs', () => {
  // The scan is one `indexOf` walk over the text nodes; only a span whose two
  // markers land in different nodes pays for the removal walk. A note built
  // entirely out of straddling pairs is the worst shape there is, and it stays
  // in the same order of magnitude as parsing the same document.
  test('a document of straddling comment pairs stays cheap', async () => {
    const doc = Array.from({ length: 2000 }, (_, i) => (i % 2 === 0 ? '%% a' : 'b %%')).join('\n\n')
    const start = performance.now()
    const out = await html(doc)
    expect(performance.now() - start).toBeLessThan(3000)
    expect(out).not.toContain('a')
  })

  test('a single unclosed marker over a long note stays cheap', async () => {
    const doc = `%%\n\n${Array.from({ length: 2000 }, (_, i) => `para ${i}`).join('\n\n')}`
    const start = performance.now()
    const out = await html(doc)
    expect(performance.now() - start).toBeLessThan(3000)
    expect(out).toBe('')
  })
})

describe('comments: false', () => {
  /**
   * `%%comment%%` is a vault authoring convention, so it is on by default. A
   * host rendering text that is not a vault note — an agent answer, a chat
   * message — turns it off, because there a doubled percent is far more likely
   * to be printf, LaTeX, or a format string than a marker, and honouring it
   * deletes the author's own words with nothing on screen to say so.
   */
  test('a paired comment stays as text', async () => {
    const out = await html('Use the %%rate%% limit of 5.', { comments: false })
    expect(out).toContain('rate')
    expect(out).toContain('limit of 5')
  })

  test('an unclosed marker no longer swallows the rest of the document', async () => {
    const out = await html('Growth of 50%% then more.\n\nA later paragraph.', {
      comments: false,
    })
    expect(out).toContain('then more')
    expect(out).toContain('A later paragraph')
  })

  test('the default is still to honour comments', async () => {
    const on = await html('Use the %%rate%% limit of 5.')
    expect(on).not.toContain('rate')
    // And the option is opt-out only: `true` is the same as omitting it.
    const explicit = await html('Use the %%rate%% limit of 5.', { comments: true })
    expect(explicit).toBe(on)
  })

  test('a commented-out wikilink is inert with comments off, not resolved away', async () => {
    // With comments ON the link never becomes a node. With them OFF the text
    // is a real wikilink again — which is the point: nothing is being deleted.
    const out = await html('%%[[Secret]]%%', { comments: false })
    expect(out).toContain('Secret')
  })
})

describe('a comment cutting through a link', () => {
  test('a link with one marker inside it loses its destination', async () => {
    const out = await html('[public %%](https://x.example/private) hidden%% after')
    expect(out).not.toContain('x.example')
    expect(out).toContain('public')
    expect(out).toContain('after')
  })
})
