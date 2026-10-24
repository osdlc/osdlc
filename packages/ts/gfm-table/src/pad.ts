/**
 * Pad a table's cells so its pipes line up in the source, in the "aligned"
 * style of rumdl's MD060 rule.
 */

import { type ColumnAlign, rowPipes } from './row.ts'
import { rowLineText } from './splices.ts'
import { readTable, type TableCell } from './table.ts'
import { displayWidth } from './width.ts'

/** Options for {@link padTable}. */
export interface PadTableOptions {
  /**
   * The widest cell, in display columns, that counts toward its column's
   * width: a positive integer. A wider cell does not widen its column. Where
   * it is wider than the column it keeps one space on each side, so the
   * pipes after it in its row do not line up. Default: no limit.
   */
  maxColumnWidth?: number
}

// rumdl leaves a table holding any of these as it is: their width depends on
// the terminal and font. They are ZWSP, ZWNJ, ZWJ and WORD JOINER.
const UNMEASURED = /\u200b|\u200c|\u200d|\u2060/

const LINE_BREAK = /(\r\n|\n|\r)/

/** The header's leading spaces, which every row takes. */
const INDENT = /^ {0,3}/

/** A line indented 4 or more columns, an indented code block in GFM. */
const CODE_INDENT = /^ {0,3}\t|^ {4}/

/** The minimum column width: a delimiter cell needs 3 dashes. */
const MIN_WIDTH = 3

function colons(align: ColumnAlign): number {
  return align === 'center' ? 2 : align === 'none' ? 0 : 1
}

function delimiterCell(align: ColumnAlign, width: number): string {
  const dashes = '-'.repeat(width - colons(align))
  if (align === 'center') return `:${dashes}:`
  if (align === 'left') return `:${dashes}`
  if (align === 'right') return `${dashes}:`
  return dashes
}

function paddedCell(raw: string, rawWidth: number, align: ColumnAlign, width: number): string {
  const gap = Math.max(0, width - rawWidth)
  if (align === 'right') return ' '.repeat(gap) + raw
  if (align === 'center') {
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + raw + ' '.repeat(gap - left)
  }
  return raw + ' '.repeat(gap)
}

/**
 * Pad a table's source so its pipes line up. Unlike `padRow` and
 * `padRowSplice`, it aligns columns and never adds cells.
 *
 * `table` is only the table's lines: header, delimiter row and body rows,
 * with no container prefix (`> `, list indent), as for {@link readTable}. It
 * may end in a line break. padTable does not find where a table ends. It
 * stops at a blank line or a line indented 4 or more columns, which GFM
 * reads as a code block, and keeps that line and the ones after it as they
 * are. A heading or fence right after the last row would be read as a row,
 * so the caller passes the table alone.
 *
 * Each row is written `| a | b |`, its cells padded to the column width:
 * the display width of the column's widest cell, and at least 3 plus the
 * column's alignment colons. Wide characters and emoji count as 2 columns.
 * A left-aligned or unaligned cell is padded on the right, a right-aligned
 * one on the left, and a centered one on both sides, the odd space on the
 * right. The delimiter row is dashes the width of the column, alignment
 * colons kept. Cell text is kept as written, escapes included. A row keeps
 * its number of cells, and every row takes the header's 0-3 leading
 * spaces.
 *
 * The output matches rumdl's MD060 rule in its "aligned" style, except:
 *
 * - A cell wider than `maxColumnWidth` does not widen its column.
 * - A table already aligned with extra padding is narrowed. MD060 keeps it.
 * - The header's leading spaces are kept. MD060 drops them.
 * - An unescaped pipe in a code span ends the cell, by the GFM rule. MD060
 *   leaves such a table as is.
 *
 * Returned unchanged:
 *
 * - text that is not a table;
 * - a table with a zero-width space, joiner, non-joiner or word joiner,
 *   whose width depends on the terminal, as MD060 does;
 * - a table with a pipe after an even run of backslashes, such as `\\|`. This
 *   package reads the run as escaped backslashes and the pipe as a cell end,
 *   but GitHub keeps the pipe in the cell, so padding could change what
 *   GitHub shows.
 *
 * Padding a padded table changes nothing.
 *
 * @throws RangeError when `maxColumnWidth` is not a positive integer.
 */
export function padTable(table: string, options: PadTableOptions = {}): string {
  const cap = options.maxColumnWidth
  if (cap !== undefined && !(Number.isInteger(cap) && cap > 0)) {
    throw new RangeError(`maxColumnWidth must be a positive integer, not ${cap}`)
  }
  const max = cap ?? Infinity
  // Lines at even indexes, the line breaks between them at odd ones.
  const parts = table.split(LINE_BREAK)
  let end = parts.findIndex(
    (part, i) => i % 2 === 0 && (part.trim() === '' || CODE_INDENT.test(part)),
  )
  if (end === -1) end = parts.length
  const lines = parts.slice(0, end).filter((_, i) => i % 2 === 0)
  if (UNMEASURED.test(lines.join(''))) return table
  if (lines.some((line) => rowPipes(line).some((pipe) => line[pipe - 1] === '\\'))) return table
  const data = readTable(lines)
  if (!data) return table

  const rows: (TableCell[] | null)[] = [data.header, null, ...data.rows]
  const cellWidths = rows.map((row) => row?.map((cell) => displayWidth(cell.raw)))
  const widths: number[] = []
  for (const row of cellWidths) {
    row?.forEach((width, i) => {
      widths[i] = Math.max(widths[i] ?? MIN_WIDTH, width <= max ? width : 0)
    })
  }
  data.align.forEach((align, i) => {
    widths[i] = Math.max(widths[i]!, MIN_WIDTH + colons(align))
  })

  const alignOf = (i: number) => data.align[i] ?? 'none'
  const indent = INDENT.exec(lines[0]!)![0]
  rows.forEach((row, r) => {
    const cells = row
      ? row.map((cell, i) => paddedCell(cell.raw, cellWidths[r]![i]!, alignOf(i), widths[i]!))
      : data.align.map((align, i) => delimiterCell(align, widths[i]!))
    // A line with no cells, such as a lone pipe, stays as it is.
    if (cells.length === 0) return
    parts[2 * r] = indent + rowLineText(cells).text
  })
  return parts.join('')
}
