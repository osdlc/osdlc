/**
 * Byte splices for table structure: new row lines, and per-line cell inserts
 * and deletes. Each splice touches only its own bytes. Nothing else on the
 * line moves. A row is passed as its own text (`line`, starting at
 * `span.from`) beside its {@link TableRowSpan}.
 */

import type { TableCellSpan, TableRowSpan } from './row.ts'

/** A fresh row line `| a | b |` and each cell's content-start offset. */
export function rowLineText(cells: readonly string[]): { text: string; offsets: number[] } {
  let text = '|'
  const offsets: number[] = []
  for (const cell of cells) {
    text += ' '
    offsets.push(text.length)
    text += `${cell} |`
  }
  return { text, offsets }
}

/**
 * One line's splice, plus where the cursor lands if this is the cursor's line.
 *
 * @experimental
 */
export interface LineSplice {
  change: { from: number; to?: number; insert?: string } | null
  /** Old-text position the cursor is anchored to, and its offset past the splice. */
  anchor: number
  offset: number
}

/**
 * Every table line in document order with the text a new cell takes there.
 *
 * @experimental
 */
export function tableLines(table: {
  rows: readonly TableRowSpan[]
  delimiter: TableRowSpan | null
}): { span: TableRowSpan; filler: string }[] {
  const lines: { span: TableRowSpan; filler: string }[] = []
  if (table.rows[0]) lines.push({ span: table.rows[0], filler: '' })
  if (table.delimiter) lines.push({ span: table.delimiter, filler: '---' })
  for (const row of table.rows.slice(1)) lines.push({ span: row, filler: '' })
  return lines
}

/**
 * Whether a pipe closes the row after its last cell (a lone `|` counts).
 *
 * @experimental
 */
export function hasTrailingPipe(span: TableRowSpan): boolean {
  const last = span.cells[span.cells.length - 1]
  const lastPipe = span.pipes[span.pipes.length - 1]
  return lastPipe !== undefined && (last === undefined || lastPipe === last.to)
}

function cellSource(line: string, span: TableRowSpan, cell: TableCellSpan): string {
  return line.slice(cell.from - span.from, cell.to - span.from)
}

/**
 * Bytes of a new cell next to `neighbour`: `filler` with one space per side
 * when the neighbouring cell is padded, bare when the row is compact (`|x|y|`).
 */
function newCellText(
  line: string,
  span: TableRowSpan,
  neighbour: TableCellSpan | undefined,
  filler: string,
): string {
  const text = neighbour ? cellSource(line, span, neighbour) : ' '
  return text.startsWith(' ') || text.endsWith(' ') ? ` ${filler} ` : filler
}

/**
 * Splice an empty cell in so it becomes column `at` of this line.
 *
 * @experimental
 */
export function insertCellSplice(
  line: string,
  span: TableRowSpan,
  at: number,
  filler: string,
): LineSplice {
  const { cells } = span
  const cell = cells[at]
  if (cell) {
    const text = newCellText(line, span, cell, filler)
    // A pipe before the first cell opened the row, indented 0-3 spaces or not.
    const opened = span.pipes[0] !== undefined && span.pipes[0] < (cells[0]?.from ?? 0)
    if (at > 0 || opened) {
      // The new cell goes right after the pipe that opened `cell`.
      return {
        change: { from: cell.from, insert: `${text}|` },
        anchor: cell.from,
        offset: Math.min(1, text.length),
      }
    }
    // No opening pipe: an empty first cell needs one, so the splice supplies it.
    return {
      change: { from: span.from, insert: `|${text}|` },
      anchor: span.from,
      offset: 1 + Math.min(1, text.length),
    }
  }
  // Past the last cell: append one cell after the closing pipe. A row without
  // one cannot carry an empty trailing cell, so it stays as it is.
  if (!hasTrailingPipe(span)) return { change: null, anchor: span.to, offset: 0 }
  const end = span.pipes[span.pipes.length - 1]! + 1
  const text = newCellText(line, span, cells[cells.length - 1], filler)
  return {
    change: { from: end, insert: `${text}|` },
    anchor: end,
    offset: Math.min(1, text.length),
  }
}

/**
 * An insert that pads a short row, and each new cell's content offset in it.
 *
 * @experimental
 */
export interface RowPad {
  from: number
  insert: string
  contents: number[]
}

/**
 * Pad a short row to `width` cells, appended after its last cell in the
 * row's own padding style. A row without a closing pipe gets one first: an
 * empty last cell needs a pipe after it. Null when the row is wide enough.
 *
 * @experimental
 */
export function padRowSplice(
  line: string,
  span: TableRowSpan,
  width: number,
  filler = '',
): RowPad | null {
  const missing = width - span.cells.length
  if (missing <= 0) return null
  const append = insertCellSplice(line, span, span.cells.length, filler)
  let from: number
  let cell: string
  let insert = ''
  if (append.change) {
    from = append.change.from
    cell = append.change.insert ?? '|'
  } else {
    const last = span.cells[span.cells.length - 1]!
    const text = newCellText(line, span, last, filler)
    from = last.to
    insert = text === filler || cellSource(line, span, last).endsWith(' ') ? '|' : ' |'
    cell = `${text}|`
  }
  const contents: number[] = []
  for (let i = 0; i < missing; i++) {
    contents.push(insert.length + (cell.startsWith(' ') ? 1 : 0))
    insert += cell
  }
  return { from, insert, contents }
}

/**
 * Splice column `col` out of this line: its bytes plus one adjacent pipe.
 *
 * @experimental
 */
export function deleteCellSplice(span: TableRowSpan, col: number): LineSplice {
  const { cells } = span
  const cell = cells[col]
  if (!cell) {
    // Ragged row with no such cell: untouched, cursor to its last cell.
    return { change: null, anchor: cells[cells.length - 1]?.content.from ?? span.from, offset: 0 }
  }
  // Remove the pipe after the cell. On an unclosed last cell, remove the one
  // before it instead, unless that is the row's opening pipe, which stays.
  const pipeAfter = col < cells.length - 1 || hasTrailingPipe(span)
  const change = pipeAfter
    ? { from: cell.from, to: cell.to + 1 }
    : { from: col > 0 ? cell.from - 1 : cell.from, to: cell.to }
  const focus = cells[col + 1] ?? cells[col - 1]
  return { change, anchor: focus?.content.from ?? span.from, offset: 0 }
}
