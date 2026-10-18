/**
 * Unit tests for every export. The cases that matter are the boundary ones:
 * the syntaxes a browser reports, what parseColor rejects and clamps, the
 * RangeErrors, the 8-bit rounding that makes a composite the pixel a browser
 * paints, and the WCAG luminance breakpoint. tests/browser-contract.test.ts
 * checks the same functions against values recorded in a browser.
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
} from '../index.ts'

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 }
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }

describe('Rgba', () => {
  test('frozen and `as const` colours are accepted', () => {
    const frozen = Object.freeze({ r: 0, g: 0, b: 0, a: 0.5 })
    const literal = { r: 255, g: 255, b: 255, a: 1 } as const
    expect(compositeOver(frozen, literal)).toEqual({ r: 128, g: 128, b: 128, a: 1 })
    expect(mixColors(frozen, literal, 1)).toEqual(WHITE)
    expect(withAlpha(frozen, 1)).toEqual(BLACK)
    expect(formatHex(frozen)).toBe('#00000080')
    expect(contrastRatio(frozen, literal)).toBeCloseTo(21, 10)
  })

  test('results are plain objects, read-only only in their type', () => {
    const color = parseColor('#fff')
    expect(Object.isFrozen(color)).toBe(false)
    // @ts-expect-error -- the fields are readonly.
    color.r = 0
    expect(color.r).toBe(0)
  })
})

describe('parseColor', () => {
  test('hex in all four lengths', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(parseColor('#f008')).toEqual({ r: 255, g: 0, b: 0, a: 0x88 / 255 })
    expect(parseColor('#1a2b3c')).toEqual({ r: 0x1a, g: 0x2b, b: 0x3c, a: 1 })
    expect(parseColor('#1a2b3c80')).toEqual({ r: 0x1a, g: 0x2b, b: 0x3c, a: 0x80 / 255 })
  })

  test('leading and trailing whitespace is ignored', () => {
    expect(parseColor('  #fff  ')).toEqual(WHITE)
    expect(parseColor(' rgb( 1 , 2 , 3 ) ')).toEqual({ r: 1, g: 2, b: 3, a: 1 })
  })

  test('rgb() and rgba(), in the comma form and the space form', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 })
    expect(parseColor('rgb(1 2 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 })
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 })
    expect(parseColor('rgb(1 2 3 / 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 })
    expect(parseColor('RGBA(1 2 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 })
  })

  test('channels are not rounded', () => {
    expect(parseColor('rgb(1.5 2.25 3.75)')).toEqual({ r: 1.5, g: 2.25, b: 3.75, a: 1 })
  })

  test('CSS number forms: a leading dot, a sign, an exponent', () => {
    expect(parseColor('rgb(.5 +2 1e1)')).toEqual({ r: 0.5, g: 2, b: 10, a: 1 })
  })

  test('a percentage channel is 255-scaled and a percentage alpha is not', () => {
    expect(parseColor('rgb(100%, 0%, 50%)')).toEqual({ r: 255, g: 0, b: 127.5, a: 1 })
    expect(parseColor('rgba(0, 0, 0, 50%)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 })
    // The space form may mix numbers and percentages; the comma form may not.
    expect(parseColor('rgb(100% 0 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  test('color(srgb …) channels are 0-1 numbers or percentages', () => {
    expect(parseColor('color(srgb 1 0 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(parseColor('color(srgb 0 0 0 / 0.25)')).toEqual({ r: 0, g: 0, b: 0, a: 0.25 })
    expect(parseColor('color(srgb 100% 0% 0%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(parseColor('color(srgb 0.5 0.5 0.5 / 50%)')).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
      a: 0.5,
    })
  })

  test('rgb() channels are clamped to 0-255 and alpha to 0-1', () => {
    expect(parseColor('rgb(300 0 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(parseColor('rgb(-5, 0, 0, 2)')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(parseColor('rgb(0 0 0 / -1)')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseColor('rgb(200% 0% 0% / 150%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  test('color(srgb …) channels are clamped too', () => {
    expect(parseColor('color(srgb 2 0 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(parseColor('color(srgb -1 0 0 / 2)')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
  })

  test('extra parts throw', () => {
    expect(() => parseColor('rgb(1 2 3 4 5)')).toThrow(/unparseable colour/)
    expect(() => parseColor('rgb(1 2 3 4)')).toThrow(/unparseable colour/)
    expect(() => parseColor('rgb(1, 2, 3, 4, 5)')).toThrow(/unparseable colour/)
    expect(() => parseColor('rgb(1 2 3 / 4 / 5)')).toThrow(/unparseable colour/)
    expect(() => parseColor('rgb(1 2 3 / 4 5)')).toThrow(/unparseable colour/)
    expect(() => parseColor('color(srgb 1 0 0 0.5)')).toThrow(/unparseable colour/)
    expect(() => parseColor('color(srgb 1 0 0 0 0)')).toThrow(/unparseable colour/)
  })

  test('non-numeric text throws', () => {
    expect(() => parseColor('rgb(12abc 0 0)')).toThrow(/unparseable colour/)
    expect(() => parseColor('rgb(a, b, c)')).toThrow(/unparseable colour/)
    expect(() => parseColor('rgb(1 2 3 / x)')).toThrow(/unparseable colour/)
    expect(() => parseColor('rgb(none 0 0)')).toThrow(/unparseable colour/)
    expect(() => parseColor('color(srgb x y z)')).toThrow(/unparseable colour/)
  })

  test('other malformed input throws', () => {
    for (const bad of [
      'rgb(1, 2)',
      'rgb(1 2)',
      'rgb()',
      'rgb(1, 2 3)',
      'rgb(1 2, 3)',
      'rgb(1, 2, 3 / 0.5)',
      'rgb(1 2 3 /)',
      'rgb(1 2 / 3)',
      'rgb(1,, 2, 3)',
      'rgb(1, 2, 3,)',
      'rgb(100%, 0, 0)',
      'color(srgb 1 0)',
      'color(srgb 1, 0, 0)',
      'color(srgb 1 0 0 /)',
    ]) {
      expect(() => parseColor(bad)).toThrow(/unparseable colour/)
    }
    expect(() => parseColor('rgb(1 2 3) x')).toThrow(/unsupported colour syntax/)
  })

  test('other syntaxes throw', () => {
    expect(() => parseColor('red')).toThrow(/unsupported colour syntax/)
    expect(() => parseColor('rebeccapurple')).toThrow(/unsupported colour syntax/)
    expect(() => parseColor('hsl(0 0% 0%)')).toThrow(/unsupported colour syntax/)
    expect(() => parseColor('color(display-p3 1 0 0)')).toThrow(/unsupported colour syntax/)
    expect(() => parseColor('color(srgb-linear 1 0 0)')).toThrow(/unsupported colour syntax/)
    expect(() => parseColor('#12345')).toThrow(/unsupported hex colour/)
    expect(() => parseColor('#1234567')).toThrow(/unsupported hex colour/)
  })

  test('a parse failure is a plain Error with a color: prefix', () => {
    let caught: unknown
    try {
      parseColor('red')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(RangeError)
    expect((caught as Error).message).toBe("color: unsupported colour syntax 'red'")
  })
})

describe('formatHex', () => {
  test('an opaque colour is six digits', () => {
    expect(formatHex({ r: 26, g: 43, b: 60, a: 1 })).toBe('#1a2b3c')
  })

  test('a translucent colour carries its alpha pair', () => {
    expect(formatHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080')
  })

  test('channels are rounded and clamped into range', () => {
    expect(formatHex({ r: 300, g: -20, b: 127.6, a: 1 })).toBe('#ff0080')
  })
})

describe('mixColors', () => {
  test('half of white into black is the midpoint', () => {
    expect(mixColors(BLACK, WHITE, 0.5)).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 })
  })

  test('the endpoints are the inputs, and amount is clamped', () => {
    expect(mixColors(BLACK, WHITE, 0)).toEqual(BLACK)
    expect(mixColors(BLACK, WHITE, 1)).toEqual(WHITE)
    expect(mixColors(BLACK, WHITE, 2)).toEqual(WHITE)
    expect(mixColors(BLACK, WHITE, -1)).toEqual(BLACK)
  })

  test('alpha interpolates with the channels', () => {
    expect(mixColors(BLACK, { ...WHITE, a: 0 }, 0.5).a).toBe(0.5)
  })

  test('a NaN or infinite amount throws a RangeError', () => {
    for (const amount of [Number.NaN, Infinity, -Infinity]) {
      expect(() => mixColors(BLACK, WHITE, amount)).toThrow(RangeError)
    }
    expect(() => mixColors(BLACK, WHITE, Number.NaN)).toThrow(
      'color: mixColors amount must be a finite number, got NaN',
    )
  })
})

describe('withAlpha', () => {
  test('the channels survive and the alpha is clamped', () => {
    expect(withAlpha({ r: 1, g: 2, b: 3, a: 1 }, 0.25)).toEqual({ r: 1, g: 2, b: 3, a: 0.25 })
    expect(withAlpha(BLACK, 5).a).toBe(1)
    expect(withAlpha(BLACK, -5).a).toBe(0)
  })

  test('a NaN or infinite alpha throws a RangeError', () => {
    for (const alpha of [Number.NaN, Infinity, -Infinity]) {
      expect(() => withAlpha(BLACK, alpha)).toThrow(RangeError)
    }
    expect(() => withAlpha(BLACK, Infinity)).toThrow(
      'color: withAlpha alpha must be a finite number, got Infinity',
    )
  })
})

describe('fromPixel', () => {
  test('an opaque pixel is alpha 1', () => {
    expect(fromPixel([10, 20, 30, 255])).toEqual({ r: 10, g: 20, b: 30, a: 1 })
  })

  test('a half-opaque pixel is alpha ~0.502, not 128', () => {
    expect(fromPixel([0, 0, 0, 128]).a).toBeCloseTo(0.502, 3)
  })

  test('a Uint8ClampedArray, as getImageData returns, works', () => {
    expect(fromPixel(new Uint8ClampedArray([1, 2, 3, 255]))).toEqual({ r: 1, g: 2, b: 3, a: 1 })
  })

  test('fewer than four channels throws', () => {
    expect(() => fromPixel([1, 2, 3])).toThrow(/4 channels/)
  })
})

describe('compositeOver', () => {
  test('an opaque source is returned as is', () => {
    expect(compositeOver(BLACK, WHITE)).toBe(BLACK)
    expect(compositeOver(WHITE, BLACK)).toBe(WHITE)
  })

  test.each([2, 1.5])('a source alpha of %s is treated as opaque', (a) => {
    const src: Rgba = { r: 10, g: 20, b: 30, a }
    const out = compositeOver(src, WHITE)
    expect(out).toEqual({ r: 10, g: 20, b: 30, a: 1 })
    expect(out).not.toBe(src)
  })

  test.each([-1, -0.5])('a source alpha of %s is treated as 0', (a) => {
    expect(compositeOver({ r: 10, g: 20, b: 30, a }, { r: 1, g: 2, b: 3, a: 1 })).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 1,
    })
  })

  test('50% black over white is the 8-bit midpoint, opaque', () => {
    expect(compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE)).toEqual({
      r: 128,
      g: 128,
      b: 128,
      a: 1,
    })
    // The same colour as getImageData reports it: alpha 128/255, a hair under
    // a half, so the rounded channel lands one below.
    expect(compositeOver(fromPixel([0, 0, 0, 128]), WHITE)).toEqual({
      r: 127,
      g: 127,
      b: 127,
      a: 1,
    })
  })

  test('a fully transparent source is the ground', () => {
    expect(compositeOver({ r: 0, g: 0, b: 0, a: 0 }, WHITE)).toEqual(WHITE)
  })

  test('a translucent ground throws a RangeError, whatever the source', () => {
    const red = { r: 255, g: 0, b: 0, a: 0.5 }
    const clearBlue = { r: 0, g: 0, b: 255, a: 0 }
    expect(() => compositeOver(red, clearBlue)).toThrow(RangeError)
    expect(() => compositeOver(red, clearBlue)).toThrow(
      'color: compositeOver needs an opaque ground, got alpha 0',
    )
    expect(() => compositeOver(BLACK, { ...WHITE, a: 0.99 })).toThrow(RangeError)
    expect(() => compositeOver(BLACK, { ...WHITE, a: NaN })).toThrow(
      'color: compositeOver needs an opaque ground, got alpha NaN',
    )
  })

  test('a source alpha that is NaN or infinite throws a RangeError', () => {
    expect(() => compositeOver({ ...BLACK, a: NaN }, WHITE)).toThrow(
      'color: compositeOver needs a finite source alpha, got NaN',
    )
    expect(() => compositeOver({ ...BLACK, a: Infinity }, WHITE)).toThrow(RangeError)
  })
})

describe('relativeLuminance', () => {
  test('black is 0 and white is 1', () => {
    expect(relativeLuminance(BLACK)).toBe(0)
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10)
  })

  // Pins the corrected WCAG breakpoint: 0.04 falls between the old 0.03928
  // and the current 0.04045, so only 0.04045 takes the linear branch.
  test('a channel of 0.04 takes the LINEAR branch', () => {
    const l = relativeLuminance(parseColor('color(srgb 0.04 0.04 0.04)'))
    // The two branches nearly meet here (they differ by ~5e-7), so the
    // tolerance has to be tighter than that for the assertion to pin anything.
    expect(l).toBeCloseTo(0.04 / 12.92, 12)
  })
})

describe('contrastRatio', () => {
  test('black against white is the 21:1 maximum', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10)
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 10)
  })

  test('a colour against itself is 1:1', () => {
    expect(contrastRatio(BLACK, BLACK)).toBe(1)
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 10)
  })

  test('a known mid-grey: #777777 on white is 4.4781', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.4781, 4)
  })

  test('either side may be a CSS string', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 10)
    expect(contrastRatio('#000', WHITE)).toBeCloseTo(21, 10)
    expect(contrastRatio(BLACK, 'rgb(255, 255, 255)')).toBeCloseTo(21, 10)
  })

  test('alpha is ignored', () => {
    expect(contrastRatio('rgba(0,0,0,0)', '#fff')).toBeCloseTo(21, 10)
  })

  test('a string that does not parse throws', () => {
    expect(() => contrastRatio('red', WHITE)).toThrow(/unsupported colour syntax/)
  })
})
