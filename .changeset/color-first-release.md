---
'@osdlc/color': major
---

The first release on npm, and the start of the stable 1.x line. Earlier versions were used only
during development and were never published, so this entry lists everything the package does. It
is sRGB colour arithmetic for measuring what a browser paints: it reads the CSS colour syntaxes a
browser reports into one value, mixes and composites in gamma-encoded sRGB, and measures WCAG 2
relative luminance and contrast. No dependencies.

- `Rgba` is a colour with `readonly` channels `r`, `g` and `b` (0-255) and alpha `a` (0-1).
- `parseColor(css)` reads hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()`, `rgba()` and
  `color(srgb …)`, in the comma and space forms with numbers or percentages. It clamps channels
  to 0-255 and alpha to 0-1, and throws on any input a browser rejects.
- `formatHex(color)` writes `#rrggbb`, or `#rrggbbaa` when the alpha is below 1.
- `mixColors(base, overlay, amount)` blends as `color-mix(in srgb, …)` does, and
  `withAlpha(color, alpha)` replaces the alpha. Each clamps a finite value to 0-1 and throws a
  `RangeError` on `NaN` or an infinite one.
- `fromPixel(px)` converts an `[r, g, b, a]` pixel with alpha 0-255, the layout of
  `ImageData.data`, into an `Rgba`.
- `compositeOver(src, ground)` paints a colour over an opaque ground (source-over, straight
  alpha) and rounds each channel to 8 bits, so a translucent colour is measured as the pixel it
  paints. A ground that is not opaque, or a `src` alpha that is `NaN` or infinite, throws a
  `RangeError`.
- `relativeLuminance(color)` and `contrastRatio(a, b)` follow WCAG 2. `contrastRatio` also takes
  CSS strings.

All nine exports are stable. Parse failures are a plain `Error`; the number checks are a
`RangeError`. The changes from the last development version are in the history below, in
CHANGELOG.md. Node.js 22 or later, ESM only, shipped as compiled JavaScript with type
declarations. Tested on Linux and macOS. Licensed `MIT OR Apache-2.0`.
