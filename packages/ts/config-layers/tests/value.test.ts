import { describe, expect, test } from 'vitest'

import { valueAt, valueIsSet } from '../src/value.ts'

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
})

describe('valueIsSet', () => {
  test('empty text, list and map are unset; false and zero are set', () => {
    for (const v of [undefined, null, '', '  ', [], {}]) expect(valueIsSet(v)).toBe(false)
    for (const v of ['x', ['a'], { a: 1 }, 0, false]) expect(valueIsSet(v)).toBe(true)
  })
})
