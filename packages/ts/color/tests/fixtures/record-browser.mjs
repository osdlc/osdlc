// Records browser.json: what headless Chromium computes for the inputs below.
// tests/browser-contract.test.ts reads the file; nothing runs this script in
// the test suite. Run it by hand to re-record, from this package's directory:
//
//   pnpm exec playwright install chromium
//   pnpm record:browser
//
// Re-recording overwrites browser.json. Run prettier on it, then review the
// diff before committing it.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'browser.json')

// Values assigned to `element.style.color`. A value the browser rejects leaves
// the style empty and is recorded with `computed: null`.
const COLORS = [
  // Hex, every length.
  '#f00',
  '#f008',
  '#1a2b3c',
  '#1a2b3c80',
  '#12345',
  '#1234567',
  '#ggg',
  // rgb() and rgba(), comma and space forms.
  'rgb(1, 2, 3)',
  'rgb(1 2 3)',
  'rgba(1, 2, 3, 0.5)',
  'rgba(1 2 3 / 0.5)',
  'rgb(1 2 3 / 0.5)',
  'rgba(1, 2, 3)',
  'rgb(1, 2, 3, 0.5)',
  'rgb(1.5, 2.25, 3.75)',
  'RGB(1, 2, 3)',
  'rgb( 1 , 2 , 3 )',
  'rgb(100%, 0%, 50%)',
  'rgb(100% 0% 50% / 50%)',
  'rgba(0, 0, 0, 50%)',
  'rgba(0, 0, 0, 0)',
  'rgb(1e1 2 3)',
  'rgb(.5 2 3)',
  // The space form may mix numbers and percentages.
  'rgb(100% 0 0)',
  'rgb(0 50% 255)',
  'rgb(10% 20 30% / 0.5)',
  // Out of range: clamped when computed.
  'rgb(300 0 0)',
  'rgb(-5, 0, 0, 2)',
  'rgb(0 0 0 / -1)',
  'rgb(200% 0% 0%)',
  // Malformed.
  'rgb(1 2 3 4 5)',
  'rgb(1 2 3 4)',
  'rgb(1, 2, 3, 4, 5)',
  'rgb(12abc 0 0)',
  'rgb(1, 2 3)',
  'rgb(1 2, 3)',
  'rgb(1, 2, 3 / 0.5)',
  'rgb(1 2 3 /)',
  'rgb(1 2 / 3)',
  'rgb(1, 2)',
  'rgb(1 2)',
  'rgb()',
  'rgb(a, b, c)',
  'rgb(1,, 2, 3)',
  'rgb(1, 2, 3,)',
  'rgb(1 2 3) x',
  'rgb(100%, 0, 0)',
  // color(srgb …).
  'color(srgb 1 0 0)',
  'color(srgb 0 0 0 / 0.25)',
  'color(srgb 100% 0% 0%)',
  'color(srgb 0.858824 0.87451 0.882353)',
  'color(srgb 0.5 0.5 0.5 / 50%)',
  'color(srgb 2 0 0)',
  'color(srgb -1 0 0)',
  'color(srgb 0 0 0 / 2)',
  'color(srgb 1 0)',
  'color(srgb 1 0 0 0.5)',
  'color(srgb 1 0 0 0 0)',
  'color(srgb x y z)',
  'color(srgb 1, 0, 0)',
  'color(srgb 1 0 0 /)',
  // Syntaxes parseColor does not read, though a browser does.
  'red',
  'transparent',
  'hsl(0 0% 0%)',
  'rgb(none 0 0)',
  'color(display-p3 1 0 0)',
  'color(srgb-linear 1 0 0)',
]

// `color-mix(in srgb, <base>, <overlay> <percent>%)`, which mixColors(base,
// overlay, percent / 100) claims to match for opaque colours.
const BASES_AND_OVERLAYS = [
  ['#000000', '#ffffff'],
  ['#ff0000', '#0000ff'],
  ['#1a2b3c', '#f0e0d0'],
  ['rgb(12, 200, 99)', 'rgb(250, 3, 177)'],
  ['#777777', '#123456'],
]
const PERCENTS = [0, 10, 25, 33.3, 50, 75, 90, 100]

// A translucent colour painted over an opaque ground on a 2D canvas, read back
// with getImageData. compositeOver claims to give the same pixel.
const SOURCES = [
  'rgba(0, 0, 0, 0.5)',
  'rgba(0, 0, 0, 0.6)',
  'rgba(255, 0, 0, 0.25)',
  'rgba(26, 115, 232, 0.1)',
  'rgba(200, 100, 50, 0.75)',
  'rgba(12, 200, 99, 0.333)',
]
// Out-of-range color(srgb …) is kept by getComputedStyle; the canvas clips it
// when it paints. parseColor clamps, which should match the painted pixel.
const OUT_OF_RANGE_SOURCES = ['color(srgb 2 0 0)', 'color(srgb -1 0 0)']
const GROUNDS = ['rgb(255, 255, 255)', 'rgb(0, 0, 0)', 'rgb(119, 119, 119)', 'rgb(240, 224, 208)']

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><div id="probe"></div>')
  const compute = (values) =>
    page.evaluate((list) => {
      const el = document.getElementById('probe')
      return list.map((value) => {
        el.style.color = ''
        el.style.color = value
        const accepted = el.style.color !== ''
        return { input: value, computed: accepted ? getComputedStyle(el).color : null }
      })
    }, values)

  const colors = await compute(COLORS)
  const mixInputs = BASES_AND_OVERLAYS.flatMap(([base, overlay]) =>
    PERCENTS.map((percent) => ({ base, overlay, percent })),
  )
  const mixed = await compute(
    mixInputs.map((m) => `color-mix(in srgb, ${m.base}, ${m.overlay} ${m.percent}%)`),
  )
  const colorMix = mixInputs.map((m, i) => ({ ...m, computed: mixed[i].computed }))

  const paintInputs = GROUNDS.flatMap((ground) =>
    [...SOURCES, ...OUT_OF_RANGE_SOURCES].map((src) => ({ src, ground })),
  )
  const painted = await page.evaluate((list) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    return list.map(({ src, ground }) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = ground
      ctx.fillRect(0, 0, 1, 1)
      ctx.fillStyle = src
      ctx.fillRect(0, 0, 1, 1)
      return Array.from(ctx.getImageData(0, 0, 1, 1).data)
    })
  }, paintInputs)
  const paint = paintInputs.map((p, i) => ({ ...p, pixel: painted[i] }))

  const fixture = {
    note:
      'Recorded by tests/fixtures/record-browser.mjs in headless Chromium. colors: each ' +
      "input is assigned to an element's style.color, and the value getComputedStyle " +
      'reports is kept; computed is null when the browser rejected the input. colorMix: ' +
      'the same for color-mix(in srgb, base, overlay percent%). paint: src filled over ' +
      'ground on a 1x1 2D canvas, read back with getImageData.',
    browser: `Chromium ${browser.version()} (Playwright headless shell)`,
    recorded: new Date().toISOString().slice(0, 10),
    colors,
    colorMix,
    paint,
  }
  writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`)
  process.stdout.write(`wrote ${OUT} (${fixture.browser})\n`)
} finally {
  await browser.close()
}
