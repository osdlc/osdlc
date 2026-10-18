# Changelog

## History before the first public release

These versions were never published. The version numbers were assigned afterwards, from the git
history, and have no tags. The earliest changes predate the package's current folder: it started
inside the design tokens service and moved.

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
