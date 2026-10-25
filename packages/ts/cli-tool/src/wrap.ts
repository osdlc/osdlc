/**
 * Wrapping help text when it is rendered, not when it is written. Prose with
 * names interpolated into it cannot be wrapped by hand: the line lengths
 * change with the names.
 */

import { displayWidth, stripControls } from '@osdlc/ux'

/**
 * The width help is wrapped to when the terminal width is unknown.
 * @experimental
 */
export const DEFAULT_WIDTH = 80

/**
 * Help is never wrapped wider than this, however wide the terminal is.
 * @experimental
 */
export const MAX_WIDTH = 100

/** Help is never wrapped narrower than this. */
const MIN_WIDTH = 40

/**
 * The width to wrap help to for a terminal `columns` wide: the terminal width
 * kept between 40 and {@link MAX_WIDTH}, or {@link DEFAULT_WIDTH} when the
 * width is unknown (output is not a terminal).
 * @experimental
 */
export function helpWidth(columns?: number): number {
  if (columns === undefined || !Number.isFinite(columns) || columns <= 0) return DEFAULT_WIDTH
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(columns)))
}

/**
 * The columns `text` takes on a terminal: wide characters count 2, combining
 * marks 0, and escape sequences nothing.
 */
export function textWidth(text: string): number {
  return displayWidth(stripControls(text))
}

/** `text` padded with spaces to `width` columns, as {@link textWidth} counts them. */
function padTo(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - textWidth(text)))
}

/** Words joined into lines no wider than `width`. A wider word gets a line of its own. */
function fill(words: readonly string[], width: number): string[] {
  const lines: string[] = []
  let line = ''
  let used = 0
  for (const word of words) {
    const w = textWidth(word)
    if (line === '') {
      line = word
      used = w
    } else if (used + 1 + w <= width) {
      line += ` ${word}`
      used += 1 + w
    } else {
      lines.push(line)
      line = word
      used = w
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

/** A fence line: ``` or ~~~, indented or not. */
const FENCE = /^\s*(```|~~~)/
/**
 * A line kept as written: indented, a list item (`- a`, `* a`, `1. a`), a
 * shell example (`$ cmd`) or a table row (`| a |`).
 */
const KEPT = /^(\s|[-*+]\s|\d+[.)]\s|\$\s|\|)/

/**
 * Reflow `text` to `width` columns.
 *
 * Paragraphs are separated by blank lines. Lines of prose are joined and
 * filled again. A line that ends in `:` ends its paragraph, so what follows
 * it starts a new line. These lines are kept as written: an indented line, a
 * list item (`- a`, `1. a`), a shell example (`$ cmd`), a table row (`| a |`)
 * and every line of a fenced block (``` or ~~~, indented or not). Widths count
 * terminal columns, so wide characters count 2. The result keeps the trailing
 * newline of the input.
 * @experimental
 */
export function wrapText(text: string, width: number = DEFAULT_WIDTH): string {
  const trailing = text.endsWith('\n')
  const out: string[] = []
  let prose: string[] = []
  let fence: string | undefined
  const flush = (): void => {
    if (prose.length === 0) return
    out.push(...fill(prose.join(' ').split(/\s+/).filter(Boolean), width))
    prose = []
  }
  for (const line of (trailing ? text.slice(0, -1) : text).split('\n')) {
    const opens = FENCE.exec(line)?.[1]
    if (fence !== undefined) {
      out.push(line)
      if (opens === fence) fence = undefined
    } else if (opens !== undefined) {
      flush()
      fence = opens
      out.push(line)
    } else if (line === '' || KEPT.test(line)) {
      flush()
      out.push(line)
    } else {
      prose.push(line)
      if (line.trimEnd().endsWith(':')) flush()
    }
  }
  flush()
  return out.join('\n') + (trailing ? '\n' : '')
}

/**
 * Two columns: each `term` padded to the widest one, then its `text` wrapped
 * in the space left. Lines after the first are indented under the text. No
 * line is wider than `width`, except a single word that is.
 * @experimental
 */
export function columns(
  rows: readonly { term: string; text: string }[],
  width: number = DEFAULT_WIDTH,
  indent = '  ',
): string {
  if (rows.length === 0) return ''
  const termWidth = Math.max(
    0,
    Math.min(
      Math.max(...rows.map((r) => textWidth(r.term))),
      Math.floor(width / 2) - indent.length,
    ),
  )
  const lead = indent.length + termWidth + 2
  return rows
    .map(({ term, text }) => {
      const words = text.split(/\s+/).filter(Boolean)
      const body = fill(words, Math.max(width - lead, 1))
      if (textWidth(term) > termWidth) {
        // A term too wide for the column gets its own line.
        return [indent + term, ...body.map((l) => ' '.repeat(lead) + l)].join('\n')
      }
      const [first = '', ...rest] = body
      return [
        `${indent}${padTo(term, termWidth)}  ${first}`.trimEnd(),
        ...rest.map((l) => ' '.repeat(lead) + l),
      ].join('\n')
    })
    .join('\n')
}

/**
 * Rows of cells as aligned columns: each cell but the last padded to its
 * column's widest cell, `gap` between, one row per line.
 * @internal
 */
export function table(rows: readonly (readonly string[])[], indent = '', gap = '  '): string {
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, textWidth(cell))
    })
  }
  return rows
    .map((row) =>
      `${indent}${row.map((cell, i) => (i < row.length - 1 ? padTo(cell, widths[i]!) : cell)).join(gap)}`.trimEnd(),
    )
    .map((line) => `${line}\n`)
    .join('')
}
