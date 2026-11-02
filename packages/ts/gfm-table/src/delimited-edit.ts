/**
 * Edits to a delimited file as byte changes. Each change touches only the
 * bytes it must, so a file keeps its delimiter, line endings, byte order
 * mark and the quoting of every field the edit does not reach. Pass the
 * {@link DelimitedRead} of the current text; read the text again after
 * applying a change.
 */

import type { DelimitedRead, DelimitedRecord } from './delimited.ts'

/**
 * Replace `from`..`to` of the old text with `insert`. An insert has `to`
 * equal to `from`.
 *
 * @experimental
 */
export interface DelimitedChange {
  from: number
  to: number
  insert: string
}

/**
 * A field as the file must write it: in quotes when it holds the delimiter,
 * a quote or a line break, or when `quote` is set, with each `"` doubled.
 *
 * @experimental
 */
export function quoteDelimitedField(value: string, delimiter: string, quote = false): string {
  if (!quote && !value.includes(delimiter) && !/["\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * A record as one line of text, without its line break.
 *
 * @experimental
 */
export function delimitedRecordText(fields: readonly string[], delimiter: string): string {
  return fields.map((f) => quoteDelimitedField(f, delimiter)).join(delimiter)
}

/** The header, then the body rows, in file order. */
function allRecords(read: DelimitedRead): DelimitedRecord[] {
  return read.headerRecord ? [read.headerRecord, ...read.rows] : read.rows
}

/**
 * Set field `column` of `record` to `value`. The field keeps its quotes if
 * it had them. A short record gets empty fields up to `column`, so editing a
 * padding cell of a ragged row fills the row out.
 *
 * @experimental
 */
export function setDelimitedField(
  read: DelimitedRead,
  record: DelimitedRecord,
  column: number,
  value: string,
): DelimitedChange {
  const span = record.spans[column]
  if (span) {
    return {
      from: span.from,
      to: span.to,
      insert: quoteDelimitedField(value, read.delimiter, span.quoted),
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
 * header; `read.rows.length` appends). The new line uses the file's line
 * ending. Appending keeps the file's trailing line break, or its lack of one.
 *
 * @experimental
 */
export function insertDelimitedRow(
  read: DelimitedRead,
  at: number,
  fields: readonly string[],
): DelimitedChange {
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
export function deleteDelimitedRow(read: DelimitedRead, index: number): DelimitedChange | null {
  const row = read.rows[index]
  if (!row) return null
  if (row.end > row.to) return { from: row.from, to: row.end, insert: '' }
  const records = allRecords(read)
  const prev = records[records.indexOf(row) - 1]
  return { from: prev ? prev.to : row.from, to: row.to, insert: '' }
}

/**
 * Insert a column so it becomes column `at` in every record that reaches it.
 * The header's new cell is `header`; body cells are empty. A record shorter
 * than `at` is left as it is. Changes are in file order.
 *
 * @experimental
 */
export function insertDelimitedColumn(
  read: DelimitedRead,
  at: number,
  header = '',
): DelimitedChange[] {
  const changes: DelimitedChange[] = []
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
 * delimiters. A record whose only field it is keeps an empty field, so the
 * line stays a record. Changes are in file order.
 *
 * @experimental
 */
export function deleteDelimitedColumn(read: DelimitedRead, column: number): DelimitedChange[] {
  const changes: DelimitedChange[] = []
  for (const record of allRecords(read)) {
    const { spans } = record
    const span = spans[column]
    if (!span) continue
    if (spans.length === 1) changes.push({ from: span.from, to: span.to, insert: '' })
    else if (column < spans.length - 1)
      changes.push({ from: span.from, to: spans[column + 1]!.from, insert: '' })
    else changes.push({ from: spans[column - 1]!.to, to: span.to, insert: '' })
  }
  return changes
}

/**
 * Apply changes to the text they were made against. Changes must not
 * overlap; they may come in any order.
 *
 * @experimental
 */
export function applyDelimitedChanges(
  text: string,
  changes: DelimitedChange | readonly DelimitedChange[],
): string {
  const list = (Array.isArray(changes) ? [...changes] : [changes]) as DelimitedChange[]
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
