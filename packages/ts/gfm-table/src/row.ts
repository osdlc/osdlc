/**
 * One table line read into pipes and cells. Positions are absolute: a line
 * read at `base` reports offsets from `base`, so a caller can pass a slice of
 * a larger document and use the result against the document.
 */

/** A column's alignment, from its delimiter-row cell. */
export type ColumnAlign = 'none' | 'left' | 'center' | 'right'

/** One cell: the region between pipes, and its trimmed content span. */
export interface TableCellSpan {
  /** Offset of the cell's first character, just after its opening pipe. */
  from: number
  /** Offset just past the cell, at its closing pipe or the line end. */
  to: number
  /** Content without its space padding. An empty cell's content is a point. */
  content: { from: number; to: number }
}

/** One table line (header, body row, or the delimiter row) and its cells. */
export interface TableRowSpan {
  /** Offset of the line start (`base`). */
  from: number
  /** Offset of the line end. */
  to: number
  /** Positions of the row's pipes, each one char wide. */
  pipes: readonly number[]
  cells: TableCellSpan[]
}

/**
 * A row with no pipes and no cells, for a caller that needs a placeholder.
 *
 * @experimental
 */
export const EMPTY_ROW: TableRowSpan = { from: 0, to: 0, pipes: [], cells: [] }

function cellFromRegion(text: string, from: number, to: number): TableCellSpan {
  let s = 0
  while (s < text.length && text[s] === ' ') s++
  let e = text.length
  while (e > s && text[e - 1] === ' ') e--
  if (s === e) {
    // Empty cell: the content point sits just past the first pad space, if any.
    const at = from + Math.min(1, text.length)
    return { from, to, content: { from: at, to: at } }
  }
  return { from, to, content: { from: from + s, to: from + e } }
}

/**
 * Cell regions of a row line given its pipe positions (each one char wide,
 * absolute, so `pipes[i] - base` indexes `line`). Use it when the pipes come
 * from elsewhere, such as a parser's syntax tree. {@link splitRow} finds them
 * itself.
 */
export function rowFromPipes(line: string, base: number, pipes: readonly number[]): TableRowSpan {
  const from = base
  const to = base + line.length
  const region = (start: number, end: number) =>
    cellFromRegion(line.slice(start - base, end - base), start, end)
  const cells: TableCellSpan[] = []
  let cursor = from
  let sawPipe = false
  for (const pipe of pipes) {
    // A first pipe at the row start, or after 0-3 spaces, opens the row
    // rather than closing a cell.
    const opens = !sawPipe && /^ {0,3}$/.test(line.slice(0, pipe - base))
    if (!opens && (pipe > cursor || (sawPipe && pipe === cursor))) {
      cells.push(region(cursor, pipe))
    }
    cursor = pipe + 1
    sawPipe = true
  }
  // Whitespace after the closing pipe is no cell.
  if (cursor < to && line.slice(cursor - base).trim() !== '') {
    cells.push(region(cursor, to))
  }
  return { from, to, pipes, cells }
}

/** Pipe positions in `line`, offset by `base`. A backslash escapes the next character. */
export function rowPipes(line: string, base = 0): number[] {
  const pipes: number[] = []
  let escaped = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '|' && !escaped) pipes.push(base + i)
    escaped = !escaped && ch === '\\'
  }
  return pipes
}

/** Read one table line into pipes and cells, by the GFM splitting rule. */
export function splitRow(line: string, base = 0): TableRowSpan {
  return rowFromPipes(line, base, rowPipes(line, base))
}

/** A delimiter-row cell's alignment: `:--` left, `--:` right, `:-:` center. */
export function parseAlign(spec: string): ColumnAlign {
  const colonLeft = spec.startsWith(':')
  const colonRight = spec.endsWith(':') && spec.length > 1
  if (colonLeft && colonRight) return 'center'
  if (colonRight) return 'right'
  if (colonLeft) return 'left'
  return 'none'
}

const DELIMITER_CELL = /^:?-+:?$/

/** Whether `line` is a delimiter row: a pipe, and cells that are each `:?-+:?`. */
export function isDelimiterRow(line: string): boolean {
  const row = splitRow(line)
  if (row.pipes.length === 0 || row.cells.length === 0) return false
  return row.cells.every((cell) =>
    DELIMITER_CELL.test(line.slice(cell.content.from, cell.content.to).trim()),
  )
}
