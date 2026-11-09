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
  ])('%s throws TypeError', (_name, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError)
  })
})

test('NaN, Infinity and -0 are written as JSON.stringify writes them', () => {
  expect(canonicalJson([Number.NaN, Number.POSITIVE_INFINITY, -0])).toBe('[null,null,0]')
})

test('a value with toJSON is encoded as what it returns, so a Date is its ISO string', () => {
  expect(canonicalJson({ at: new Date(0) })).toBe('{"at":"1970-01-01T00:00:00.000Z"}')
})

describe('objects JSON would silently empty are refused', () => {
  class Point {
    x = 1
  }
  test.each([
    ['a Map', new Map([['a', 1]])],
    ['a Set', new Set([1])],
    ['a class instance', new Point()],
    ['one nested in a plain object', { inner: new Map() }],
  ])('%s throws TypeError', (_name, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError)
  })

  test('a null-prototype object is plain', () => {
    const o = Object.create(null) as Record<string, unknown>
    o.b = 1
    o.a = 2
    expect(canonicalJson(o)).toBe('{"a":2,"b":1}')
  })

  test('a value that contains itself throws TypeError', () => {
    const o: Record<string, unknown> = {}
    o.self = o
    expect(() => canonicalJson(o)).toThrow(TypeError)
  })

  test('the same object twice, not nested in itself, is fine', () => {
    const shared = { a: 1 }
    expect(canonicalJson([shared, shared])).toBe('[{"a":1},{"a":1}]')
  })
})

test('integer-like keys sort as strings, not numerically', () => {
  expect(canonicalJson({ 10: 'a', 2: 'b', 1: 'c' })).toBe('{"1":"c","10":"a","2":"b"}')
})
