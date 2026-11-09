/**
 * The package used the way a consumer uses it: through its name only. Each
 * export appears here at least once.
 */

import { describe, expect, test } from 'vitest'

import {
  DEFAULT_TAG_DIALECT,
  TAG_DIALECTS,
  extractBoth,
  inlineTags,
  isTagDialect,
  tagAt,
  type TagDialect,
} from '@osdlc/markdown-tags'

describe('the README quick start', () => {
  const body = '#santé and (#draft) #2024'

  test('inlineTags reads the default dialect, obsidian', () => {
    expect(inlineTags(body)).toEqual(['santé', 'draft'])
  })

  test('inlineTags takes a dialect', () => {
    expect(inlineTags(body, 'unicode')).toEqual(['santé', '2024'])
    expect(inlineTags(body, 'ascii')).toEqual(['sant', 'draft'])
  })

  test('extractBoth gives the unicode and ascii answers', () => {
    expect(extractBoth(body)).toEqual([
      ['santé', '2024'],
      ['sant', 'draft'],
    ])
  })
})

describe('code and links', () => {
  test('obsidian and ascii skip a fenced block; unicode scans it', () => {
    const body = '#real\n\n```\n#nottag\n```\n'
    expect(inlineTags(body, 'obsidian')).toEqual(['real'])
    expect(inlineTags(body, 'ascii')).toEqual(['real'])
    expect(inlineTags(body, 'unicode')).toEqual(['real', 'nottag'])
  })

  test('obsidian does not read a link destination as a tag', () => {
    expect(inlineTags('[see](#section)')).toEqual([])
  })
})

describe('tagAt', () => {
  test('reads the tag whose # is at an offset', () => {
    expect(tagAt('see #health today', 4)).toBe('health')
  })

  test('answers null where no tag opens', () => {
    expect(tagAt('x#no', 1)).toBeNull()
    expect(tagAt('see #2024', 4)).toBeNull()
    expect(tagAt('see #2024', 4, 'unicode')).toBe('2024')
  })

  test('does not blank code', () => {
    expect(tagAt('` #code`', 2)).toBe('code')
  })
})

describe('dialect names', () => {
  test('TAG_DIALECTS lists every name, default first', () => {
    expect(TAG_DIALECTS).toEqual(['obsidian', 'unicode', 'ascii'])
    expect(TAG_DIALECTS[0]).toBe(DEFAULT_TAG_DIALECT)
  })

  test('isTagDialect checks a setting value', () => {
    const setting: unknown = 'ascii'
    if (!isTagDialect(setting)) throw new Error('not a dialect')
    const dialect: TagDialect = setting
    expect(inlineTags('#a', dialect)).toEqual(['a'])
    expect(isTagDialect('Ascii')).toBe(false)
  })

  test('an unknown dialect from JavaScript throws a RangeError', () => {
    expect(() => inlineTags('#a', 'Ascii' as TagDialect)).toThrow(RangeError)
  })
})
