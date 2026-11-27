/** Plain-text table layout for the CLI's non-JSON `query` output. */

/** Lay out `rows` under `headers`, each column padded to its widest cell. */
export function renderTable(headers: string[], rows: string[][]): string {
  // Folded rather than spread: `Math.max(...cells)` takes one argument per row,
  // and a large vault has more rows than a call can take.
  const widths = headers.map((h, i) =>
    rows.reduce((w, r) => Math.max(w, (r[i] ?? '').length), h.length),
  )
  // A row longer than the header gets no padding for its surplus cells, which
  // is what padEnd(0) already did with the undefined width.
  const line = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ')
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n')
}
