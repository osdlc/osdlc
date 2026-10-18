/**
 * Pad a table's cells so its pipes line up in the source, in the "aligned"
 * style of rumdl's MD060 rule.
 */

import type { ColumnAlign } from './row.ts'
import { rowLineText } from './splices.ts'
import { readTable, type TableCell } from './table.ts'
import { displayWidth } from './width.ts'

/** Options for {@link padTable}. */
export interface PadTableOptions {
  /**
   * The widest cell, in display columns, that counts toward its column's
   * width. A wider cell does not widen its column. Where it is wider than
   * the column it keeps one space on each side, so the pipes after it in its
   * row do not line up. Default: no limit.
   */
  maxColumnWidth?: number
}

// rumdl leaves a table holding any of these as it is: their width depends on
// the terminal and font. They are ZWSP, ZWNJ, ZWJ and WORD JOINER.
const UNMEASURED = /\u200b|\u200c|\u200d|\u2060/

const LINE_BREAK = /(\r\n|\n|\r)/

/** The 0-3 spaces before a row's opening pipe, as `rowFromPipes` reads them. */
const OPENING_INDENT = /^( {0,3})\|/

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

function paddedCell(raw: string, align: ColumnAlign, width: number): string {
  const gap = Math.max(0, width - displayWidth(raw))
  if (align === 'right') return ' '.repeat(gap) + raw
  if (align === 'center') {
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + raw + ' '.repeat(gap - left)
  }
  return raw + ' '.repeat(gap)
}

/**
 * Pad a table's source so its pipes line up. `table` is the table's lines:
 * header, delimiter row and body rows, with no container prefix (`> `, list
 * indent), as for {@link readTable}. It may end in a line break.
 *
 * Each row is written `| a | b |`, its cells padded to the column width: the
 * display width of the column's widest cell, and at least 3 plus the
 * column's alignment colons. Wide characters and emoji count as 2 columns. A left-aligned or unaligned cell is padded on
 * the right, a right-aligned one on the left, and a centered one on both
 * sides, the odd space on the right. The delimiter row is dashes the width of
 * the column, alignment colons kept. Cell text is kept as written, escapes
 * included. A row keeps its number of cells and the 0-3 spaces before its
 * opening pipe.
 *
 * The output matches rumdl's MD060 rule in its "aligned" style, except:
 *
 * - A cell wider than `maxColumnWidth` does not widen its column.
 * - A table already aligned with extra padding is narrowed. MD060 keeps it.
 * - The spaces before the opening pipe are kept. MD060 drops them.
 * - Rows are split as `splitRow` splits them, so `\\|` is a backslash and
 *   a cell's end, where MD060 keeps the pipe in the cell. An unescaped pipe
 *   in a code span ends the cell too, where MD060 leaves the table as is.
 *
 * Text that is not a table is returned unchanged, and so is a table holding
 * a zero-width space, joiner, non-joiner or word joiner, as MD060 does: their
 * width depends on the terminal. A blank line ends the table; it and the
 * lines after it are kept as they are. Padding a padded table changes
 * nothing.
 */
export function padTable(table: string, options: PadTableOptions = {}): string {
  const max = options.maxColumnWidth ?? Infinity
  // Lines at even indexes, the line breaks between them at odd ones.
  const parts = table.split(LINE_BREAK)
  let end = parts.findIndex((part, i) => i % 2 === 0 && part.trim() === '')
  if (end === -1) end = parts.length
  const lines = parts.slice(0, end).filter((_, i) => i % 2 === 0)
  if (UNMEASURED.test(lines.join(''))) return table
  const data = readTable(lines)
  if (!data) return table

  const rows: (TableCell[] | null)[] = [data.header, null, ...data.rows]
  const widths: number[] = []
  for (const row of rows) {
    row?.forEach((cell, i) => {
      const width = displayWidth(cell.raw)
      widths[i] = Math.max(widths[i] ?? MIN_WIDTH, width <= max ? width : 0)
    })
  }
  data.align.forEach((align, i) => {
    widths[i] = Math.max(widths[i]!, MIN_WIDTH + colons(align))
  })

  const alignOf = (i: number) => data.align[i] ?? 'none'
  rows.forEach((row, r) => {
    const cells = row
      ? row.map((cell, i) => paddedCell(cell.raw, alignOf(i), widths[i]!))
      : data.align.map((align, i) => delimiterCell(align, widths[i]!))
    // A line with no cells, such as a lone pipe, stays as it is.
    if (cells.length === 0) return
    const indent = OPENING_INDENT.exec(parts[2 * r]!)?.[1] ?? ''
    parts[2 * r] = indent + rowLineText(cells).text
  })
  return parts.join('')
}
