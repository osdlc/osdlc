/**
 * The token data: values are plain hex, every promised pair meets WCAG AA in
 * both themes, and the data cannot be changed by a consumer.
 */
import { contrastRatio, parseColor } from '@osdlc/color'
import { describe, expect, test } from 'vitest'

import { COLOR_TOKENS, CONTRAST_PAIRS, THEMES, ansi16, colors, fonts, radii } from '../src/index.ts'

const AA = 4.5

describe('colors', () => {
  test.each(THEMES)('%s has every token, each a hex or rgb() value', (theme) => {
    expect(Object.keys(colors[theme]).sort()).toEqual([...COLOR_TOKENS].sort())
    for (const value of Object.values(colors[theme])) {
      expect(value).toMatch(/^(#[0-9a-f]{6}|rgb\(\d{1,3}, \d{1,3}, \d{1,3}\))$/)
      expect(parseColor(value).a).toBe(1)
    }
  })

  test.each(THEMES)('every contrast pair meets WCAG AA in %s', (theme) => {
    const failing = CONTRAST_PAIRS.filter(
      ([text, ground]) => contrastRatio(colors[theme][text], colors[theme][ground]) < AA,
    ).map(([text, ground]) => `${text} on ${ground}`)
    expect(failing).toEqual([])
  })

  test('every text, accent and status token is paired with every ground', () => {
    const grounds = COLOR_TOKENS.filter((t) => t.startsWith('bg-'))
    const texts = COLOR_TOKENS.filter(
      (t) => t.startsWith('text-') || t.startsWith('status-') || t === 'accent',
    )
    for (const text of texts) {
      for (const ground of grounds) {
        expect(CONTRAST_PAIRS.some(([a, b]) => a === text && b === ground)).toBe(true)
      }
    }
    expect(CONTRAST_PAIRS).toContainEqual(['accent-fg', 'accent'])
  })
})

describe('ansi16', () => {
  test.each(THEMES)('%s gives every token a basic color, 0-15', (theme) => {
    expect(Object.keys(ansi16[theme]).sort()).toEqual([...COLOR_TOKENS].sort())
    for (const n of Object.values(ansi16[theme])) {
      expect(Number.isInteger(n) && n >= 0 && n <= 15).toBe(true)
    }
  })

  test('status tokens keep their hue: green, yellow, red', () => {
    for (const theme of THEMES) {
      expect(ansi16[theme]['status-success']).toBe(2)
      expect(ansi16[theme]['status-warning']).toBe(3)
      expect(ansi16[theme]['status-error']).toBe(1)
    }
  })
})

describe('radii and fonts', () => {
  test('radii are CSS pixel lengths', () => {
    for (const value of Object.values(radii)) expect(value).toMatch(/^\d+px$/)
  })

  test('font stacks end in a generic family', () => {
    expect(fonts.sans.endsWith('sans-serif')).toBe(true)
    expect(fonts.mono.endsWith('monospace')).toBe(true)
  })
})

test('the data is frozen', () => {
  for (const value of [COLOR_TOKENS, THEMES, CONTRAST_PAIRS, colors, colors.light, colors.dark]) {
    expect(Object.isFrozen(value)).toBe(true)
  }
  for (const value of [ansi16, ansi16.light, ansi16.dark, radii, fonts, CONTRAST_PAIRS[0]]) {
    expect(Object.isFrozen(value)).toBe(true)
  }
})
