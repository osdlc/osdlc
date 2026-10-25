/** The ANSI palettes, the nearest-color lookups and the escape sequences per level. */
import { describe, expect, test } from 'vitest'

import {
  ANSI16_PALETTE,
  ANSI256_PALETTE,
  ANSI_BG_RESET,
  ANSI_FG_RESET,
  COLOR_LEVELS,
  COLOR_TOKENS,
  ansi16,
  ansiCodes,
  ansiColors,
  colors,
  nearestAnsi16,
  nearestAnsi256,
  paint,
  type ColorLevel,
} from '../src/index.ts'

describe('palettes', () => {
  test('xterm values: 16 basic colors, the cube and the gray ramp', () => {
    expect(ANSI16_PALETTE).toHaveLength(16)
    expect(ANSI256_PALETTE).toHaveLength(256)
    expect(ANSI256_PALETTE.slice(0, 16)).toEqual(ANSI16_PALETTE)
    expect(ANSI256_PALETTE[16]).toBe('#000000')
    expect(ANSI256_PALETTE[21]).toBe('#0000ff')
    expect(ANSI256_PALETTE[196]).toBe('#ff0000')
    expect(ANSI256_PALETTE[231]).toBe('#ffffff')
    expect(ANSI256_PALETTE[232]).toBe('#080808')
    expect(ANSI256_PALETTE[255]).toBe('#eeeeee')
  })
})

describe('nearestAnsi16 and nearestAnsi256', () => {
  test('an exact palette color maps to itself', () => {
    expect(nearestAnsi16('#cd0000')).toBe(1)
    expect(nearestAnsi256('#5f87ff')).toBe(69)
  })

  test('a near color maps to the closest entry by sRGB distance', () => {
    expect(nearestAnsi16('#1d59d8')).toBe(12)
    expect(nearestAnsi256('#f7768e')).toBe(210)
    expect(nearestAnsi256({ r: 26, g: 26, b: 28, a: 1 })).toBe(234)
  })

  test('nearestAnsi256 never returns a basic color', () => {
    expect(nearestAnsi256('#cd0000')).toBeGreaterThanOrEqual(16)
  })

  test('a string that does not parse throws', () => {
    expect(() => nearestAnsi16('red')).toThrow(Error)
    expect(() => nearestAnsi256('hsl(0 0% 0%)')).toThrow(Error)
  })
})

describe('ansiCodes', () => {
  test('truecolor writes the channels', () => {
    expect(ansiCodes('#6a9bff', 'truecolor')).toEqual({
      fg: '\x1b[38;2;106;155;255m',
      bg: '\x1b[48;2;106;155;255m',
    })
  })

  test('256 writes the palette index', () => {
    expect(ansiCodes('#6a9bff', 'ansi256')).toEqual({ fg: '\x1b[38;5;69m', bg: '\x1b[48;5;69m' })
  })

  test('16 writes 30-37 for normal and 90-97 for bright colors', () => {
    expect(ansiCodes('#cd0000', 'ansi16')).toEqual({ fg: '\x1b[31m', bg: '\x1b[41m' })
    expect(ansiCodes('#ffffff', 'ansi16')).toEqual({ fg: '\x1b[97m', bg: '\x1b[107m' })
  })

  test('none gives empty strings', () => {
    expect(ansiCodes('#6a9bff', 'none')).toEqual({ fg: '', bg: '' })
  })

  test('an unknown level throws a RangeError', () => {
    expect(() => ansiCodes('#000000', 'ansi88' as ColorLevel)).toThrow(RangeError)
  })
})

describe('ansiColors', () => {
  test.each(COLOR_LEVELS)('every token has codes at %s', (level) => {
    for (const theme of ['light', 'dark'] as const) {
      const map = ansiColors(level, theme)
      expect(Object.keys(map).sort()).toEqual([...COLOR_TOKENS].sort())
      expect(Object.isFrozen(map)).toBe(true)
    }
  })

  test('above 16 colors each token is the nearest code for its color', () => {
    for (const level of ['ansi256', 'truecolor'] as const) {
      const map = ansiColors(level, 'dark')
      for (const t of COLOR_TOKENS) expect(map[t]).toEqual(ansiCodes(colors.dark[t], level))
    }
  })

  test('at 16 colors each token takes its chosen basic color', () => {
    const light = ansiColors('ansi16', 'light')
    expect(light['status-error'].fg).toBe('\x1b[31m')
    expect(light['status-warning'].fg).toBe('\x1b[33m')
    expect(ansiColors('ansi16', 'dark').accent.fg).toBe('\x1b[94m')
    expect(ansi16.dark.accent).toBe(12)
  })

  test('none gives empty codes for every token', () => {
    for (const codes of Object.values(ansiColors('none', 'dark'))) {
      expect(codes).toEqual({ fg: '', bg: '' })
    }
  })

  test('an unknown level throws a RangeError', () => {
    expect(() => ansiColors('ansi88' as ColorLevel, 'dark')).toThrow(RangeError)
  })
})

describe('paint', () => {
  const codes = ansiCodes('#cd0000', 'ansi16')

  test('wraps text in the color and resets only that layer', () => {
    expect(paint('x', codes)).toBe(`\x1b[31mx${ANSI_FG_RESET}`)
    expect(paint('x', codes, 'bg')).toBe(`\x1b[41mx${ANSI_BG_RESET}`)
    expect(ANSI_FG_RESET).toBe('\x1b[39m')
    expect(ANSI_BG_RESET).toBe('\x1b[49m')
  })

  test('returns the text unchanged with no color', () => {
    expect(paint('x', ansiCodes('#cd0000', 'none'))).toBe('x')
  })
})
