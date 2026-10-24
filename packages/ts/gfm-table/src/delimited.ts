/**
 * Delimited text files (CSV, TSV, semicolon and pipe separated) read
 * tolerantly. {@link gridFromCsv} rejects a whole file over one bad quote.
 * This reader keeps reading and reports each problem by line. Plain strings
 * in and out. Typing the cells is the caller's job.
 */

/**
 * The delimiters {@link sniffDelimiter} chooses between, in tie-break order.
 *
 * @experimental
 */
export const DELIMITERS = [',', '\t', ';', '|'] as const

/**
 * One of {@link DELIMITERS}.
 *
 * @experimental
 */
export type Delimiter = (typeof DELIMITERS)[number]

/**
 * A name for each delimiter, for messages and pickers.
 *
 * @experimental
 */
export const DELIMITER_NAMES: Record<Delimiter, string> = {
  ',': 'comma',
  '\t': 'tab',
  ';': 'semicolon',
  '|': 'pipe',
}

/**
 * A problem reading the file, at a 1-based line.
 *
 * @experimental
 */
export interface DelimitedIssue {
  /** 1-based line of the problem. */
  line: number
  /** What went wrong and what the reader did about it. */
  message: string
}

/**
 * One record as written: fields untrimmed, not padded to the header.
 *
 * @experimental
 */
export interface DelimitedRecord {
  /** The record's fields, untrimmed. */
  fields: string[]
  /** 1-based line the record starts on. */
  line: number
  /** The first problem reading this record, if any. */
  issue?: string
}

/**
 * A file read by {@link readDelimited}.
 *
 * @experimental
 */
export interface DelimitedRead {
  /** The delimiter used, given or sniffed. */
  delimiter: Delimiter
  /** The header cells, or null when the first record is data. */
  header: string[] | null
  /** Body records, after the header. */
  rows: DelimitedRecord[]
  /** The widest of the header and every row. */
  width: number
  /** Every problem, by line. */
  issues: DelimitedIssue[]
}

/** Count a delimiter per line outside quotes, over the first `maxLines` lines. */
function delimiterCounts(text: string, delim: string, maxLines = 20): number[] {
  const counts: number[] = []
  let n = 0
  let quoted = false
  for (let i = 0; i < text.length && counts.length < maxLines; i++) {
    const ch = text[i]
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === delim) n++
    else if (!quoted && ch === '\n') {
      counts.push(n)
      n = 0
    }
  }
  if (n > 0) counts.push(n)
  return counts
}

/**
 * The delimiter whose per-line count over the first 20 lines is most
 * consistent and non-zero. Ties go to the order of {@link DELIMITERS}, so
 * comma wins. Text with none of them reads as comma.
 *
 * @experimental
 */
export function sniffDelimiter(text: string): Delimiter {
  let best: Delimiter = ','
  let bestScore = -1
  for (const d of DELIMITERS) {
    const counts = delimiterCounts(text, d).filter((c) => c > 0)
    if (counts.length === 0) continue
    const freq = new Map<number, number>()
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1)
    let mode = 0
    let hits = 0
    for (const [count, seen] of freq) {
      if (seen > hits) {
        mode = count
        hits = seen
      }
    }
    const score = hits * 10 + Math.min(mode, 9)
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

/** The closing quote of a quoted field, skipping `""`; -1 past 50 line breaks or the end. */
function findClosingQuote(text: string, from: number): number {
  let breaks = 0
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\n' && ++breaks > 50) return -1
    if (ch !== '"') continue
    if (text[i + 1] === '"') {
      i++
      continue
    }
    return i
  }
  return -1
}

function nextBreakOrDelim(text: string, from: number, delim: string): number {
  let i = from
  while (i < text.length && text[i] !== delim && text[i] !== '\n' && text[i] !== '\r') i++
  return i
}

function countBreaks(text: string, from: number, to: number): number {
  let n = 0
  for (let i = from; i < to; i++) if (text[i] === '\n') n++
  return n
}

const isEnd = (ch: string | undefined, delim: string) =>
  ch === undefined || ch === delim || ch === '\n' || ch === '\r'

/**
 * RFC 4180 records, tolerant of bad input. A leading BOM is dropped. A
 * quoted field may hold delimiters, `""` and line breaks. An unclosed quote
 * is read as literal text up to the next delimiter or line end. Text after a
 * closing quote is kept. Blank lines add no record. Records end at CRLF, LF or CR.
 *
 * @experimental
 */
export function parseDelimited(
  text: string,
  delimiter: string,
): { records: DelimitedRecord[]; issues: DelimitedIssue[] } {
  const records: DelimitedRecord[] = []
  const issues: DelimitedIssue[] = []
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  let line = 1
  const len = text.length
  while (i < len) {
    const fields: string[] = []
    const start = line
    let issue: string | undefined
    const report = (message: string) => {
      issues.push({ line, message })
      issue ??= message
    }
    for (;;) {
      let field: string
      if (text[i] === '"') {
        let close = findClosingQuote(text, i + 1)
        // A quote that closes on a later line and is not followed by a
        // delimiter or a line end was never closed where it opened.
        if (close >= 0 && countBreaks(text, i, close) > 0 && !isEnd(text[close + 1], delimiter)) {
          close = -1
        }
        if (close < 0) {
          report('Unclosed quote; read as text')
          const end = nextBreakOrDelim(text, i, delimiter)
          field = text.slice(i, end)
          i = end
        } else {
          line += countBreaks(text, i + 1, close)
          field = text.slice(i + 1, close).replace(/""/g, '"')
          i = close + 1
          if (!isEnd(text[i], delimiter)) {
            const end = nextBreakOrDelim(text, i, delimiter)
            report('Text after a closing quote; kept as written')
            field += text.slice(i, end)
            i = end
          }
        }
      } else {
        const end = nextBreakOrDelim(text, i, delimiter)
        field = text.slice(i, end)
        i = end
      }
      fields.push(field)
      if (text[i] === delimiter) {
        i++
        continue
      }
      break
    }
    if (text[i] === '\r') i++
    if (text[i] === '\n') i++
    line++
    if (fields.length === 1 && fields[0] === '') continue
    const record: DelimitedRecord = { fields, line: start }
    if (issue !== undefined) record.issue = issue
    records.push(record)
  }
  return { records, issues }
}

const NUMBER = /^[-+]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/

/**
 * The first record is a header when its cells are non-empty, unique and not
 * numbers. A file of one such record is a header with no rows.
 *
 * @experimental
 */
export function looksLikeHeader(first: readonly string[] | undefined): boolean {
  if (!first || first.length === 0) return false
  const cells = first.map((s) => s.trim())
  if (cells.some((s) => s === '') || new Set(cells).size !== cells.length) return false
  return !cells.some((s) => NUMBER.test(s))
}

/**
 * Options for {@link readDelimited}.
 *
 * @experimental
 */
export interface ReadDelimitedOptions {
  /** The delimiter to use; skips sniffing. */
  delimiter?: Delimiter
  /** Whether the first record is a header; skips header detection. */
  header?: boolean
}

/**
 * Read a delimited file: sniff the delimiter, detect a header, parse
 * tolerantly. A row whose field count differs from the header's (or, with no
 * header, the widest row's) is reported as an issue on its line and kept as
 * written: short rows are not padded, long rows keep their extra fields.
 *
 * @experimental
 */
export function readDelimited(text: string, options: ReadDelimitedOptions = {}): DelimitedRead {
  const delimiter = options.delimiter ?? sniffDelimiter(text)
  const { records, issues } = parseDelimited(text, delimiter)
  const header = (options.header ?? looksLikeHeader(records[0]?.fields)) && records.length > 0
  const headerCells = header ? records[0]!.fields : null
  const rows = header ? records.slice(1) : records
  let width = headerCells?.length ?? 0
  for (const r of rows) if (r.fields.length > width) width = r.fields.length
  const expected = headerCells?.length ?? width
  let added = false
  for (const r of rows) {
    if (r.issue !== undefined || r.fields.length === expected) continue
    r.issue = `${r.fields.length} fields, ${headerCells ? 'header has' : 'widest row has'} ${expected}`
    issues.push({ line: r.line, message: r.issue })
    added = true
  }
  if (added) issues.sort((a, b) => a.line - b.line)
  return { delimiter, header: headerCells, rows, width, issues }
}
