---
'@osdlc/color': major
---

First public release. sRGB colour arithmetic for measuring what a browser paints: parse the CSS
colour syntaxes a browser reports into one `Rgba` value, mix and composite in gamma-encoded sRGB,
and measure WCAG 2 relative luminance and contrast. No dependencies. Earlier versions were used only during development and were never published; see the history below.

**Added**

- `fromPixel(px)` converts an `[r, g, b, a]` pixel with alpha 0-255, the layout of
  `ImageData.data`, into an `Rgba` with alpha 0-1.
- `compositeOver(src, ground)` paints a colour over an opaque ground (source-over, straight
  alpha) and rounds each channel to 8 bits, so a translucent colour is measured as the pixel it
  paints. A translucent ground throws a `RangeError`.

**Changed**

- **Breaking:** the `Rgba` fields `r`, `g`, `b` and `a` are `readonly`. Every function accepts a
  frozen or `as const` colour. Each returns a new plain object, except that `compositeOver`
  returns an opaque `src` as is.
- **Breaking:** `parseColor` is strict. It throws on extra arguments (`rgb(1 2 3 4 5)`), on
  non-numeric text (`rgb(12abc 0 0)`), on commas mixed with spaces or a slash, and on the comma
  form with numbers and percentages mixed, as a browser rejects them. Before, it dropped the extra
  parts or read the leading number.
- **Breaking:** `parseColor` clamps channels to 0-255 and alpha to 0-1, for `rgb()`, `rgba()` and
  `color(srgb …)`. `rgb(300 0 0)` and `color(srgb 2 0 0)` both give `r` 255. Before, the values
  were kept as written.
- **Breaking:** `mixColors` throws a `RangeError` when `amount` is `NaN` or infinite, and
  `withAlpha` does the same for `alpha`. Before, `NaN` passed through to the result. A finite value
  outside 0-1 is still clamped.
- Each function's documentation says when it throws. Parse failures are a plain `Error`; the
  number checks are a `RangeError`.

**Fixed**

- `relativeLuminance` uses the corrected WCAG 2 linearisation threshold, 0.04045, instead of
  0.03928. Integer channels give the same result as before; fractional channels, such as those
  parsed from `color(srgb …)`, now follow the specification.
