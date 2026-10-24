/**
 * Grids of cell texts and their clipboard formats: TSV and CSV text, and an
 * HTML table. Strings only. Reading HTML back needs a DOM and is left to the
 * caller.
 */

/** Cell texts by row, every row the same length. */
export type CellGrid = string[][]

/** Inclusive cell bounds of a range. */
export interface CellRect {
  /** First row. */
  top: number
  /** First column. */
  left: number
  /** Last row. */
  bottom: number
  /** Last column. */
  right: number
}

/** Pad ragged rows to the widest; null for an empty grid. */
export function rectangular(rows: string[][]): CellGrid | null {
  const width = Math.max(0, ...rows.map((row) => row.length))
  if (rows.length === 0 || width === 0) return null
  return rows.map((row) => padRow(row, width))
}

/** A copy of `cells` padded with empty cells to `width`; a longer row keeps its cells. */
export function padRow(cells: readonly string[], width: number): string[] {
  return [...cells, ...Array.from({ length: Math.max(0, width - cells.length) }, () => '')]
}

/** Clipboard text split on any line break. One trailing break adds no line. */
export function clipboardLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/)
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * Tab-separated text: the same tab count on every line, and some line with
 * two non-empty cells. Tab-indented code (`\tfoo()`) has one non-empty cell
 * per line, so it stays text.
 */
export function gridFromTsv(text: string): CellGrid | null {
  const lines = clipboardLines(text)
  if (!lines.some((line) => line.includes('\t'))) return null
  const width = lines[0]!.split('\t').length
  const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()))
  if (!rows.every((row) => row.length === width)) return null
  return rows.some((row) => row.filter((cell) => cell !== '').length >= 2) ? rows : null
}

/** TSV of cell texts. Tabs and line breaks inside a cell become spaces. */
export function tsvFromGrid(grid: CellGrid): string {
  return grid.map((row) => row.map((cell) => cell.replace(/[\t\r\n]/g, ' ')).join('\t')).join('\n')
}

/** A field needs quoting when it carries a delimiter, a quote or a line break. */
const NEEDS_QUOTES = /[",\r\n]/

/**
 * RFC 4180 CSV: `"` doubled inside a quoted field, CRLF between records.
 * CRLF because that is what the RFC says and what a spreadsheet expects on
 * paste.
 */
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((field) => (NEEDS_QUOTES.test(field) ? `"${field.replace(/"/g, '""')}"` : field))
        .join(','),
    )
    .join('\r\n')
}

/**
 * Parse RFC 4180 CSV into records, as written: rows keep their own field
 * count and fields are not trimmed. A quoted field may hold commas, `""`
 * quotes and line breaks. Records end at CRLF, LF or CR. One trailing break
 * adds no record. A quote inside an unquoted field is literal. Null for
 * empty text, or when a quoted field is unterminated or followed by
 * anything other than a comma or a line break.
 */
export function gridFromCsv(text: string): string[][] | null {
  if (text === '') return null
  const rows: string[][] = []
  let row: string[] = []
  let i = 0
  for (;;) {
    let field = ''
    if (text[i] === '"') {
      i++
      for (;;) {
        if (i >= text.length) return null
        const quote = text.indexOf('"', i)
        if (quote < 0) return null
        field += text.slice(i, quote)
        i = quote + 1
        if (text[i] !== '"') break
        field += '"'
        i++
      }
      if (i < text.length && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') return null
    } else {
      const start = i
      while (i < text.length && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') i++
      field = text.slice(start, i)
    }
    row.push(field)
    if (text[i] === ',') {
      i++
      continue
    }
    rows.push(row)
    row = []
    if (i >= text.length) break
    i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1
    if (i >= text.length) break
  }
  return rows
}

/**
 * CSV text that reads as a table when pasted: CRLF between every record (as
 * {@link toCsv} writes). Any bare LF or CR anywhere, quoted fields included,
 * rejects the text as code or prose. It also needs two or more records of one
 * width, at least two fields wide, and no field with outer whitespace.
 * Prose writes `a, b`, so it stays text.
 */
export function gridFromCsvPaste(text: string): CellGrid | null {
  if (!text.includes('\r\n') || /(^|[^\r])\n|\r(?!\n)/.test(text)) return null
  const rows = gridFromCsv(text)
  if (!rows || rows.length < 2) return null
  const width = rows[0]!.length
  if (width < 2 || !rows.every((row) => row.length === width)) return null
  return rows.every((row) => row.every((cell) => cell === cell.trim())) ? rows : null
}

/** Attribute on copied HTML cells: the cell's markdown text. */
export const CELL_SOURCE_ATTR = 'data-markdown-cell'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * An HTML table of the shown cell texts, each cell also carrying its
 * markdown in {@link CELL_SOURCE_ATTR} so a paste back keeps it. `header`
 * makes the first row `th`.
 */
export function htmlFromGrid(shown: CellGrid, source: CellGrid, header: boolean): string {
  const rows = shown.map((row, r) => {
    const tag = header && r === 0 ? 'th' : 'td'
    const cells = row.map(
      (text, c) =>
        `<${tag} ${CELL_SOURCE_ATTR}="${escapeHtml(source[r]?.[c] ?? text)}">${escapeHtml(text)}</${tag}>`,
    )
    return `<tr>${cells.join('')}</tr>`
  })
  return `<table>${rows.join('')}</table>`
}

/**
 * The cells a pasted grid covers: the grid's size, starting at `start`. A
 * one-cell grid pasted with a `range` fills the whole range. Otherwise
 * `range` is ignored.
 */
export function pasteRect(
  grid: CellGrid,
  start: { row: number; col: number },
  range?: CellRect,
): { rect: CellRect; value: (row: number, col: number) => string } {
  const height = grid.length
  const width = grid[0]?.length ?? 1
  if (range && height === 1 && width === 1) {
    return { rect: range, value: () => grid[0]![0]! }
  }
  const rect = {
    top: start.row,
    left: start.col,
    bottom: start.row + height - 1,
    right: start.col + width - 1,
  }
  return { rect, value: (row, col) => grid[row - rect.top]?.[col - rect.left] ?? '' }
}
