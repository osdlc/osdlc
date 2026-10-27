import { describe, expect, test } from 'vitest'

import { validateSpec, type ToolSpec } from '../../src/devlink/spec.ts'
import { SPEC } from './support.ts'

describe('validateSpec', () => {
  test('a sound spec comes back as given', () => {
    expect(validateSpec(SPEC)).toBe(SPEC)
  })

  test.each<[string, Partial<ToolSpec>, RegExp]>([
    ['an empty marker', { marker: '' }, /marker/],
    ['an absolute marker', { marker: '/abs' }, /marker/],
    ['an entry that climbs out', { entry: 'src/../../x' }, /entry/],
    ['a launcher that climbs out', { launcher: '../bin/x' }, /launcher/],
    ['a launcher with a ./ segment', { launcher: './bin/tooly' }, /launcher/],
    ['a launcher with an empty segment', { launcher: 'bin//tooly' }, /launcher/],
    ['a marker with a trailing slash', { marker: 'src/' }, /marker/],
    ['an empty packageName', { packageName: '' }, /packageName/],
    ['an alias that climbs out', { aliases: ['../x'] }, /alias/],
    ['an alias with a slash', { aliases: ['a/b'] }, /alias/],
    ['an empty alias', { aliases: [''] }, /alias/],
  ])('refuses %s', (_name, change, message) => {
    expect(() => validateSpec({ ...SPEC, ...change })).toThrow(message)
  })
})
