/** Whether a terminal stream gets color, and how many colors. */

/**
 * How many colors a stream gets: none, the 16 basic colors, the 256-color
 * palette, or 24-bit truecolor.
 */
export type ColorLevel = 'none' | 'ansi16' | 'ansi256' | 'truecolor'

/** The levels, fewest colors first. */
export const COLOR_LEVELS: readonly ColorLevel[] = Object.freeze([
  'none',
  'ansi16',
  'ansi256',
  'truecolor',
] as const)

/** The input to {@link detectColorLevel}. */
export interface ColorDetectInput {
  /** The environment, such as `process.env`. Only read. */
  readonly env: Readonly<Record<string, string | undefined>>
  /** Whether the stream is a terminal, such as `process.stdout.isTTY`. */
  readonly isTTY: boolean | undefined
  /**
   * An explicit choice, such as from `--color` or `--no-color`: `true` turns
   * color on, `false` turns it off, and a level sets the level. It wins over
   * the environment. Leave it out to decide from the environment.
   */
  readonly override?: boolean | ColorLevel | undefined
}

/** `FORCE_COLOR`'s numeric levels, as Node.js reads them. */
const FORCED: Readonly<Record<string, ColorLevel>> = {
  '0': 'none',
  false: 'none',
  '': 'ansi16',
  '1': 'ansi16',
  true: 'ansi16',
  '2': 'ansi256',
  '3': 'truecolor',
}

/** Terminals that report truecolor through `TERM_PROGRAM` without `COLORTERM`. */
const TRUECOLOR_PROGRAMS = new Set(['iTerm.app', 'WezTerm', 'ghostty'])

/**
 * The most colors the terminal described by `env` supports, assuming it is a
 * terminal: truecolor from `COLORTERM`, a `-direct` `TERM`, Windows Terminal
 * or a known `TERM_PROGRAM`; 256 from a `TERM` that names `256color`; 16
 * otherwise.
 */
function terminalLevel(env: ColorDetectInput['env']): ColorLevel {
  const colorterm = (env['COLORTERM'] ?? '').toLowerCase()
  const term = (env['TERM'] ?? '').toLowerCase()
  if (colorterm === 'truecolor' || colorterm === '24bit') return 'truecolor'
  if (term.endsWith('-direct') || term.includes('truecolor')) return 'truecolor'
  if (env['WT_SESSION'] !== undefined) return 'truecolor'
  if (TRUECOLOR_PROGRAMS.has(env['TERM_PROGRAM'] ?? '')) return 'truecolor'
  if (term.includes('256color')) return 'ansi256'
  return 'ansi16'
}

/**
 * The color level for one output stream. It reads only its argument, so it
 * is the same function in a test and in a program.
 *
 * In order, the first rule that applies decides:
 *
 * 1. `override`: `false` gives `none`, a level gives that level, and `true`
 *    turns color on at the `FORCE_COLOR` level when it names one, or else
 *    the terminal's level.
 * 2. `FORCE_COLOR`, as Node.js reads it: `0` or `false` gives `none`; `1`,
 *    `true` or empty gives `ansi16`; `2` gives `ansi256`; `3` gives
 *    `truecolor`. Any other value turns color on at the terminal's level.
 *    It wins over `NO_COLOR`, as in Node.js.
 * 3. `NO_COLOR` set to anything but the empty string gives `none`.
 * 4. `TERM=dumb` gives `none`.
 * 5. A stream that is not a terminal gives `none`.
 * 6. Otherwise the terminal's level: `truecolor` when `COLORTERM` is
 *    `truecolor` or `24bit`, `TERM` ends in `-direct`, `WT_SESSION` is set
 *    or `TERM_PROGRAM` is iTerm.app, WezTerm or ghostty; `ansi256` when
 *    `TERM` contains `256color`; `ansi16` otherwise.
 *
 * @throws RangeError when `override` is a string that is not a
 * {@link ColorLevel}.
 */
export function detectColorLevel(input: ColorDetectInput): ColorLevel {
  const { env, isTTY, override } = input
  const force = env['FORCE_COLOR']
  const forced = force === undefined ? undefined : FORCED[force.toLowerCase()]
  if (override !== undefined) {
    if (override === false) return 'none'
    if (override === true) {
      return forced !== undefined && forced !== 'none' ? forced : terminalLevel(env)
    }
    if (!COLOR_LEVELS.includes(override)) {
      throw new RangeError(`ux: override ${JSON.stringify(override)} is not a color level`)
    }
    return override
  }
  if (force !== undefined) return forced ?? terminalLevel(env)
  if ((env['NO_COLOR'] ?? '') !== '') return 'none'
  if (env['TERM'] === 'dumb') return 'none'
  if (isTTY !== true) return 'none'
  return terminalLevel(env)
}
