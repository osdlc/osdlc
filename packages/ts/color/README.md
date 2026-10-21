# @osdlc/color

sRGB colour arithmetic for checking colour contrast. Parse the colours a
browser reports, mix and composite them as a browser does, and measure WCAG 2
contrast. No dependencies.

## Why

A contrast check has to measure the colour on the screen. Three things get in
the way:

- A browser reports colours in more than one syntax. `getComputedStyle` gives
  `rgb(…)` for most colours, but `color(srgb …)`, with 0-1 channels, for a
  colour made with `color-mix()`.
- A translucent colour never paints its own channels. It paints a mix with
  what is under it.
- The browser stores that mix as 8-bit channels, so the painted pixel is a
  rounded number.

This package reads the syntaxes a browser reports into one value, `Rgba`, with
channels 0-255 and alpha 0-1. It mixes the way `color-mix(in srgb, …)` does,
composites the way a browser paints, rounded to 8 bits, and gives the WCAG 2
contrast ratio. It throws on input it cannot read, so a typo does not become a
wrong contrast number.

It is for tools that check the colours of a user interface: theme and design
token builds, contrast tests that run in a headless browser, and lint
scripts.

When not to use it:

- For named colours (`red`), `hsl()`, `hwb()`, or other colour spaces such as
  `oklch()` or `display-p3`. Use culori (see below).
- To convert between colour spaces, or to mix in a perceptual space.
- For APCA or other contrast models than WCAG 2.

## Install

```sh
npm install @osdlc/color
```

`pnpm add @osdlc/color` and `yarn add @osdlc/color` work too.

ESM only. Node.js 22 or later.

## Quick start

```ts
import { compositeOver, contrastRatio, formatHex, mixColors, parseColor } from '@osdlc/color'

// Contrast of two CSS colours.
contrastRatio('#777777', '#ffffff') // 4.478..., just under the 4.5 AA bar

// A translucent text colour, measured as the pixel it paints on white.
const white = parseColor('#ffffff')
const painted = compositeOver(parseColor('rgba(0, 0, 0, 0.6)'), white)
painted // { r: 102, g: 102, b: 102, a: 1 }
contrastRatio(painted, white) // 5.74...

// A tint, as color-mix(in srgb, #ffffff, #1a73e8 25%) computes it.
formatHex(mixColors(white, parseColor('#1a73e8'), 0.25)) // '#c6dcf9'
```

## API

No function changes its arguments.

- `Rgba` is a colour: `r`, `g`, `b` 0-255 and `a` 0-1. The fields are
  `readonly`, so frozen objects and `as const` literals can be passed in.
- `parseColor(css)` reads hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`),
  `rgb()` and `rgba()` in the comma and the space form, and
  `color(srgb r g b [/ a])`. Channels are clamped to 0-255 and alpha to 0-1,
  so `rgb(300 0 0)` and `color(srgb 2 0 0)` both give `r` 255. A browser clamps
  `rgb()` when it computes the value; it keeps an out-of-range `color(srgb …)`
  as written, so there the clamp is this package's choice. Anything else
  throws: named colours, `hsl()`, `none`, extra arguments such as
  `rgb(1 2 3 4 5)`, and text such as `rgb(12abc 0 0)`.
- `formatHex(color)` writes `#rrggbb`, or `#rrggbbaa` when the alpha is below
  1. Channels are rounded and clamped.
- `mixColors(base, overlay, amount)` blends `amount` (0-1) of `overlay` into
  `base`. For opaque colours it gives what `color-mix(in srgb, base, overlay
  <amount>%)` computes.
- `withAlpha(color, alpha)` replaces the alpha.
- `fromPixel(px)` reads an `[r, g, b, a]` pixel from `ImageData.data`, where
  alpha is 0-255.
- `compositeOver(src, ground)` paints `src` over an opaque `ground` and
  rounds each channel to 8 bits. A `src` alpha outside 0-1 is clamped. A `src`
  with alpha exactly 1 is returned as is.
- `relativeLuminance(color)` is the WCAG 2 relative luminance, 0-1.
- `contrastRatio(a, b)` is the WCAG 2 contrast ratio, 1-21. Each side is an
  `Rgba` or a CSS string.

`relativeLuminance` and `contrastRatio` ignore alpha. Composite a translucent
colour with `compositeOver` first.

```ts
import { fromPixel, parseColor, relativeLuminance, withAlpha } from '@osdlc/color'

parseColor('color(srgb 0.5 0.5 0.5 / 50%)') // { r: 127.5, g: 127.5, b: 127.5, a: 0.5 }
withAlpha(parseColor('#1a73e8'), 0.5) // { r: 26, g: 115, b: 232, a: 0.5 }
fromPixel(new Uint8ClampedArray([0, 0, 0, 255])) // { r: 0, g: 0, b: 0, a: 1 }
relativeLuminance(parseColor('#ffffff')) // 1
```

### Errors

There is no error class. Every message starts with `color:`.

- `parseColor` throws an `Error` for input it cannot read. So does
  `contrastRatio` for a string side, and `fromPixel` for fewer than 4 entries.
- `mixColors` and `withAlpha` throw a `RangeError` when `amount` or `alpha` is
  `NaN` or infinite. A finite value outside 0-1 is clamped.
- `compositeOver` throws a `RangeError` when `ground.a` is below 1. Composite
  the ground over its own background first.

Each export has TSDoc in the source, with `@throws`. Your editor shows it.

### Measured against a browser

The tests compare the package with values recorded in headless Chromium:
`getComputedStyle` for each syntax `parseColor` reads, and for inputs the
browser rejects; `color-mix(in srgb, …)` for `mixColors`; and canvas pixels
for `compositeOver`. `compositeOver` matches the canvas to within one step per
channel. The step comes from Chromium rounding the alpha to 8 bits before it
blends; this package blends with the alpha as given.

## How it compares

[culori](https://github.com/Evercoder/culori) does nearly all of this and much
more. These results are from culori 4.0.2 on Node.js 24:

| | `@osdlc/color` | culori 4.0.2 |
|---|---|---|
| Syntaxes read | hex, `rgb()`/`rgba()`, `color(srgb …)` | all of CSS Color 4, with named colours, `hsl()` and other colour spaces |
| Channels | 0-255, alpha 0-1 | 0-1 |
| Bad input | throws an `Error` | `parse` returns `undefined`; `rgb(12abc 0 0)` throws an internal `TypeError` |
| `rgb(300 0 0)` | clamped to 255 | kept as is |
| Mix in sRGB | `mixColors` | `interpolate([a, b], 'rgb')(t)` |
| Composite | `compositeOver`, rounded to 8 bits: 50% black on white gives 128 | `blend`, not rounded: 0.5 (127.5 of 255); also takes a translucent ground |
| Luminance and contrast | `relativeLuminance`, `contrastRatio` | `wcagLuminance`, `wcagContrast`, with the same results: `#777777` on white is 4.4781 in both |
| Canvas pixels | `fromPixel` | none |
| Hex out | `formatHex` | `formatHex`, `formatHex8` |

Pick culori when you need named colours, `hsl()`, other colour spaces, or
perceptual mixing. Pick this package when you need the 8-bit painted pixel,
0-255 channels, and errors on bad input.

Other libraries:

- [colord](https://github.com/omgovich/colord) parses and mixes, and its
  `a11y` plugin gives contrast.
- [chroma-js](https://github.com/gka/chroma.js),
  [tinycolor2](https://github.com/bgrins/TinyColor) and
  [color](https://github.com/Qix-/color) parse, mix and give luminance.
- wcag-contrast and color-contrast-checker give contrast only.

None of them composites with the 8-bit rounding a browser paints.

## Stability

Every export is stable from 1.0.0. A breaking change to any of them needs a
new major version and is marked `Breaking:` in the CHANGELOG.

The experimental exports:

- none

## Runtimes and platforms

Node.js 22 or later, ESM only. The built package is tested on Node.js 22 and
24. The code is plain ES2022 arithmetic with no imports and no DOM, but other
runtimes, such as Bun, Deno or a browser, are not tested. It has no file system
or platform code, so it runs on any operating system. Its tests run on Linux and macOS.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
