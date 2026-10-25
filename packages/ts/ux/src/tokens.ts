/**
 * The design tokens as data: colors for each theme, radii and fonts. Every
 * other export is built from these values.
 */

/** A color theme. */
export type Theme = 'light' | 'dark'

/** The two themes, light first. */
export const THEMES: readonly Theme[] = Object.freeze(['light', 'dark'] as const)

/**
 * The color token names. Grounds (`bg-*`), text (`text-*`), lines
 * (`border*`), the accent and its label (`accent*`), and status colors
 * (`status-*`).
 */
export const COLOR_TOKENS = Object.freeze([
  'bg-base',
  'bg-surface',
  'bg-hover',
  'text-primary',
  'text-secondary',
  'text-muted',
  'border',
  'border-subtle',
  'accent',
  'accent-hover',
  'accent-fg',
  'status-success',
  'status-warning',
  'status-error',
] as const)

/** One color token name. */
export type ColorToken = (typeof COLOR_TOKENS)[number]

/** A theme's colors: one hex value per token. */
export type Palette = Readonly<Record<ColorToken, string>>

/**
 * The colors of each theme, as `#rrggbb`. Every pair in
 * {@link CONTRAST_PAIRS} meets WCAG AA (4.5:1) in both themes.
 */
export const colors: Readonly<Record<Theme, Palette>> = Object.freeze({
  light: Object.freeze({
    'bg-base': '#f8f8fa',
    'bg-surface': '#ffffff',
    'bg-hover': '#ededf1',
    'text-primary': '#1a1a1c',
    'text-secondary': '#45454b',
    'text-muted': '#585860',
    border: '#e0e0e6',
    'border-subtle': '#ebebf0',
    accent: '#1d59d8',
    'accent-hover': '#1a4fbe',
    'accent-fg': '#ffffff',
    'status-success': '#15793e',
    'status-warning': '#995c00',
    'status-error': '#d70015',
  }),
  dark: Object.freeze({
    'bg-base': '#1a1b20',
    'bg-surface': '#1d1e25',
    'bg-hover': '#31323c',
    'text-primary': '#eaeaee',
    'text-secondary': '#bcbcc4',
    'text-muted': '#a4a5ae',
    border: '#31323c',
    'border-subtle': '#272831',
    accent: '#6a9bff',
    'accent-hover': '#85adff',
    // Dark on the accent: white on #6a9bff is 2.56:1 and fails AA.
    'accent-fg': '#24252d',
    'status-success': '#3fb27f',
    'status-warning': '#e0af68',
    'status-error': '#f7768e',
  }),
})

/**
 * The basic terminal color, 0-15, for each token of each theme: 0-7 normal,
 * 8-15 bright. These are chosen, not computed. A terminal's 16 colors are set
 * by the user, so their values are unknown, and the nearest of xterm's
 * defaults by sRGB distance picks the wrong hue for some tokens: the light
 * warning comes out red, and the dark success and error come out gray.
 */
export const ansi16: Readonly<Record<Theme, Readonly<Record<ColorToken, number>>>> = Object.freeze({
  light: Object.freeze({
    'bg-base': 15,
    'bg-surface': 15,
    'bg-hover': 7,
    'text-primary': 0,
    'text-secondary': 8,
    'text-muted': 8,
    border: 7,
    'border-subtle': 7,
    accent: 4,
    'accent-hover': 4,
    'accent-fg': 15,
    'status-success': 2,
    'status-warning': 3,
    'status-error': 1,
  }),
  dark: Object.freeze({
    'bg-base': 0,
    'bg-surface': 0,
    'bg-hover': 8,
    'text-primary': 15,
    'text-secondary': 7,
    'text-muted': 8,
    border: 8,
    'border-subtle': 8,
    accent: 12,
    'accent-hover': 12,
    'accent-fg': 0,
    'status-success': 2,
    'status-warning': 3,
    'status-error': 1,
  }),
})

/** The foreground tokens drawn as text on a ground. */
const TEXT: readonly ColorToken[] = [
  'text-primary',
  'text-secondary',
  'text-muted',
  'accent',
  'accent-hover',
  'status-success',
  'status-warning',
  'status-error',
]

/** The grounds text is drawn on. */
const GROUNDS: readonly ColorToken[] = ['bg-base', 'bg-surface', 'bg-hover']

/**
 * Each `[text, ground]` pair the tokens promise to be readable: every text
 * token on every ground, and the accent label on the accent fills. Each pair
 * meets WCAG AA, 4.5:1, in both themes. Borders are not text and are not
 * listed.
 */
export const CONTRAST_PAIRS: readonly (readonly [ColorToken, ColorToken])[] = Object.freeze([
  ...TEXT.flatMap((text) => GROUNDS.map((ground) => Object.freeze([text, ground] as const))),
  Object.freeze(['accent-fg', 'accent'] as const),
  Object.freeze(['accent-fg', 'accent-hover'] as const),
])

/** Corner radii, as CSS lengths. `pill` rounds a box fully. */
export const radii = Object.freeze({
  xs: '4px',
  sm: '6px',
  md: '10px',
  lg: '14px',
  pill: '999px',
})

/** Font stacks, as CSS `font-family` values. */
export const fonts = Object.freeze({
  sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
})
