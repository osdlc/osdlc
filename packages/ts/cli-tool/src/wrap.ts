/**
 * Wrapping help text when it is rendered, not when it is written. Prose with
 * names interpolated into it cannot be wrapped by hand: the line lengths
 * change with the names.
 */

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

/** Words of `text` joined into lines no longer than `width`. A longer word gets a line of its own. */
function fill(words: readonly string[], width: number, indent = ''): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line === '') line = indent + word
    else if (line.length + 1 + word.length <= width) line += ` ${word}`
    else {
      lines.push(line)
      line = indent + word
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

/**
 * Reflow `text` to `width` columns.
 *
 * Paragraphs are separated by blank lines. A paragraph whose lines all start
 * at column 0 is prose: its lines are joined and filled again. A line that
 * starts with a space is kept as written, since it is a list, a table, a
 * usage line or code. A fenced block (```) is kept as written too. The result
 * keeps the trailing newline of the input.
 * @experimental
 */
export function wrapText(text: string, width: number = DEFAULT_WIDTH): string {
  const trailing = text.endsWith('\n')
  const out: string[] = []
  let prose: string[] = []
  let fenced = false
  const flush = (): void => {
    if (prose.length === 0) return
    out.push(...fill(prose.join(' ').split(/\s+/).filter(Boolean), width))
    prose = []
  }
  for (const line of (trailing ? text.slice(0, -1) : text).split('\n')) {
    if (line.startsWith('```')) {
      flush()
      fenced = !fenced
      out.push(line)
    } else if (fenced || line === '' || /^\s/.test(line)) {
      flush()
      out.push(line)
    } else {
      prose.push(line)
    }
  }
  flush()
  return out.join('\n') + (trailing ? '\n' : '')
}

/**
 * Two columns: each `term` padded to the widest one, then its `text` wrapped
 * in the space left. Lines after the first are indented under the text.
 * @experimental
 */
export function columns(
  rows: readonly { term: string; text: string }[],
  width: number = DEFAULT_WIDTH,
  indent = '  ',
): string {
  if (rows.length === 0) return ''
  const termWidth = Math.min(
    Math.max(...rows.map((r) => r.term.length)),
    Math.floor(width / 2) - indent.length,
  )
  const lead = indent.length + termWidth + 2
  return rows
    .map(({ term, text }) => {
      const words = text.split(/\s+/).filter(Boolean)
      const body = fill(words, Math.max(width - lead, 20))
      if (term.length > termWidth) {
        // A term too wide for the column gets its own line.
        return [indent + term, ...body.map((l) => ' '.repeat(lead) + l)].join('\n')
      }
      const [first = '', ...rest] = body
      return [
        `${indent}${term.padEnd(termWidth)}  ${first}`.trimEnd(),
        ...rest.map((l) => ' '.repeat(lead) + l),
      ].join('\n')
    })
    .join('\n')
}
