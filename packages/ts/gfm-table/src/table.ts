/** Whole tables: read row lines into cells, and render cells into row lines. */

import { cellTextFromSource, escapeCell } from './cell-text.ts'
import { padRow } from './grid.ts'
import { type ColumnAlign, isDelimiterRow, parseAlign, splitRow } from './row.ts'
import { rowLineText } from './splices.ts'

/** A cell as written (`raw`, trimmed source) and as text (pipe escapes read). */
export interface TableCell {
  /** The cell's source, trimmed, with its escapes as written. */
  raw: string
  /** The cell's text, with `\|` read as `|`. */
  text: string
}

/** A table read from its row lines. */
export interface TableData {
  /** The header row's cells. */
  header: TableCell[]
  /** One alignment per header cell, from the delimiter row. */
  align: ColumnAlign[]
  /** Body rows, each with the cells it has: rows are not padded or cut to the header. */
  rows: TableCell[][]
}

function rowCells(line: string): TableCell[] {
  return splitRow(line).cells.map((cell) => {
    const raw = line.slice(cell.content.from, cell.content.to).trim()
    return { raw, text: cellTextFromSource(raw).text }
  })
}

/** The source of each cell of one row line: trimmed, escapes as written (`\|` stays `\|`). */
export function rowCellSources(line: string): string[] {
  return rowCells(line).map((cell) => cell.raw)
}

/** The text of each cell of one row line: trimmed, pipe escapes read. */
export function rowCellTexts(line: string): string[] {
  return rowCells(line).map((cell) => cell.text)
}

/**
 * Read a table from its lines: header, delimiter row, then body rows. Lines
 * carry no container prefix (`> `, list indent). Null when the second line
 * is not a delimiter row as wide as the header.
 */
export function readTable(lines: readonly string[]): TableData | null {
  const [head, delimiter, ...body] = lines
  if (head === undefined || delimiter === undefined || !isDelimiterRow(delimiter)) return null
  const header = rowCells(head)
  const align = rowCells(delimiter).map((cell) => parseAlign(cell.raw))
  if (align.length !== header.length) return null
  return { header, align, rows: body.map(rowCells) }
}

const ALIGN_SPEC: Record<ColumnAlign, string> = {
  none: '---',
  left: ':---',
  center: ':---:',
  right: '---:',
}

/** Cell texts for {@link renderTable}; `align` defaults to `none` per column. */
export interface TableInput {
  /** Header cell texts; their count is the table's width. */
  header: readonly string[]
  /** One alignment per column. */
  align?: readonly ColumnAlign[]
  /** Body rows of cell texts. */
  rows: readonly (readonly string[])[]
}

/** Options for {@link renderTable}. */
export interface RenderTableOptions {
  /** Joins the lines. Default `\n`. */
  lineBreak?: string
}

/**
 * A table's markdown from cell texts, one space of padding per cell side.
 * Every cell goes through {@link escapeCell}. Short body rows are padded with
 * empty cells to the header's width. Longer ones keep their extra cells. An
 * empty header gives `''`, since a table needs at least one column.
 */
export function renderTable(table: TableInput, options: RenderTableOptions = {}): string {
  const width = table.header.length
  if (width === 0) return ''
  const line = (cells: readonly string[]) => rowLineText(cells.map(escapeCell)).text
  const delimiter = rowLineText(
    Array.from({ length: width }, (_, i) => ALIGN_SPEC[table.align?.[i] ?? 'none']),
  ).text
  return [line(table.header), delimiter, ...table.rows.map((row) => line(padRow(row, width)))].join(
    options.lineBreak ?? '\n',
  )
}

/**
 * A table as a grid of cell texts, for a viewer.
 *
 * @experimental
 */
export interface TableGrid {
  /** Header cell texts. */
  header: string[]
  /** One alignment per column. */
  align: ColumnAlign[]
  /** Body rows cut or padded to the header's width, as GFM renders them. */
  rows: string[][]
  /** Rows written with too few or too many cells; `line` is 1-based in the lines given. */
  issues: { line: number; row: number; message: string }[]
}

/**
 * Read a table's lines into a grid of cell texts over {@link readTable}.
 * Null when the lines are not a table.
 *
 * @experimental
 */
export function tableGrid(lines: readonly string[]): TableGrid | null {
  const table = readTable(lines)
  if (!table) return null
  const width = table.header.length
  const issues: TableGrid['issues'] = []
  const rows = table.rows.map((cells, row) => {
    if (cells.length !== width) {
      const message =
        cells.length < width
          ? `${cells.length} cells, header has ${width}; padded`
          : `${cells.length} cells, header has ${width}; extra cells dropped`
      issues.push({ line: row + 3, row, message })
    }
    return padRow(
      cells.slice(0, width).map((cell) => cell.text),
      width,
    )
  })
  return { header: table.header.map((cell) => cell.text), align: table.align, rows, issues }
}
