/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that.
 */

import { describe, expect, test } from 'vitest'

import {
  ANSI16_PALETTE,
  ANSI256_PALETTE,
  ANSI_BG_RESET,
  ANSI_FG_RESET,
  COLOR_LEVELS,
  COLOR_TOKENS,
  CONTRAST_PAIRS,
  THEMES,
  ansi16,
  ansiCodes,
  ansiColors,
  colors,
  controlPattern,
  cssSheet,
  detectColorLevel,
  displayWidth,
  fitWidth,
  fonts,
  nearestAnsi16,
  nearestAnsi256,
  paint,
  radii,
  stripControls,
  tokensCss,
  type AnsiCodes,
  type ColorDetectInput,
  type ColorLevel,
  type ColorToken,
  type CssSheetOptions,
  type FitWidthOptions,
  type Palette,
  type StripControlsOptions,
  type Theme,
} from '@osdlc/ux'

describe('read the tokens', () => {
  test('colors per theme, radii and fonts', () => {
    const theme: Theme = THEMES[1]!
    const palette: Palette = colors[theme]
    const token: ColorToken = COLOR_TOKENS[0]!
    expect(palette[token]).toBe('#1a1b20')
    expect(radii.sm).toBe('6px')
    expect(fonts.mono).toContain('monospace')
    expect(CONTRAST_PAIRS).toContainEqual(['text-muted', 'bg-hover'])
    expect(ansi16.light['status-success']).toBe(2)
  })
})

describe('style a web page', () => {
  test('the sheet declares every token as a custom property', () => {
    expect(tokensCss).toContain('--ux-text-primary: #1a1a1c;')
    const options: CssSheetOptions = { prefix: 'app' }
    expect(cssSheet(options)).toContain('@media (prefers-color-scheme: dark)')
    expect(cssSheet(options)).toContain(":root[data-theme='dark']")
  })
})

describe('color a terminal', () => {
  test('decide the level from the environment and the flags', () => {
    const input: ColorDetectInput = {
      env: { TERM: 'xterm-256color' },
      isTTY: true,
      override: undefined,
    }
    expect(detectColorLevel(input)).toBe('ansi256')
    expect(detectColorLevel({ ...input, env: { ...input.env, NO_COLOR: '1' } })).toBe('none')
    expect(detectColorLevel({ ...input, override: false })).toBe('none')
    expect(COLOR_LEVELS).toEqual(['none', 'ansi16', 'ansi256', 'truecolor'])
  })

  test('paint a status with its token, and keep a text marker', () => {
    const level: ColorLevel = 'ansi16'
    const ansi = ansiColors(level, 'dark')
    const failed: AnsiCodes = ansi['status-error']
    expect(paint('✗ failed', failed)).toBe(`\x1b[31m✗ failed${ANSI_FG_RESET}`)
    expect(paint('✗ failed', ansiColors('none', 'dark')['status-error'])).toBe('✗ failed')
    expect(paint(' ', ansi['bg-hover'], 'bg')).toBe(`\x1b[100m ${ANSI_BG_RESET}`)
  })

  test('codes for a color that is not a token', () => {
    expect(ansiCodes('#ff8700', 'truecolor').fg).toBe('\x1b[38;2;255;135;0m')
    expect(ANSI256_PALETTE[nearestAnsi256('#ff8700')]).toBe('#ff8700')
    expect(ANSI16_PALETTE[nearestAnsi16('#ff8700')]).toBe('#cdcd00')
  })
})

describe('print untrusted text', () => {
  test('strip controls, then fit the line to the columns', () => {
    const name = 'build\x1b]52;c;cm0gLXJmIH4=\x07 日本語 task'
    const options: StripControlsOptions = { newline: false }
    const safe = stripControls(name, options)
    expect(safe).toBe('build 日本語 task')
    expect(displayWidth(safe)).toBe(17)
    const fit: FitWidthOptions = { pad: true }
    expect(fitWidth(safe, 10, fit)).toBe('build 日… ')
  })

  test('replace each control character, keeping the length', () => {
    const name = 'build\x1b]0;x\x07\u202e'
    const marked = name.replace(controlPattern(), '\ufffd')
    expect(marked).toBe('build\ufffd]0;x\ufffd\ufffd')
    expect(marked.length).toBe(name.length)
    expect('a\tb\r\n'.replace(controlPattern({ newline: true, tab: true }), '')).toBe('a\tb\n')
  })

  test('errors', () => {
    expect(() => fitWidth('x', -1)).toThrow(RangeError)
    expect(() => cssSheet({ prefix: 'Bad' })).toThrow(RangeError)
  })
})
