import { describe, expect, test } from 'vitest'

import { toCamelKey } from '../../src/core/camel.js'

// toCamelKey derives a section's lowerCamelCase access key from its heading text. Each case
// is a heading and the exact key it produces.

describe('toCamelKey — heading → lowerCamelCase access key', () => {
  test('a multi-word heading lowerCamels', () => {
    expect(toCamelKey('Files to touch')).toBe('filesToTouch')
  })

  test('any run of non-alphanumeric characters is a word separator', () => {
    expect(toCamelKey('Goal / Problem statement')).toBe('goalProblemStatement')
  })

  test('casing is normalized — so these two headings collide on one key', () => {
    expect(toCamelKey('Files To Touch')).toBe('filesToTouch')
    expect(toCamelKey('Files to touch')).toBe('filesToTouch')
  })

  test('a single word → itself, lowercased', () => {
    expect(toCamelKey('Summary')).toBe('summary')
  })

  test('Unicode letters and digits are kept (split is \\p{L}\\p{N}-aware)', () => {
    expect(toCamelKey('Café notes 2')).toBe('caféNotes2')
  })

  test('a heading with no alphanumeric content → empty key (no generated alias)', () => {
    expect(toCamelKey('---')).toBe('')
  })
})
