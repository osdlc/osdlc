/**
 * Edits to a delimited file as text changes. Offsets are UTF-16 string
 * indices, as everywhere in this package. Each change touches only the
 * characters it must, so a file keeps its delimiter, line endings, byte order
 * mark and the quoting of every field the edit does not reach. Pass the
 * {@link DelimitedRead} of the current text. After applying a change, read
 * the new text with {@link rereadDelimited}, which keeps the delimiter and
 * header decision: a fresh {@link readDelimited} sniffs again, and clearing a
 * header cell would turn the header into a row.
 *
 * No edit leaves a line that reads as blank. The reader skips blank lines,
 * so a record whose only field is empty is written `""` ({@link EMPTY_RECORD}).
 */

import type { TextChange } from './cell-text.ts'
import { readDelimited, type DelimitedRead, type DelimitedRecord } from './delimited.ts'

/** How a record of one empty field is written, so it does not read as a blank line. */
const EMPTY_RECORD = '""'

/** A RangeError unless `n` is a non-negative integer. */
function checkIndex(name: string, n: number): void {
  if (!Number.isInteger(n) || n < 0)
    throw new RangeError(`${name} must be a non-negative integer, got ${n}`)
}

/**
 * A field as the file must write it, with each `"` doubled inside quotes.
 *
 * @param value The field's text.
 * @param delimiter The file's delimiter.
 * @param alwaysQuote Quote even when the value does not need it, as for a
 *   field that was quoted before. Otherwise the value is quoted only when it
 *   holds the delimiter, a quote or a line break.
 * @experimental
 */
export function quoteDelimitedField(value: string, delimiter: string, alwaysQuote = false): string {
  if (!alwaysQuote && !value.includes(delimiter) && !/["\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * A record as one line of text, without its line break. A record of no
 * fields, or one empty field, is `""`, so it reads back as a record.
 *
 * @experimental
 */
export function delimitedRecordText(fields: readonly string[], delimiter: string): string {
  if (fields.length === 0 || (fields.length === 1 && fields[0] === '')) return EMPTY_RECORD
  return fields.map((f) => quoteDelimitedField(f, delimiter)).join(delimiter)
}

/**
 * Read text produced by an edit the way `read` was read: same delimiter,
 * same header decision.
 *
 * @experimental
 */
export function rereadDelimited(text: string, read: DelimitedRead): DelimitedRead {
  return readDelimited(text, { delimiter: read.delimiter, header: read.headerRecord !== null })
}

/** The header, then the body rows, in file order. */
function allRecords(read: DelimitedRead): DelimitedRecord[] {
  return read.headerRecord ? [read.headerRecord, ...read.rows] : read.rows
}

/**
 * Set field `column` of `record` to `value`. The field keeps its quotes if
 * it had them. A short record gets empty fields up to `column`, so editing a
 * padding cell of a ragged row fills the row out. Throws a RangeError for a
 * negative or fractional `column`.
 *
 * @experimental
 */
export function setDelimitedField(
  read: DelimitedRead,
  record: DelimitedRecord,
  column: number,
  value: string,
): TextChange {
  checkIndex('column', column)
  const span = record.spans[column]
  if (span) {
    const lone = record.spans.length === 1 && value === ''
    return {
      from: span.from,
      to: span.to,
      insert: quoteDelimitedField(value, read.delimiter, span.quoted || lone),
    }
  }
  const missing = column - record.spans.length + 1
  return {
    from: record.to,
    to: record.to,
    insert: read.delimiter.repeat(missing) + quoteDelimitedField(value, read.delimiter),
  }
}

/**
 * Insert a body row so it becomes row `at` (0 is the first row after the
 * header; `read.rows.length` or more appends). The new line uses the file's
 * line ending. Appending keeps the file's trailing line break, or its lack of
 * one. Throws a RangeError for a negative or fractional `at`.
 *
 * @experimental
 */
export function insertDelimitedRow(
  read: DelimitedRead,
  at: number,
  fields: readonly string[],
): TextChange {
  checkIndex('at', at)
  const line = delimitedRecordText(fields, read.delimiter)
  const eol = read.lineEnding
  const before = read.rows[at]
  if (before) return { from: before.from, to: before.from, insert: line + eol }
  const records = allRecords(read)
  const last = records[records.length - 1]
  if (!last) {
    const start = read.bom ? 1 : 0
    return { from: start, to: start, insert: line + eol }
  }
  if (last.end > last.to) return { from: last.end, to: last.end, insert: line + eol }
  return { from: last.to, to: last.to, insert: eol + line }
}

/**
 * Delete body row `index` with its line break. The last line of a file with
 * no trailing break takes the break before it instead.
 *
 * @experimental
 */
export function deleteDelimitedRow(read: DelimitedRead, index: number): TextChange | null {
  const row = read.rows[index]
  if (!row) return null
  if (row.end > row.to) return { from: row.from, to: row.end, insert: '' }
  const prev = index > 0 ? read.rows[index - 1] : read.headerRecord
  return { from: prev ? prev.to : row.from, to: row.to, insert: '' }
}

/**
 * Insert a column so it becomes column `at` in every record that reaches it.
 * The header's new cell is `header`; body cells are empty. A record shorter
 * than `at` is left as it is. Changes are in file order. Throws a RangeError
 * for a negative or fractional `at`.
 *
 * @experimental
 */
export function insertDelimitedColumn(read: DelimitedRead, at: number, header = ''): TextChange[] {
  checkIndex('at', at)
  const changes: TextChange[] = []
  for (const record of allRecords(read)) {
    const text = quoteDelimitedField(record === read.headerRecord ? header : '', read.delimiter)
    const span = record.spans[at]
    if (span) changes.push({ from: span.from, to: span.from, insert: text + read.delimiter })
    else if (at === record.spans.length)
      changes.push({ from: record.to, to: record.to, insert: read.delimiter + text })
  }
  return changes
}

/**
 * Delete column `column` from every record that has it, with one of its
 * delimiters. A record left with one empty field, or none, is written `""`,
 * so it stays a record. Changes are in file order.
 *
 * @experimental
 */
export function deleteDelimitedColumn(read: DelimitedRead, column: number): TextChange[] {
  const changes: TextChange[] = []
  for (const record of allRecords(read)) {
    const { spans } = record
    const span = spans[column]
    if (!span) continue
    if (spans.length === 1) {
      changes.push({ from: span.from, to: span.to, insert: EMPTY_RECORD })
      continue
    }
    const kept = spans[column === 0 ? 1 : 0]!
    if (spans.length === 2 && kept.from === kept.to) {
      changes.push({ from: record.from, to: record.to, insert: EMPTY_RECORD })
    } else if (column < spans.length - 1) {
      changes.push({ from: span.from, to: spans[column + 1]!.from, insert: '' })
    } else {
      changes.push({ from: spans[column - 1]!.to, to: span.to, insert: '' })
    }
  }
  return changes
}

/**
 * Apply changes to the text they were made against. Changes must not
 * overlap. They are applied by offset, whatever order they come in, except
 * that inserts at the same offset are applied in the order given: insert the
 * one that should come first first. Filling the last row's padding cell and
 * appending a row both insert at that row's end, for example.
 *
 * @experimental
 */
export function applyDelimitedChanges(
  text: string,
  changes: TextChange | readonly TextChange[],
): string {
  const list = (Array.isArray(changes) ? [...changes] : [changes]) as TextChange[]
  list.sort((a, b) => a.from - b.from || a.to - b.to)
  let out = ''
  let at = 0
  for (const c of list) {
    if (c.from < at) throw new RangeError(`overlapping changes at ${c.from}`)
    out += text.slice(at, c.from) + c.insert
    at = c.to
  }
  return out + text.slice(at)
}
