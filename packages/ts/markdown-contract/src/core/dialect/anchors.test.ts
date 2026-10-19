import { describe, expect, test } from 'vitest'

import { extractTrailingAnchor, isStandaloneAnchor } from './anchors.js'

// anchors.ts owns the `^block-id` addressing primitive. These tests double as the module's
// contract: each case is an input string and the exact value the function returns.

describe("extractTrailingAnchor — lift a line-terminal ^id off the end of a block's text", () => {
  test('a ^id on its own final line is lifted; `rest` is the text without it', () => {
    expect(extractTrailingAnchor('We will adopt the widget protocol.\n^summary')).toEqual({
      id: 'summary',
      rest: 'We will adopt the widget protocol.',
    })
  })

  test('a ^id trailing the same line as text binds and is stripped from that line', () => {
    expect(extractTrailingAnchor('Some prose ^note')).toEqual({ id: 'note', rest: 'Some prose' })
  })

  test('ids may contain letters, digits, hyphen and underscore', () => {
    expect(extractTrailingAnchor('x\n^block-id_2')).toEqual({ id: 'block-id_2', rest: 'x' })
  })

  test('no trailing anchor → null', () => {
    expect(extractTrailingAnchor('Just a paragraph.')).toBeNull()
  })

  test('a ^id that is not line-terminal does not bind → null', () => {
    expect(extractTrailingAnchor('see ^foo for details')).toBeNull()
  })
})

describe('isStandaloneAnchor — is the whole (trimmed) text just a ^id?', () => {
  test('a lone ^id returns the id', () => {
    expect(isStandaloneAnchor('^summary')).toBe('summary')
  })

  test('surrounding whitespace is tolerated', () => {
    expect(isStandaloneAnchor('  ^summary  ')).toBe('summary')
  })

  test('anything more than the bare token → null', () => {
    expect(isStandaloneAnchor('text ^summary')).toBeNull()
    expect(isStandaloneAnchor('summary')).toBeNull()
  })
})
