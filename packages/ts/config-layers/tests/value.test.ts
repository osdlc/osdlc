import { describe, expect, test } from 'vitest'

import { getIn, valueAt, valueIsSet } from '../src/value.ts'

describe('valueAt', () => {
  test('walks a dotted key', () => {
    const cfg = { authority: 'origin', paths: { dev: '/d' }, checkout: { layout: '{dev}/{repo}' } }
    expect(valueAt(cfg, 'authority')).toBe('origin')
    expect(valueAt(cfg, 'paths.dev')).toBe('/d')
    expect(valueAt(cfg, 'checkout.layout')).toBe('{dev}/{repo}')
    expect(valueAt(cfg, 'nope.deeper')).toBeUndefined()
    expect(valueAt(null, 'a')).toBeUndefined()
    expect(valueAt('str', 'length')).toBeUndefined()
  })

  test('walks own keys of mappings only, as getIn does', () => {
    const cfg = { list: ['a'], m: {} }
    expect(valueAt(cfg, 'list.0')).toBeUndefined()
    expect(valueAt(cfg, 'list.length')).toBeUndefined()
    expect(valueAt(cfg, 'm.constructor')).toBeUndefined()
    expect(valueAt(cfg, 'toString')).toBeUndefined()
    expect(getIn(cfg, ['m', 'constructor'])).toEqual({ found: false, value: undefined })
    expect(getIn(cfg, ['m'])).toEqual({ found: true, value: {} })
  })
})

describe('valueIsSet', () => {
  test('empty text, list and map are unset; false and zero are set', () => {
    for (const v of [undefined, null, '', '  ', [], {}]) expect(valueIsSet(v)).toBe(false)
    for (const v of ['x', ['a'], { a: 1 }, 0, false]) expect(valueIsSet(v)).toBe(true)
  })
})
