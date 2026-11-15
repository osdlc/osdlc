import { describe, expect, test } from 'vitest'
import { html } from './helpers.ts'

describe('remarkMark', () => {
  test('==text== becomes <mark>', async () => {
    expect(await html('a ==highlight== b')).toContain('<mark>highlight</mark>')
  })

  test('a highlight may span inline markup', async () => {
    expect(await html('a ==**bold** tail== b')).toContain('<mark><strong>bold</strong> tail</mark>')
  })

  test('several highlights in one paragraph', async () => {
    const out = await html('==one== and ==two==')
    expect(out.match(/<mark>/g)).toHaveLength(2)
  })

  test('a space after the opener is not a highlight', async () => {
    expect(await html('a == not == b')).not.toContain('<mark>')
  })

  test('an unpaired == is left as text', async () => {
    expect(await html('a ==dangling b')).not.toContain('<mark>')
  })

  test('an empty run (`====`) is literal text, not an empty <mark>', async () => {
    const out = await html('compare x ==== y and ==z==')
    expect(out).toContain('compare x ==== y and')
    expect(out.match(/<mark>/g)).toHaveLength(1)
    expect(out).toContain('<mark>z</mark>')
  })

  test('== inside code is untouched', async () => {
    const out = await html('literal `==x==` here')
    expect(out).not.toContain('<mark>')
    expect(out).toContain('==x==')
  })

  test('highlights survive inside a heading', async () => {
    expect(await html('# a ==b== c')).toContain('<mark>b</mark>')
  })

  test('a run of four `=` is literal, not an empty highlight', async () => {
    const out = await html('x ==== y')
    expect(out).not.toContain('<mark>')
    expect(out).toContain('x ==== y')
  })

  test('a run of four `=` stays literal when a real highlight follows it', async () => {
    const out = await html('x ==== y ==z==')
    expect(out).toContain('x ==== y <mark>z</mark>')
    expect(out.match(/<mark>/g)).toHaveLength(1)
  })
})

describe('remarkComments', () => {
  test('an inline comment is removed', async () => {
    const out = await html('before %%hidden%% after')
    expect(out).not.toContain('hidden')
    expect(out).toContain('before')
    expect(out).toContain('after')
  })

  test('a comment spanning inline markup is removed whole', async () => {
    const out = await html('before %%hidden **bold** more%% after')
    expect(out).not.toContain('hidden')
    expect(out).not.toContain('<strong>')
  })

  test('a block comment removes its whole paragraph', async () => {
    const out = await html('kept\n\n%%\nnot kept\nnor this\n%%\n\nalso kept')
    expect(out).not.toContain('not kept')
    expect(out).toContain('kept')
    expect(out).toContain('also kept')
    expect(out.match(/<p/g)).toHaveLength(2)
  })

  test('%% inside code is untouched', async () => {
    const out = await html('literal `%%x%%` here')
    expect(out).toContain('%%x%%')
  })

  // Obsidian treats an unclosed `%%` as commenting out the rest of the note,
  // and content that stays visible because the author forgot a closing marker
  // is exactly what this pass exists to prevent. The full contract lives in
  // `comments.test.ts`.
  test('an unpaired %% comments out the rest of the note', async () => {
    const out = await html('a %%dangling b')
    expect(out).not.toContain('dangling')
    expect(out).toContain('a')
  })
})
