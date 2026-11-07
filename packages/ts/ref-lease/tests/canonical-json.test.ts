import { describe, expect, test } from 'vitest'

import { canonicalJson } from '@osdlc/ref-lease'

import cases from './conformance/canonical-json.json' with { type: 'json' }

describe('conformance: canonical-json.json', () => {
  test.each(cases.cases)('$name', ({ value, expected }) => {
    expect(canonicalJson(value)).toBe(expected)
  })
})

describe('values JSON cannot hold', () => {
  test.each([
    ['undefined', undefined],
    ['a nested undefined', { a: undefined }],
    ['a function', () => 1],
    ['a symbol', Symbol('s')],
    ['a bigint', 1n],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('%s throws TypeError', (_name, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError)
  })
})

test('integer-like keys sort as strings, not numerically', () => {
  expect(canonicalJson({ 10: 'a', 2: 'b', 1: 'c' })).toBe('{"1":"c","10":"a","2":"b"}')
})
