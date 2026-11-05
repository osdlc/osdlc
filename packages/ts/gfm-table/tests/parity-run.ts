/**
 * The runner for each section of the shared parity fixture,
 * `packages/rust/gfm-pipe-table/tests/fixtures/parity.json`. Each runner
 * takes a case's inputs and returns the value the fixture's `expected`
 * holds, in the fixture's spelling.
 *
 * The fixture's offsets are UTF-8 byte offsets, as the Rust twin reports
 * them. This package reports UTF-16 string indices, so the runners convert:
 * an offset into a line becomes the byte length of the line before it. A
 * line's `base` is a plain number in both and is not converted. Sections
 * whose offsets index cell text (`cell_text`, `source_offset`,
 * `text_offset`) hold ASCII text only, where the two agree.
 *
 * A refusal is `{ error: kind }`. There are two: `pad_table`'s `RangeError`
 * for a `maxColumnWidth` that is not a positive integer, kind
 * `invalid_max_column_width`, which the Rust twin's type cannot hold; and
 * `apply_delimited_changes`' `RangeError` for changes that overlap, kind
 * `overlapping_changes`, the Rust twin's `OverlappingChanges` error.
 */

import { displayWidth } from '../src/width.ts'
import {
  applyDelimitedChanges,
  type CellRect,
  type ColumnAlign,
  cellTextFromSource,
  clipboardLines,
  deleteCellSplice,
  deleteDelimitedColumn,
  deleteDelimitedRow,
  delimitedRecordText,
  DELIMITER_NAMES,
  type Delimiter,
  endsWithEscape,
  escapeCell,
  escapeCellInsert,
  escapeCodeCell,
  gridFromCsv,
  gridFromCsvPaste,
  gridFromTsv,
  hasTrailingPipe,
  htmlFromGrid,
  insertCellSplice,
  insertDelimitedColumn,
  insertDelimitedRow,
  isDelimiterRow,
  type LineSplice,
  literalPipeFixes,
  looksLikeHeader,
  padRow,
  padRowSplice,
  padTable,
  parseAlign,
  parseDelimited,
  pasteRect,
  quoteDelimitedField,
  readDelimited,
  readTable,
  rectangular,
  renderTable,
  rereadDelimited,
  rowCellSources,
  rowCellTexts,
  rowFromPipes,
  rowLineText,
  rowPipes,
  setDelimitedField,
  sniffDelimiter,
  sourceOffset,
  splitRow,
  tableGrid,
  tableLines,
  type TableRowSpan,
  textOffset,
  toCsv,
  tsvFromGrid,
  type DelimitedRead,
  type DelimitedRecord,
  type TextChange,
} from '../src/index.ts'

const encoder = new TextEncoder()

/** The UTF-8 byte offset of UTF-16 index `index` in `text`. */
export function byteOffset(text: string, index: number): number {
  return encoder.encode(text.slice(0, index)).length
}

/**
 * The UTF-16 index of UTF-8 byte offset `bytes` in `text`. One pass, adding
 * each code point's UTF-8 length; a lone surrogate counts 3, as TextEncoder
 * writes U+FFFD for it.
 */
export function utf16Offset(text: string, bytes: number): number {
  let i = 0
  let at = 0
  while (at < bytes && i < text.length) {
    const cp = text.codePointAt(i)!
    at += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
    i += cp > 0xffff ? 2 : 1
  }
  if (at === bytes) return i
  throw new Error(`byte offset ${bytes} is not a character boundary of ${JSON.stringify(text)}`)
}

/** An absolute offset into `line` read at `base`, as bytes. */
const abs = (line: string, base: number, at: number) => base + byteOffset(line, at - base)

function spanJson(line: string, base: number, span: TableRowSpan) {
  const o = (at: number) => abs(line, base, at)
  return {
    from: span.from,
    to: o(span.to),
    pipes: span.pipes.map(o),
    cells: span.cells.map((c) => ({
      from: o(c.from),
      to: o(c.to),
      content: [o(c.content.from), o(c.content.to)],
    })),
  }
}

function spliceJson(line: string, base: number, splice: LineSplice) {
  const o = (at: number) => abs(line, base, at)
  const { change } = splice
  return {
    change: change && {
      from: o(change.from),
      to: o(change.to ?? change.from),
      insert: change.insert ?? '',
    },
    anchor: o(splice.anchor),
    // The offset counts into the inserted text, from the anchor.
    offset: change ? byteOffset(change.insert ?? '', splice.offset) : splice.offset,
  }
}

const isAscii = (text: string) => [...text].every((ch) => ch.codePointAt(0)! < 0x80)

/** A record of `text`, its offsets as bytes. */
function recordJson(text: string, r: DelimitedRecord) {
  const o = (at: number) => byteOffset(text, at)
  return {
    fields: r.fields,
    spans: r.spans.map((s) => ({ from: o(s.from), to: o(s.to), quoted: s.quoted })),
    line: r.line,
    from: o(r.from),
    to: o(r.to),
    end: o(r.end),
    issue: r.issue ?? null,
  }
}

/** A read of `text`, in the fixture's spelling. */
function readJson(text: string, read: DelimitedRead) {
  return {
    delimiter: read.delimiter,
    header: read.header,
    header_record: read.headerRecord && recordJson(text, read.headerRecord),
    rows: read.rows.map((r) => recordJson(text, r)),
    width: read.width,
    issues: read.issues,
    line_ending: read.lineEnding,
    bom: read.bom,
  }
}

/** The case's `text` read with its `delimiter` and `header` options. */
function readCase(c: Case): DelimitedRead {
  const options: { delimiter?: Delimiter; header?: boolean } = {}
  if (c.delimiter !== undefined) options.delimiter = c.delimiter
  if (c.header !== undefined) options.header = c.header
  return readDelimited(c.text, options)
}

/** Changes to `text`, their offsets as bytes, and the text they make. */
function changesJson(text: string, changes: TextChange[]) {
  return {
    changes: changes.map((ch) => changeJson(text, ch)),
    text: applyDelimitedChanges(text, changes),
  }
}

function changeJson(text: string, ch: TextChange) {
  return { from: byteOffset(text, ch.from), to: byteOffset(text, ch.to), insert: ch.insert }
}

/** One change, or none, and the text it makes. */
function oneChangeJson(text: string, ch: TextChange | null) {
  return {
    change: ch && changeJson(text, ch),
    text: ch ? applyDelimitedChanges(text, ch) : text,
  }
}

/** A case as the fixture holds it: any inputs. */
type Case = Record<string, any>

export const RUNNERS: Record<string, (c: Case) => unknown> = {
  split_row: (c) => spanJson(c.line, c.base, splitRow(c.line, c.base)),
  row_from_pipes: (c) =>
    spanJson(
      c.line,
      c.base,
      rowFromPipes(
        c.line,
        c.base,
        (c.pipes as number[]).map((p) => c.base + utf16Offset(c.line, p - c.base)),
      ),
    ),
  row_pipes: (c) => rowPipes(c.line, c.base).map((p) => abs(c.line, c.base, p)),
  is_delimiter_row: (c) => isDelimiterRow(c.line),
  parse_align: (c) => parseAlign(c.spec),

  cell_text: (c) => {
    const cell = cellTextFromSource(c.source)
    return isAscii(c.source) ? cell : { text: cell.text }
  },
  source_offset: (c) => sourceOffset(cellTextFromSource(c.source), c.pos),
  text_offset: (c) => textOffset(cellTextFromSource(c.source), c.offset),
  escape_cell: (c) => escapeCell(c.text),
  escape_cell_insert: (c) => escapeCellInsert(c.text),
  escape_code_cell: (c) => escapeCodeCell(c.text),
  ends_with_escape: (c) => endsWithEscape(c.source),
  literal_pipe_fixes: (c) => {
    const at = (b: number) => utf16Offset(c.text, b)
    const inserted = (c.inserted as [number, number][]).map(([from, to]) => ({
      from: at(from),
      to: at(to),
    }))
    return literalPipeFixes(c.text, inserted).map((fix) => ({
      from: byteOffset(c.text, fix.from),
      to: byteOffset(c.text, fix.to),
      insert: fix.insert,
    }))
  },

  row_cell_texts: (c) => rowCellTexts(c.line),
  row_cell_sources: (c) => rowCellSources(c.line),
  read_table: (c) => readTable(c.lines),
  render_table: (c) =>
    renderTable(
      c.align === undefined
        ? { header: c.header, rows: c.rows }
        : { header: c.header, align: c.align as ColumnAlign[], rows: c.rows },
      c.line_break === undefined ? {} : { lineBreak: c.line_break },
    ),
  table_grid: (c) => tableGrid(c.lines),
  pad_table: (c) => {
    try {
      return padTable(
        c.table,
        c.max_column_width === undefined ? {} : { maxColumnWidth: c.max_column_width },
      )
    } catch (e) {
      if (e instanceof RangeError) return { error: 'invalid_max_column_width' }
      throw e
    }
  },
  display_width: (c) => displayWidth(c.text),

  row_line_text: (c) => {
    const { text, offsets } = rowLineText(c.cells)
    return { text, offsets: offsets.map((o) => byteOffset(text, o)) }
  },
  insert_cell_splice: (c) =>
    spliceJson(c.line, c.base, insertCellSplice(c.line, splitRow(c.line, c.base), c.at, c.filler)),
  delete_cell_splice: (c) =>
    spliceJson(c.line, c.base, deleteCellSplice(splitRow(c.line, c.base), c.col)),
  pad_row_splice: (c) => {
    const pad = padRowSplice(c.line, splitRow(c.line, c.base), c.width, c.filler)
    return (
      pad && {
        from: abs(c.line, c.base, pad.from),
        insert: pad.insert,
        contents: pad.contents.map((o) => byteOffset(pad.insert, o)),
      }
    )
  },
  has_trailing_pipe: (c) => hasTrailingPipe(splitRow(c.line)),
  table_lines: (c) => {
    // Bases differ by language, so lines are named by their index.
    const spans = (c.lines as string[]).map((line) => splitRow(line))
    const rows = spans.filter((_, i) => i !== 1)
    const delimiter = c.delimiter ? spans[1]! : null
    return tableLines({ rows, delimiter }).map((l) => ({
      line: spans.indexOf(l.span),
      filler: l.filler,
    }))
  },

  rectangular: (c) => rectangular(c.rows),
  pad_row: (c) => padRow(c.cells, c.width),
  clipboard_lines: (c) => clipboardLines(c.text),
  grid_from_tsv: (c) => gridFromTsv(c.text),
  tsv_from_grid: (c) => tsvFromGrid(c.grid),
  to_csv: (c) => toCsv(c.rows),
  grid_from_csv: (c) => gridFromCsv(c.text),
  grid_from_csv_paste: (c) => gridFromCsvPaste(c.text),
  html_from_grid: (c) => htmlFromGrid(c.shown, c.source, c.header),
  paste_rect: (c) => {
    const [row, col] = c.start as [number, number]
    const { rect, value } = pasteRect(c.grid, { row, col }, c.range as CellRect | undefined)
    // A rectangle with its bottom above its top, or its right left of its
    // left, covers no cell; the Rust twin returns `None` for it.
    if (rect.bottom < rect.top || rect.right < rect.left) return null
    return { rect, values: (c.probes as [number, number][]).map(([r, k]) => value(r, k)) }
  },
  round_trip: (c) =>
    c.format === 'tsv' ? gridFromTsv(tsvFromGrid(c.grid)) : gridFromCsv(toCsv(c.grid)),

  sniff_delimiter: (c) => sniffDelimiter(c.text),
  delimiter_name: (c) => DELIMITER_NAMES[c.delimiter as Delimiter],
  parse_delimited: (c) => {
    const { records, issues, lineEnding, bom } = parseDelimited(c.text, c.delimiter)
    return {
      records: records.map((r) => recordJson(c.text, r)),
      issues,
      line_ending: lineEnding,
      bom,
    }
  },
  looks_like_header: (c) => looksLikeHeader(c.first ?? undefined),
  read_delimited: (c) => readJson(c.text, readCase(c)),

  quote_delimited_field: (c) => quoteDelimitedField(c.value, c.delimiter, c.always_quote),
  delimited_record_text: (c) => delimitedRecordText(c.fields, c.delimiter),
  reread_delimited: (c) => readJson(c.next, rereadDelimited(c.next, readCase(c))),
  set_delimited_field: (c) => {
    const read = readCase(c)
    // `record` counts the header, when there is one, as record 0.
    const records = read.headerRecord ? [read.headerRecord, ...read.rows] : read.rows
    return oneChangeJson(c.text, setDelimitedField(read, records[c.record]!, c.column, c.value))
  },
  insert_delimited_row: (c) =>
    oneChangeJson(c.text, insertDelimitedRow(readCase(c), c.at, c.fields)),
  delete_delimited_row: (c) => oneChangeJson(c.text, deleteDelimitedRow(readCase(c), c.index)),
  insert_delimited_column: (c) =>
    changesJson(c.text, insertDelimitedColumn(readCase(c), c.at, c.header_text)),
  delete_delimited_column: (c) => changesJson(c.text, deleteDelimitedColumn(readCase(c), c.column)),
  apply_delimited_changes: (c) => {
    const at = (b: number) => utf16Offset(c.text, b)
    const changes = (c.changes as TextChange[]).map((ch) => ({
      from: at(ch.from),
      to: at(ch.to),
      insert: ch.insert,
    }))
    try {
      return applyDelimitedChanges(c.text, changes)
    } catch (e) {
      if (e instanceof RangeError) return { error: 'overlapping_changes' }
      throw e
    }
  },
}
