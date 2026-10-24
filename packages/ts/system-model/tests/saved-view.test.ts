import { describe, expect, test } from 'vitest'
import { SLUG_PATTERN, slugify } from '../src/saved-view.ts'

describe('slugify', () => {
  test('lowercases and folds non-alphanumerics to a single dash', () => {
    expect(slugify('My  Saved_View!')).toBe('my-saved-view')
  })

  test('trims the ends', () => {
    expect(slugify('  --Hello--  ')).toBe('hello')
  })

  test('returns an empty string when nothing survives', () => {
    expect(slugify('!!!')).toBe('')
  })

  test('every non-empty result matches the slug pattern', () => {
    for (const title of ['A', 'Rust crates', '2026 plan', 'x--y']) {
      expect(slugify(title)).toMatch(SLUG_PATTERN)
    }
  })
})
