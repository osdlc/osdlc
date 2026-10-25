/** The color tokens as ANSI SGR escape sequences for a terminal. */

import { colorDistance, parseColor, type Rgba } from '@osdlc/color'

import type { ColorLevel } from './detect.ts'
import { COLOR_TOKENS, ansi16, colors, type ColorToken, type Theme } from './tokens.ts'

const ESC = '\x1b['

/**
 * The 16 basic colors as xterm draws them by default, by index: 0-7 normal,
 * 8-15 bright. Terminals let the user change these, so they are a guess at
 * what the user sees.
 */
export const ANSI16_PALETTE: readonly string[] = Object.freeze([
  '#000000',
  '#cd0000',
  '#00cd00',
  '#cdcd00',
  '#0000ee',
  '#cd00cd',
  '#00cdcd',
  '#e5e5e5',
  '#7f7f7f',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#5c5cff',
  '#ff00ff',
  '#00ffff',
  '#ffffff',
])

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

/**
 * The 256-color palette as xterm defines it, by index: 0-15 are
 * {@link ANSI16_PALETTE}, 16-231 the 6x6x6 color cube, 232-255 the gray ramp.
 */
export const ANSI256_PALETTE: readonly string[] = Object.freeze([
  ...ANSI16_PALETTE,
  ...Array.from({ length: 216 }, (_, i) => {
    const level = [0, 95, 135, 175, 215, 255]
    const at = (d: number) => hex2(level[Math.floor(i / d) % 6]!)
    return `#${at(36)}${at(6)}${at(1)}`
  }),
  ...Array.from({ length: 24 }, (_, i) => `#${hex2(8 + 10 * i).repeat(3)}`),
])

const PARSED16 = ANSI16_PALETTE.map((c) => parseColor(c))
const PARSED256 = ANSI256_PALETTE.map((c) => parseColor(c))

/** The index of the entry nearest `color` by sRGB distance; the lowest index on a tie. */
function nearest(color: Rgba, palette: readonly Rgba[], from: number): number {
  let best = from
  let bestDistance = Infinity
  for (let i = from; i < palette.length; i++) {
    const d = colorDistance(color, palette[i]!)
    if (d < bestDistance) {
      best = i
      bestDistance = d
    }
  }
  return best
}

/**
 * The index, 0-15, of the basic color nearest `color` by sRGB distance in
 * {@link ANSI16_PALETTE}.
 *
 * @throws Error when `color` is a string that `parseColor` from
 * `@osdlc/color` cannot read.
 */
export function nearestAnsi16(color: Rgba | string): number {
  return nearest(typeof color === 'string' ? parseColor(color) : color, PARSED16, 0)
}

/**
 * The index, 16-255, of the palette color nearest `color` by sRGB distance
 * in {@link ANSI256_PALETTE}. Indexes 0-15 are skipped: they are the basic
 * colors, which the user may have changed.
 *
 * @throws Error when `color` is a string that `parseColor` from
 * `@osdlc/color` cannot read.
 */
export function nearestAnsi256(color: Rgba | string): number {
  return nearest(typeof color === 'string' ? parseColor(color) : color, PARSED256, 16)
}

/**
 * The escape sequences that set one color. Both are empty at level `none`.
 */
export interface AnsiCodes {
  /** Sets the text color. Reset with {@link ANSI_FG_RESET}. */
  readonly fg: string
  /** Sets the background color. Reset with {@link ANSI_BG_RESET}. */
  readonly bg: string
}

/** Resets the text color to the terminal default. */
export const ANSI_FG_RESET = `${ESC}39m`

/** Resets the background color to the terminal default. */
export const ANSI_BG_RESET = `${ESC}49m`

/** The codes for basic color `n`, 0-15. */
function basic(n: number): AnsiCodes {
  const fg = n < 8 ? 30 + n : 90 + n - 8
  return { fg: `${ESC}${fg}m`, bg: `${ESC}${fg + 10}m` }
}

/**
 * The escape sequences for one color at `level`: `38;2;r;g;b` at
 * truecolor, `38;5;n` at 256, `30`-`37` or `90`-`97` at 16 (the nearest
 * entry of {@link ANSI16_PALETTE}), and empty strings at `none`. The
 * background uses `48` and `40`-`47` or `100`-`107`.
 *
 * @throws RangeError when `level` is not a {@link ColorLevel}.
 * @throws Error when `color` is a string that `parseColor` from
 * `@osdlc/color` cannot read.
 */
export function ansiCodes(color: Rgba | string, level: ColorLevel): AnsiCodes {
  const c = typeof color === 'string' ? parseColor(color) : color
  switch (level) {
    case 'none':
      return { fg: '', bg: '' }
    case 'truecolor': {
      const rgb = [c.r, c.g, c.b].map((v) => Math.round(v)).join(';')
      return { fg: `${ESC}38;2;${rgb}m`, bg: `${ESC}48;2;${rgb}m` }
    }
    case 'ansi256': {
      const n = nearestAnsi256(c)
      return { fg: `${ESC}38;5;${n}m`, bg: `${ESC}48;5;${n}m` }
    }
    case 'ansi16':
      return basic(nearestAnsi16(c))
    default:
      throw new RangeError(`ux: level ${JSON.stringify(level)} is not a color level`)
  }
}

/**
 * Every color token of `theme` as escape sequences at `level`. At
 * `ansi16` each token takes its chosen color from {@link ansi16}; at the
 * other levels it is {@link ansiCodes} of the token's color. Pick the theme
 * that matches the terminal's background; most terminals are dark.
 *
 * @throws RangeError when `level` is not a {@link ColorLevel}.
 */
export function ansiColors(
  level: ColorLevel,
  theme: Theme,
): Readonly<Record<ColorToken, AnsiCodes>> {
  const out = {} as Record<ColorToken, AnsiCodes>
  for (const token of COLOR_TOKENS) {
    const codes =
      level === 'ansi16' ? basic(ansi16[theme][token]) : ansiCodes(colors[theme][token], level)
    out[token] = Object.freeze(codes)
  }
  return Object.freeze(out)
}

/**
 * `text` wrapped in `codes`: the text color, or the background with
 * `layer: 'bg'`, then the matching reset. Returns `text` unchanged when the
 * code is empty, as at level `none`.
 */
export function paint(text: string, codes: AnsiCodes, layer: 'fg' | 'bg' = 'fg'): string {
  const open = codes[layer]
  if (open === '') return text
  return `${open}${text}${layer === 'fg' ? ANSI_FG_RESET : ANSI_BG_RESET}`
}
