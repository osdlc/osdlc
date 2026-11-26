/**
 * Markdown pieces the renderers share. A table's cells are written as cell
 * source: text through {@link cell}, code through {@link codeCell}, so a
 * pipe, line break or backslash in a path or name cannot split or end a cell.
 */

import { escapeCell, escapeCodeCell, rowLineText } from '@osdlc/gfm-table'

/** A code span in prose. A span cannot hold a backtick here, so one becomes `'`. */
export const code = (s: string): string => `\`${s.replace(/`/g, "'")}\``

/** A code span as table cell source. */
export const codeCell = (s: string): string => code(escapeCodeCell(s))

/** Text as table cell source. */
export const cell = (s: string): string => escapeCell(s)

export const signed = (n: number): string => (n > 0 ? `+${n}` : String(n))
export const bold = (s: string | number): string => `**${s}**`

/**
 * A GFM table: `header` as text, `rows` as cell source, and one `align`
 * letter per column, `r` for right and anything else for left.
 */
export function table(
  header: readonly string[],
  align: string,
  rows: readonly (readonly string[])[],
): string[] {
  return [
    rowLineText(header.map(cell)).text,
    `|${[...align].map((a) => (a === 'r' ? '---:' : '---')).join('|')}|`,
    ...rows.map((r) => rowLineText(r).text),
  ]
}

/** Each note as an italic paragraph. */
export function notes(list: readonly string[], prefix = 'Note'): string[] {
  return list.flatMap((n) => ['', `_${prefix}: ${n}_`])
}
