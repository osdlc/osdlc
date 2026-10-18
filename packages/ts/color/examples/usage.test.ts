/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that.
 */

import { describe, expect, test } from 'vitest'

import {
  compositeOver,
  contrastRatio,
  formatHex,
  fromPixel,
  mixColors,
  parseColor,
  relativeLuminance,
  withAlpha,
  type Rgba,
} from '@osdlc/color'

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }

describe('check a text colour against its background', () => {
  test('two CSS colours give a WCAG 2 contrast ratio', () => {
    const ratio = contrastRatio('#777777', '#ffffff')
    expect(ratio).toBeCloseTo(4.48, 2)
    expect(ratio >= 4.5).toBe(false) // just under the AA bar for body text
  })

  test('a translucent colour is measured as the pixel it paints', () => {
    const text = parseColor('rgba(0, 0, 0, 0.6)')
    const painted = compositeOver(text, WHITE)
    expect(painted).toEqual({ r: 102, g: 102, b: 102, a: 1 })
    expect(contrastRatio(painted, WHITE)).toBeCloseTo(5.74, 2)
  })

  test('relative luminance of one colour', () => {
    expect(relativeLuminance(parseColor('#ffffff'))).toBeCloseTo(1, 10)
    expect(relativeLuminance(parseColor('#000'))).toBe(0)
  })
})

describe('build colours from other colours', () => {
  test('mix like color-mix(in srgb, …) and write hex', () => {
    const tint = mixColors(parseColor('#ffffff'), parseColor('#1a73e8'), 0.25)
    expect(formatHex(tint)).toBe('#c6dcf9')
  })

  test('make a colour translucent', () => {
    expect(formatHex(withAlpha(parseColor('#1a73e8'), 0.5))).toBe('#1a73e880')
  })

  test('read the value getComputedStyle reports for a color-mix()', () => {
    expect(parseColor('color(srgb 0.5 0.5 0.5)')).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 })
  })

  test('read a canvas pixel from getImageData', () => {
    const data = new Uint8ClampedArray([26, 115, 232, 255])
    expect(formatHex(fromPixel(data))).toBe('#1a73e8')
  })
})

describe('errors', () => {
  test('a colour parseColor cannot read throws an Error', () => {
    expect(() => parseColor('hsl(0 0% 0%)')).toThrow(Error)
    expect(() => parseColor('rgb(12abc 0 0)')).toThrow(Error)
  })

  test('a bad number throws a RangeError', () => {
    expect(() => mixColors(WHITE, WHITE, Number.NaN)).toThrow(RangeError)
    expect(() => compositeOver(WHITE, { ...WHITE, a: 0.5 })).toThrow(RangeError)
  })
})
