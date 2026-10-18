# Changelog

## History before the first public release

These versions were never published. The version numbers were assigned afterwards, from the git
history, and have no tags. The earliest changes predate the package's current folder: it started
inside another package and moved.

### [0.1.3] - 2026-10-17 (unpublished)

#### Added

- `fromPixel(px)` converts an `[r, g, b, a]` pixel with alpha 0-255, the layout of
  `ImageData.data`, into an `Rgba` with alpha 0-1.
- `compositeOver(src, ground)` paints a colour over an opaque ground (source-over, straight
  alpha) and rounds each channel to 8 bits. A ground that is not opaque throws a `RangeError`.

#### Changed

- **Breaking:** the `Rgba` fields `r`, `g`, `b` and `a` are `readonly`. Every function accepts a
  frozen or `as const` colour. Each returns a new plain object, except that `compositeOver`
  returns an opaque `src` as is.
- **Breaking:** `parseColor` is strict. It throws on extra arguments (`rgb(1 2 3 4 5)`), on
  non-numeric text (`rgb(12abc 0 0)`), on commas mixed with spaces or a slash, and on the comma
  form with numbers and percentages mixed, as a browser rejects them. Before, it dropped the
  extra parts or read the leading number.
- **Breaking:** `parseColor` clamps channels to 0-255 and alpha to 0-1, for `rgb()`, `rgba()` and
  `color(srgb …)`. `rgb(300 0 0)` and `color(srgb 2 0 0)` both give `r` 255. Before, the values
  were kept as written.
- **Breaking:** `mixColors` throws a `RangeError` when `amount` is `NaN` or infinite, and
  `withAlpha` does the same for `alpha`. Before, `NaN` passed through to the result. A finite
  value outside 0-1 is still clamped.
- Each function's documentation says when it throws.

#### Fixed

- `relativeLuminance` uses the corrected WCAG 2 linearisation threshold, 0.04045, instead of
  0.03928. Integer channels give the same result as before; fractional channels, such as those
  parsed from `color(srgb …)`, now follow the specification.

### [0.1.2] - 2026-09-05 (unpublished)

#### Added

- `parseColor` accepts `color(srgb r g b [/ a])`, the form a browser's `getComputedStyle`
  reports for a colour resolved through `color-mix(in srgb, …)`. Its channels are 0-1 numbers
  or percentages, scaled to the same 0-255 range as the other syntaxes.

### [0.1.1] - 2026-08-30 (unpublished)

#### Fixed

- `parseColor` scales percentages in `rgb()` and `rgba()`: a channel's 100% is 255 and an
  alpha's 100% is 1. Before, `50%` was read as the number 50.

### [0.1.0] - 2026-08-30 (unpublished)

#### Added

- `Rgba`, a colour with channels 0-255 and alpha 0-1.
- `parseColor(css)` reads hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()` and `rgba()`,
  and throws on any other syntax.
- `formatHex(color)` writes `#rrggbb`, or `#rrggbbaa` when the colour is not fully opaque.
- `mixColors(base, overlay, amount)` interpolates each channel in sRGB, as
  `color-mix(in srgb, …)` does for opaque colours.
- `withAlpha(color, alpha)` replaces the alpha and keeps the channels.
- `relativeLuminance(color)` and `contrastRatio(a, b)` give the WCAG 2 relative luminance and
  contrast ratio; `contrastRatio` also takes CSS colour strings.
