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
    ['an empty stateDir', { stateDir: '' }, /stateDir/],
    ['a stateDir that is the home itself', { stateDir: '~' }, /stateDir/],
    ['a stateDir of ~/ alone', { stateDir: '~/' }, /stateDir/],
    ['an absolute stateDir', { stateDir: '/var/lib/tooly' }, /stateDir/],
    ['a stateDir without ~/', { stateDir: '.tooly' }, /stateDir/],
    ["another account's stateDir", { stateDir: '~root/.tooly' }, /stateDir/],
    ['a stateDir that climbs out', { stateDir: '~/../x' }, /stateDir/],
    ['a stateDir with a ./ segment', { stateDir: '~/./x' }, /stateDir/],
    ['a stateDir with an empty segment', { stateDir: '~/a//b' }, /stateDir/],
    ['a stateDir with a trailing slash', { stateDir: '~/.tooly/' }, /stateDir/],
    ['a stateDir with a backslash', { stateDir: '~\\.tooly' }, /stateDir/],
    ['a stateDir with a space', { stateDir: '~/my tool' }, /stateDir/],
    ['a stateDir with a shell expansion', { stateDir: '~/$USER' }, /stateDir/],
    ['a stateDir with a quote', { stateDir: '~/a"b' }, /stateDir/],
  ])('refuses %s', (_name, change, message) => {
    expect(() => validateSpec({ ...SPEC, ...change })).toThrow(message)
  })

  test.each(['~/.tooly', '~/.local/state/tooly', '~/tool_y-1.0'])(
    'accepts the stateDir %j',
    (v) => {
      const spec = { ...SPEC, stateDir: v }
      expect(validateSpec(spec)).toBe(spec)
    },
  )
})
