import { describe, expect, test } from 'vitest'

import { parseJsonc } from '../src/plugins/support/jsonc.ts'

describe('parseJsonc', () => {
  test('drops comments and trailing commas outside strings', () => {
    const text = `﻿{
      // line comment
      "a": "http://x // not a comment, /* nor this */",
      "b": [1, 2, /* block */ ],
      "c": { "d": "with \\"quote\\",", },
    }`
    expect(parseJsonc(text)).toEqual({
      a: 'http://x // not a comment, /* nor this */',
      b: [1, 2],
      c: { d: 'with "quote",' },
    })
  })

  test('keeps commas between values', () => {
    expect(parseJsonc('[1 , 2,3]')).toEqual([1, 2, 3])
  })

  test('throws on what is still not JSON', () => {
    expect(() => parseJsonc('{ "a": }')).toThrow(SyntaxError)
    expect(() => parseJsonc('{ /* open')).toThrow(SyntaxError)
  })
})
