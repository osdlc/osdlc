/**
 * Contract tests against a real browser. fixtures/browser.json holds what
 * headless Chromium computed for each input; fixtures/record-browser.mjs
 * recorded it and says how to record it again. Three claims are checked:
 *
 * - parseColor reads each input as the browser computes it, with one
 *   deliberate difference: it clamps an out-of-range `color(srgb …)`, which
 *   the computed value keeps (see CLAMPED). The canvas cases below check that
 *   the clamped colour is what the browser paints. parseColor rejects every
 *   input the browser rejects. The syntaxes it does not support (named
 *   colours, `hsl()`, `none`, other colour spaces) are listed below; the
 *   browser reads those and parseColor throws.
 * - mixColors(base, overlay, p / 100) gives what
 *   `color-mix(in srgb, base, overlay p%)` computes, for opaque colours.
 * - compositeOver(src, ground) gives the pixel a 2D canvas paints for src
 *   filled over ground, to within one step per channel. Chromium rounds the
 *   alpha to 8 bits and blends in integers, so some channels land one away.
 */
import { describe, expect, test } from 'vitest'

import { compositeOver, mixColors, parseColor } from '../index.ts'
import fixture from './fixtures/browser.json'

interface Computed {
  input: string
  computed: string | null
}

interface Mixed {
  base: string
  overlay: string
  percent: number
  computed: string | null
}

interface Painted {
  src: string
  ground: string
  pixel: number[]
}

const colors: Computed[] = fixture.colors
const colorMix: Mixed[] = fixture.colorMix
const paint: Painted[] = fixture.paint

/** Inputs the browser reads that parseColor rejects by design. */
const UNSUPPORTED = new Set([
  'red',
  'transparent',
  'hsl(0 0% 0%)',
  'rgb(none 0 0)',
  'color(display-p3 1 0 0)',
  'color(srgb-linear 1 0 0)',
])

/** Inputs whose computed value is out of range; parseColor clamps them. */
const CLAMPED = new Set(['color(srgb 2 0 0)', 'color(srgb -1 0 0)'])

/**
 * Read a computed colour without parseColor's clamp: `rgb()`/`rgba()` with
 * 0-255 channels, or `color(srgb …)` with 0-1 channels scaled to 0-255.
 */
function readComputed(computed: string): { r: number; g: number; b: number; a: number } {
  const m = /^(rgba?|color)\((?:srgb )?([^)]*)\)$/.exec(computed)
  if (!m) throw new Error(`unexpected computed colour '${computed}'`)
  const scale = m[1] === 'color' ? 255 : 1
  const [r, g, b, a] = m[2]!.split(/[\s,/]+/).map(Number)
  return { r: r! * scale, g: g! * scale, b: b! * scale, a: a ?? 1 }
}

test(`the fixture was recorded in a browser (${fixture.browser}, ${fixture.recorded})`, () => {
  expect(fixture.browser).toMatch(/^Chromium \d+/)
  expect(colors.length).toBeGreaterThan(0)
  expect(colorMix.length).toBeGreaterThan(0)
  expect(paint.length).toBeGreaterThan(0)
})

describe('parseColor against getComputedStyle', () => {
  const accepted = colors.filter(
    (c) => c.computed !== null && !UNSUPPORTED.has(c.input) && !CLAMPED.has(c.input),
  )

  test.each(accepted.map((c) => [c.input, c.computed!]))('%s computes to %s', (input, computed) => {
    // The browser writes rgb() channels as integers and alpha with up to
    // three decimals, so allow half a step of each.
    const ours = parseColor(input)
    const browser = readComputed(computed)
    for (const key of ['r', 'g', 'b'] as const) {
      expect(Math.abs(ours[key] - browser[key])).toBeLessThanOrEqual(0.5)
    }
    expect(Math.abs(ours.a - browser.a)).toBeLessThanOrEqual(0.0025)
  })

  test.each(colors.filter((c) => c.computed === null).map((c) => [c.input]))(
    '%s is rejected by the browser and by parseColor',
    (input) => {
      expect(() => parseColor(input)).toThrow(/^color: /)
    },
  )

  test('an out-of-range color(srgb …) is kept by the browser and clamped by parseColor', () => {
    const kept = colors.filter((c) => CLAMPED.has(c.input))
    expect(kept.length).toBe(CLAMPED.size)
    for (const c of kept) {
      const browser = readComputed(c.computed!)
      const ours = parseColor(c.input)
      expect(browser.r < 0 || browser.r > 255).toBe(true)
      expect(ours.r).toBe(browser.r > 255 ? 255 : 0)
    }
  })

  test('the unsupported list matches the fixture', () => {
    const inFixture = colors.filter((c) => UNSUPPORTED.has(c.input))
    expect(inFixture.length).toBe(UNSUPPORTED.size)
    for (const c of inFixture) {
      expect(c.computed).not.toBeNull()
      expect(() => parseColor(c.input)).toThrow(/unsupported colour syntax|unparseable colour/)
    }
  })
})

describe('mixColors against color-mix(in srgb, …)', () => {
  test.each(colorMix.map((m) => [m.base, m.overlay, m.percent, m.computed!]))(
    'color-mix(in srgb, %s, %s %d%) is %s',
    (base, overlay, percent, computed) => {
      const ours = mixColors(parseColor(base), parseColor(overlay), percent / 100)
      const browser = parseColor(computed)
      // Chromium writes six significant digits, about 1e-4 on the 0-255 scale.
      for (const key of ['r', 'g', 'b', 'a'] as const) {
        expect(ours[key]).toBeCloseTo(browser[key], 3)
      }
    },
  )
})

describe('compositeOver against a canvas pixel', () => {
  test.each(paint.map((p) => [p.src, p.ground, p.pixel]))(
    '%s over %s paints %j',
    (src, ground, pixel) => {
      const ours = compositeOver(parseColor(src), parseColor(ground))
      const [r, g, b, a] = pixel
      expect(a).toBe(255)
      expect(Math.abs(ours.r - r!)).toBeLessThanOrEqual(1)
      expect(Math.abs(ours.g - g!)).toBeLessThanOrEqual(1)
      expect(Math.abs(ours.b - b!)).toBeLessThanOrEqual(1)
    },
  )
})
