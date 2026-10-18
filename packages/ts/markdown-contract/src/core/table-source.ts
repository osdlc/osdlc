/**
 * Source-faithful table cells — re-split a projected table's rows directly from the raw
 * source lines. The projection's `table.columns` / `table.rows` FLATTEN inline markup: gfm
 * renders `` `tool x new` `` to the bare text `tool x new`, dropping the backticks. Consumers
 * that must preserve verbatim cell text (a CLI cell keeping its backticks, a Location cell
 * keeping its `path#symbol`) re-split each row from its source line, located via the table's
 * `pos` (header) and `rowPos(i)` (data rows).
 *
 * Cell semantics match the call sites' `splitRow`: split the line on `|`, trim each cell, drop a
 * single leading and a single trailing empty cell (the outer pipes). Internal empty cells are
 * NOT collapsed, and `\|` is NOT unescaped (the call sites this absorbs — the Operations-table
 * parser — do not). A row whose source line splits to zero cells is skipped, matching the
 * parser's `if (cells.length === 0) continue`.
 */
import type { BlockNode } from './types.js'

type TableBlock = Extract<BlockNode, { kind: 'table' }>

function toLines(source: string | string[]): string[] {
  return typeof source === 'string' ? source.split('\n') : source
}

/** Split a `| a | b | c |` line into `["a","b","c"]` — trim, drop the outer empties. */
function splitRow(line: string): string[] {
  let parts = line.split('|').map((cell) => cell.trim())
  if (parts.length > 0 && parts[0] === '') parts = parts.slice(1)
  if (parts.length > 0 && parts[parts.length - 1] === '') parts = parts.slice(0, -1)
  return parts
}

/**
 * The LITERAL, unpadded cell array for the table's i-th data row, split from its source line.
 * Returns exactly what the line carries — no padding, no truncation — so callers can detect
 * a row whose cell count differs from the header width (an arity mismatch).
 */
export function rawTableRow(table: TableBlock, source: string | string[], i: number): string[] {
  const lines = toLines(source)
  return splitRow(lines[table.rowPos(i).line - 1] ?? '')
}

/**
 * Re-split a projected table's header line and every data row from the raw `source`, preserving
 * verbatim cell text (backticks and other inline markup the projection flattens). `source` may be
 * the whole document string or its pre-split lines.
 *
 * `opts.pad` pads short data rows to a fixed width: `"header"` pads to the header cell count, a
 * number pads to that many cells. Unpadded by default. Rows whose source line splits to zero cells
 * are skipped (matching the Operations-table parser).
 */
export function rawTableRows(
  table: TableBlock,
  source: string | string[],
  opts?: { pad?: 'header' | number },
): { header: string[]; rows: string[][] } {
  const lines = toLines(source)
  const header = splitRow(lines[table.pos.line - 1] ?? '')
  const padTo =
    opts?.pad === 'header' ? header.length : typeof opts?.pad === 'number' ? opts.pad : undefined

  const rows: string[][] = []
  for (let i = 0; i < table.rows.length; i++) {
    const cells = splitRow(lines[table.rowPos(i).line - 1] ?? '')
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
