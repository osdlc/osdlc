/**
 * Design tokens for web and terminal tools, and the helpers that apply them.
 *
 * - Tokens as data: {@link colors} for each theme, {@link radii} and
 *   {@link fonts}.
 * - Web: {@link cssSheet} and {@link tokensCss}, a sheet of CSS custom
 *   properties for light and dark.
 * - Terminal: {@link detectColorLevel} decides whether a stream gets color,
 *   and {@link ansiColors} gives each token's escape sequences at that level.
 * - Untrusted text: {@link stripControls} removes terminal controls and
 *   {@link fitWidth} cuts a line to a number of columns.
 *
 * Errors are `RangeError`s for an argument out of range, with messages that
 * start with `ux:`. A color string that `@osdlc/color` cannot parse throws
 * its `Error`.
 */

export {
  COLOR_TOKENS,
  CONTRAST_PAIRS,
  THEMES,
  ansi16,
  colors,
  fonts,
  radii,
  type ColorToken,
  type Palette,
  type Theme,
} from './tokens.ts'
export { cssSheet, tokensCss, type CssSheetOptions } from './css.ts'
export { COLOR_LEVELS, detectColorLevel, type ColorDetectInput, type ColorLevel } from './detect.ts'
export {
  ANSI16_PALETTE,
  ANSI256_PALETTE,
  ANSI_BG_RESET,
  ANSI_FG_RESET,
  ansiCodes,
  ansiColors,
  nearestAnsi16,
  nearestAnsi256,
  paint,
  type AnsiCodes,
} from './ansi.ts'
export {
  displayWidth,
  fitWidth,
  stripControls,
  type FitWidthOptions,
  type StripControlsOptions,
} from './text.ts'
