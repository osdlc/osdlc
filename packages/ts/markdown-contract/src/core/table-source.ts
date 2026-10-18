/**
 * Source-faithful table cells: a projected table's rows re-split from the raw source lines. The
 * projection's `table.columns` and `table.rows` flatten inline markup (`` `tool x new` `` becomes
 * `tool x new`). These helpers keep the verbatim cell text instead, found through the table's
 * `pos` (header) and `rowPos(i)` (data rows).
 *
 * Each line is split by the GFM rule, in `@osdlc/gfm-table`: a backslash escapes the next
 * character, so `\|` stays inside its cell. Each cell is trimmed and the outer pipes are
 * dropped. Empty cells in the middle of a row are kept, and `\|` is not unescaped. A row whose
 * source line has no cells is skipped.
 */
import { splitRow } from '@osdlc/gfm-table'

import type { BlockNode } from './types.js'

type TableBlock = Extract<BlockNode, { kind: 'table' }>

function toLines(source: string | string[]): string[] {
  return typeof source === 'string' ? source.split('\n') : source
}

/** The trimmed cell texts of one table line, outer pipes dropped. */
function cellsOf(line: string): string[] {
  return splitRow(line).cells.map((c) => line.slice(c.content.from, c.content.to).trim())
}

/**
 * The unpadded cell texts of the table's i-th data row, split from its source line. It returns
 * exactly the cells the line carries, with no padding or truncation, so a caller can detect a
 * row whose cell count differs from the header width.
 */
export function rawTableRow(table: TableBlock, source: string | string[], i: number): string[] {
  const lines = toLines(source)
  return cellsOf(lines[table.rowPos(i).line - 1] ?? '')
}

/**
 * Re-split a projected table's header line and every data row from the raw `source`, keeping the
 * verbatim cell text (backticks and other inline markup the projection flattens). `source` may be
 * the whole document string or its pre-split lines.
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
  const header = cellsOf(lines[table.pos.line - 1] ?? '')
  const padTo =
    opts?.pad === 'header' ? header.length : typeof opts?.pad === 'number' ? opts.pad : undefined

  const rows: string[][] = []
  for (let i = 0; i < table.rows.length; i++) {
    const cells = cellsOf(lines[table.rowPos(i).line - 1] ?? '')
    if (cells.length === 0) continue
    if (padTo !== undefined) {
      const padded = [...cells]
      while (padded.length < padTo) padded.push('')
      rows.push(padded)
    } else {
      rows.push(cells)
    }
  }
  return { header, rows }
}
