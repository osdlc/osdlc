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
    expect(() => parseJsonc('{"a":1} /* oops')).toThrow(SyntaxError)
  })

  test('refuses a comma with no value before it', () => {
    expect(() => parseJsonc('[,]')).toThrow(SyntaxError)
    expect(() => parseJsonc('{,}')).toThrow(SyntaxError)
    expect(() => parseJsonc('[1,,]')).toThrow(SyntaxError)
    expect(() => parseJsonc(',1')).toThrow(SyntaxError)
    expect(parseJsonc('[1 /* c */ ,]')).toEqual([1])
  })

  test('parses deep nesting without a stack overflow', () => {
    const depth = 100_000
    const text = '['.repeat(depth) + ']'.repeat(depth)
    expect(() => parseJsonc(text)).not.toThrow()
  })
})
