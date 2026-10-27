/**
 * Table cells as written in the source. The parsed `table.columns` and `table.rows` flatten
 * inline markup (`` `tool x new` `` becomes `tool x new`). These helpers split the raw source
 * lines again and keep the exact cell text. They find the lines through the table's `pos`
 * (header) and `rowPos(i)` (data rows).
 *
 * Each line is split by the GFM rule, with `rowCellSources` from `@osdlc/gfm-table`: a
 * backslash escapes the next character, so `\|` stays inside its cell. Each cell is trimmed and
 * the outer pipes are dropped. Empty cells in the middle of a row are kept, and `\|` is not
 * unescaped. A row whose source line has no cells is skipped.
 */
import { padRow, rowCellSources } from '@osdlc/gfm-table'

import type { BlockNode } from './types.js'

type TableBlock = Extract<BlockNode, { kind: 'table' }>

function toLines(source: string | string[]): string[] {
  return typeof source === 'string' ? source.split('\n') : source
}

/**
 * The unpadded cell texts of the table's i-th data row, split from its source line. It returns
 * exactly the cells the line carries, with no padding or truncation, so a caller can detect a
 * row whose cell count differs from the header width.
 */
export function rawTableRow(table: TableBlock, source: string | string[], i: number): string[] {
  const lines = toLines(source)
  return rowCellSources(lines[table.rowPos(i).line - 1] ?? '')
}

/**
 * Splits a table's header line and every data row from the raw `source`, keeping the exact
 * cell text (backticks and other inline markup that parsing flattens). `source` may be the whole
 * document string or its lines.
 *
 * `opts.pad` pads short data rows to a fixed width: `"header"` pads to the header cell count, a
 * number pads to that many cells. Rows are unpadded by default. Rows whose source line has no
 * cells are skipped.
 */
export function rawTableRows(
  table: TableBlock,
  source: string | string[],
  opts?: { pad?: 'header' | number },
): { header: string[]; rows: string[][] } {
  const lines = toLines(source)
  const header = rowCellSources(lines[table.pos.line - 1] ?? '')
  const padTo =
    opts?.pad === 'header' ? header.length : typeof opts?.pad === 'number' ? opts.pad : undefined

  const rows: string[][] = []
  for (let i = 0; i < table.rows.length; i++) {
    const cells = rowCellSources(lines[table.rowPos(i).line - 1] ?? '')
    if (cells.length === 0) continue
    rows.push(padTo === undefined ? cells : padRow(cells, padTo))
  }
  return { header, rows }
}
