import { describe, expect, test } from 'vitest'

import {
  decode,
  decodeEntries,
  diff,
  encode,
  encodeEntries,
  merge,
  specQueryKeys,
} from '../src/index.ts'

const polluted = (): unknown => (({}) as Record<string, unknown>).polluted

describe('declared types are own keys of a known FieldType', () => {
  const defaults = { valueOf: 1, other: 'a' }

  test('an inherited Object.prototype name is not a declared type', () => {
    expect(decode('valueOf=2', defaults)).toEqual({ valueOf: 2, other: 'a' })
    expect(decodeEntries([['valueOf', '2']], defaults)).toEqual({ valueOf: 2, other: 'a' })
    expect(encode({ valueOf: 2, other: 'a' }, defaults)).toBe('valueOf=2')
    expect(specQueryKeys(defaults)).toEqual(['valueOf', 'other'])
  })

  test('a declared value that is not a FieldType is ignored', () => {
    const types = { other: 'nope' } as never
    expect(decode('other=b', defaults, { types })).toEqual({ valueOf: 1, other: 'b' })
  })

  test('an own declaration still wins', () => {
    expect(decode('other=3', { other: null }, { types: { other: 'number' } })).toEqual({ other: 3 })
  })
})

describe('own __proto__ keys are data, never the prototype setter', () => {
  const hostile = (): { __proto__: { polluted: number }; n: number } =>
    JSON.parse('{"__proto__":{"polluted":0},"n":1}')

  test('merge, diff and clone keep Object.prototype', () => {
    const defaults = hostile()
    const patch = JSON.parse('{"__proto__":{"polluted":5},"n":2}') as unknown
    const merged = merge(patch, defaults)
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
    expect(Object.getPrototypeOf((merged as Record<string, unknown>)['__proto__'])).toBe(
      Object.prototype,
    )
    expect(Object.keys(merged)).toEqual(['__proto__', 'n'])
    expect(merged.n).toBe(2)
    expect(polluted()).toBeUndefined()

    const d = diff(JSON.parse('{"__proto__":{"polluted":9},"n":1}') as typeof defaults, defaults)
    expect(Object.getPrototypeOf(d)).toBe(Object.prototype)
    expect(Object.keys(d)).toEqual(['__proto__'])
    expect(polluted()).toBeUndefined()
  })

  test('decode into defaults with a __proto__ field does not pollute', () => {
    const defaults = hostile()
    const decoded = decode('__proto__.polluted=1', defaults, { types: Object.create(null) })
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
    expect(polluted()).toBeUndefined()
    expect(Object.getOwnPropertyDescriptor(decoded, '__proto__')?.value).toEqual({ polluted: 1 })
  })
})

describe('a lone surrogate is dropped, not thrown on', () => {
  test('value and key', () => {
    expect(encode({ s: '\uD800' }, { s: '' })).toBe('')
    expect(encodeEntries({ s: '\uD800' }, { s: '' })).toEqual([])
    expect(encode({ a: ['x', '\uDC00'] }, { a: [] as string[] })).toBe('')
    expect(encode({ '\uD800': 'x', k: 'y' }, { '\uD800': '', k: '' })).toBe('k=y')
    expect(specQueryKeys({ '\uD800': '', k: '' })).toEqual(['k'])
  })

  test('a well-formed astral character still encodes', () => {
    expect(encode({ s: '😀' }, { s: '' })).toBe('s=%F0%9F%98%80')
  })
})

describe('non-plain objects are opaque leaves', () => {
  test('diff tells two Dates apart and equal Dates together', () => {
    expect(diff({ d: new Date(1) }, { d: new Date(2) })).toEqual({ d: new Date(1) })
    expect(diff({ d: new Date(1) }, { d: new Date(1) })).toEqual({})
  })

  test('merge copies a Date by reference instead of flattening it', () => {
    const d = new Date(5)
    expect(merge({ d }, { d: new Date(0) }).d).toBe(d)
    expect(merge({}, { d: new Date(0) }).d).toBeInstanceOf(Date)
  })

  test('class instances and Maps are leaves', () => {
    class P {
      x = 1
    }
    expect(diff({ p: new P() }, { p: new P() })).toEqual({})
    const m = new Map([[1, 2]])
    expect(merge({ m }, { m: new Map() }).m).toBe(m)
  })

  test('null-prototype objects are still plain', () => {
    const value = Object.assign(Object.create(null) as object, { a: 1 })
    expect(diff({ o: value }, { o: { a: 2 } })).toEqual({ o: { a: 1 } })
  })
})

describe('decode keeps valid escapes around a malformed one', () => {
  test('a trailing lone percent', () => {
    expect(decode('s=a%20b%', { s: '' })).toEqual({ s: 'a b%' })
  })

  test('a malformed escape in the middle', () => {
    expect(decode('s=a%20%zz%41', { s: '' })).toEqual({ s: 'a %zzA' })
  })

  test('invalid UTF-8 stays literal, ASCII beside it decodes', () => {
    expect(decode('s=%E0%41', { s: '' })).toEqual({ s: '%E0A' })
  })

  test('arrays decode piece by piece', () => {
    expect(decode('t=a%2Cb,c%', { t: [] as string[] })).toEqual({ t: ['a,b', 'c%'] })
  })
})

describe('diff compares scalars by Object.is first', () => {
  test('NaN and Infinity are not null', () => {
    expect(diff({ x: Number.NaN }, { x: null as number | null })).toEqual({ x: Number.NaN })
    expect(diff({ x: Infinity }, { x: null as number | null })).toEqual({ x: Infinity })
    expect(diff({ x: -Infinity }, { x: Infinity })).toEqual({ x: -Infinity })
  })

  test('NaN equals NaN, and 0 equals -0', () => {
    expect(diff({ x: Number.NaN }, { x: Number.NaN })).toEqual({})
    expect(diff({ x: -0 }, { x: 0 })).toEqual({})
  })

  test('a non-finite number is still dropped on encode', () => {
    expect(encode({ x: Number.NaN }, { x: 1 })).toBe('')
  })
})

describe('diff returns a fresh value', () => {
  test('mutating the result leaves the input alone', () => {
    const value = { a: [1], b: { c: [3] } }
    const d = diff(value, { a: [2], b: { c: [4] } })
    d.a!.push(9)
    d.b!.c!.push(9)
    expect(value).toEqual({ a: [1], b: { c: [3] } })
    expect(d.a).not.toBe(value.a)
  })
})

describe('README claims', () => {
  test('[""] and [] share one encoding and both decode to []', () => {
    const defaults = { t: ['x'] }
    expect(encode({ t: [] }, defaults)).toBe('t=')
    expect(encode({ t: [''] }, defaults)).toBe('t=')
    expect(decode('t=', defaults)).toEqual({ t: [] })
  })

  test('numbers are parsed by Number(): hex and exponent forms are accepted', () => {
    const defaults = { n: 0 }
    expect(decode('n=0x10', defaults)).toEqual({ n: 16 })
    expect(decode('n=1e3', defaults)).toEqual({ n: 1000 })
    expect(decode('n=0b11', defaults)).toEqual({ n: 3 })
    expect(decode('n=+5', defaults)).toEqual({ n: 5 })
  })

  test('non-finite and blank numbers fall back to the default', () => {
    const defaults = { n: 7 }
    expect(decode('n=Infinity', defaults)).toEqual({ n: 7 })
    expect(decode('n=NaN', defaults)).toEqual({ n: 7 })
    expect(decode('n=1e999', defaults)).toEqual({ n: 7 })
    expect(decode('n=+', defaults)).toEqual({ n: 7 })
  })

  test('a defaults key that contains a dot collides with the nested path', () => {
    const defaults = { 'a.b': 1, a: { b: 2 } }
    expect(specQueryKeys(defaults)).toEqual(['a.b', 'a.b'])
    // Both fields answer to `a.b`; the later one wins the key.
    expect(decode('a.b=9', defaults)).toEqual({ 'a.b': 1, a: { b: 9 } })
  })
})
