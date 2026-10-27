/**
 * How the terminal UI paints text, and how it fits a line to the width.
 *
 * Colors come from `@osdlc/ux` tokens. Text attributes (bold, dim, underline,
 * inverse) are kept apart from color: `NO_COLOR` turns color off, not
 * emphasis, so the selected row and a match stay visible. A state is never
 * shown by color alone; each one also has a text mark (`>`, `[ ]`, `~`, `*`).
 */

import {
  ansiColors,
  detectColorLevel,
  displayWidth,
  fitWidth,
  type ColorLevel,
  type ColorToken,
  type Theme,
} from '@osdlc/ux'

import { terminalSafe } from '../terminal-text.ts'

/** Paints a string. Plain text in, text with escapes out. */
export type Paint = (text: string) => string

/** The paints the terminal UI uses, by meaning rather than by color. */
export interface Styles {
  /** Secondary text: chains above the leaf, counts, hints. */
  dim: Paint
  bold: Paint
  /** The prompt, the cursor and the selection mark. */
  accent: Paint
  /** The service mark. */
  success: Paint
  /** Warnings only: withheld runners, stale rows, a question waiting. */
  warning: Paint
  error: Paint
  /** The selected tab. */
  selected: Paint
  /** Matched characters: bold and underlined, so they show without color. */
  match: Paint
  /** A note that is not a warning: `copied`, `refreshing`. */
  note: Paint
}

/** What decides the styles: the color level, the terminal's theme, and whether attributes show. */
export interface StyleInput {
  level: ColorLevel
  theme: Theme
  /** Bold, dim, underline and inverse. Off when the output is not a terminal. */
  attributes: boolean
}

const sgr =
  (on: string, off: string): Paint =>
  (s) =>
    `\x1b[${on}m${s}\x1b[${off}m`
const none: Paint = (s) => s

/** The styles for `input`. */
export function makeStyles(input: StyleInput): Styles {
  const ansi = ansiColors(input.level, input.theme)
  const color =
    (token: ColorToken): Paint =>
    (s) => {
      const fg = ansi[token].fg
      return fg === '' ? s : `${fg}${s}\x1b[39m`
    }
  const attr = (on: string, off: string): Paint => (input.attributes ? sgr(on, off) : none)
  const both =
    (...paints: Paint[]): Paint =>
    (s) =>
      paints.reduceRight((text, p) => p(text), s)
  const bold = attr('1', '22')
  return {
    dim: attr('2', '22'),
    bold,
    accent: color('accent'),
    success: color('status-success'),
    warning: color('status-warning'),
    error: color('status-error'),
    selected: attr('7', '27'),
    match: both(bold, attr('4', '24'), color('accent')),
    note: color('text-secondary'),
  }
}

/**
 * The terminal's background, from `COLORFGBG` (`15;0` is light text on a
 * dark ground). Dark when it says nothing.
 */
export function terminalTheme(env: Record<string, string | undefined>): Theme {
  const bg = Number.parseInt(env['COLORFGBG']?.split(';').at(-1) ?? '', 10)
  return bg === 7 || bg === 15 ? 'light' : 'dark'
}

/** The styles for a stream with this environment and TTY state. */
export function stylesFor(env: Record<string, string | undefined>, isTTY: boolean): Styles {
  return makeStyles({
    level: detectColorLevel({ env, isTTY }),
    theme: terminalTheme(env),
    attributes: isTTY && env['TERM'] !== 'dumb',
  })
}

/** A run of text plus how to paint it. Its width is measured before painting. */
export interface Chunk {
  text: string
  paint?: Paint | undefined
}

/** Clear to the end of the line. */
export const CLEAR_EOL = '\x1b[K'

/** The columns `chunks` take, after {@link terminalSafe}. */
export function chunksWidth(chunks: readonly Chunk[]): number {
  return chunks.reduce((n, c) => n + displayWidth(terminalSafe(c.text)), 0)
}

/**
 * Compose chunks into one line of at most `width` columns. The text is cut
 * before it is painted, since an escape sequence has no width. Every chunk
 * goes through {@link terminalSafe} first, so repository text never writes a
 * control sequence; only `paint` adds escapes.
 */
export function line(chunks: readonly Chunk[], width: number): string {
  let used = 0
  let out = ''
  for (const chunk of chunks) {
    if (used >= width) break
    let text = terminalSafe(chunk.text)
    const w = displayWidth(text)
    if (used + w > width) text = fitWidth(text, width - used)
    used += displayWidth(text)
    out += chunk.paint && text !== '' ? chunk.paint(text) : text
  }
  return out + CLEAR_EOL
}
