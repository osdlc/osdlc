import { expect, test } from 'vitest'
import { DEFAULT_TAG_DIALECT, TAG_DIALECTS, inlineTags, isTagDialect, tagAt } from '../src/index.ts'

test('the dialects are named as in the crate, default first', () => {
  expect(TAG_DIALECTS).toEqual(['obsidian', 'unicode', 'ascii'])
  expect(DEFAULT_TAG_DIALECT).toBe('obsidian')
})

test('inlineTags defaults to obsidian', () => {
  const body = '#santé (#draft) #2024'
  expect(inlineTags(body)).toEqual(inlineTags(body, 'obsidian'))
  expect(inlineTags(body)).toEqual(['santé', 'draft'])
})

test('isTagDialect takes exact names only', () => {
  for (const name of TAG_DIALECTS) expect(isTagDialect(name)).toBe(true)
  for (const value of ['', 'Obsidian', 'UNICODE', ' ascii', 'gfm', null, undefined, 1]) {
    expect(isTagDialect(value)).toBe(false)
  }
})

test('tagAt reads one tag by the dialect rule, defaulting to obsidian', () => {
  const text = '(#draft) #2024 x#no'
  expect(tagAt(text, 1)).toBe('draft')
  expect(tagAt(text, 9)).toBeNull()
  expect(tagAt(text, 9, 'unicode')).toBe('2024')
  expect(tagAt(text, 1, 'unicode')).toBeNull()
  expect(tagAt(text, 16)).toBeNull()
  expect(tagAt(text, 0)).toBeNull()
})

test('tagAt reads whole code points on both sides of the #', () => {
  // U+1D400 is alphabetic and outside the BMP, so it is two UTF-16 units.
  expect(tagAt('#\u{1D400}b', 0)).toBe('\u{1D400}b')
  expect(tagAt('\u{1D400}#b', 2)).toBeNull()
})

test('tagAt does not blank code or links', () => {
  expect(inlineTags('` #code`')).toEqual([])
  expect(tagAt('` #code`', 2)).toBe('code')
  expect(inlineTags('[see](#section)')).toEqual([])
  expect(tagAt('[see](#section)', 6)).toBe('section')
})

test('an unknown dialect throws a RangeError naming the accepted ones', () => {
  // A JavaScript caller can pass any value; the type checker is not there.
  for (const bad of ['Obsidian', '', 'gfm', null, 1]) {
    const dialect = bad as never
    expect(() => inlineTags('#a', dialect)).toThrow(RangeError)
    expect(() => tagAt('#a', 0, dialect)).toThrow(RangeError)
  }
  expect(() => inlineTags('#a', 'Obsidian' as never)).toThrow('obsidian, unicode, ascii')
  expect(() => tagAt('#a', 0, 'Obsidian' as never)).toThrow(/"Obsidian"/)
})
