/**
 * The text mapping between a table cell's source and its plain text. The
 * text shows an escaped pipe `\|` as `|`; every other byte maps one to one.
 * A pipe in the cell text therefore always follows an even run of
 * backslashes, or its source escape would itself be escaped and split the
 * cell.
 */

/** A cell's source as plain text. */
export interface CellText {
  /** The cell's text, with `\|` read as `|`. */
  text: string
  /**
   * Source offset of each text index, plus one entry for the end:
   * `offsets[text.length]` is the source length.
   */
  offsets: number[]
}

/**
 * Read a cell's source slice. A backslash escapes the next character, as in
 * the GFM row splitter, so `\|` reads as `|` and `\\` stays two characters.
 * Only the pipe escape is table-level; other escapes are inline markdown and
 * stay in the text.
 */
export function cellTextFromSource(source: string): CellText {
  let text = ''
  const offsets: number[] = []
  let escaped = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!
    offsets.push(i)
    if (ch === '\\' && !escaped && source[i + 1] === '|') {
      text += '|'
      i++
      continue
    }
    text += ch
    escaped = !escaped && ch === '\\'
  }
  offsets.push(source.length)
  return { text, offsets }
}

/** Source bytes for text typed into a cell: pipes escaped, line breaks as spaces. */
export function escapeCellInsert(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ').replace(/\|/g, '\\|')
}

/** One change from {@link literalPipeFixes}: replace `from`..`to` with `insert`. */
export interface PipeFix {
  from: number
  to: number
  insert: string
}

/**
 * Changes, in `text` coordinates and sorted, that keep every pipe in `text`
 * a literal pipe: each pipe must follow an even run of backslashes. A pipe
 * after an odd run gets one more backslash when an edit inserted into that
 * run or the pipe (`inserted`, ranges in `text`), and loses one otherwise
 * (a deleted backslash takes its pair with it).
 */
export function literalPipeFixes(
  text: string,
  inserted: readonly { from: number; to: number }[],
): PipeFix[] {
  const fixes: PipeFix[] = []
  let run = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '|' && run % 2 === 1) {
      const start = i - run
      const typed = inserted.some((range) => range.from <= i && range.to > start)
      fixes.push(typed ? { from: i, to: i, insert: '\\' } : { from: i - 1, to: i, insert: '' })
    }
    run = ch === '\\' ? run + 1 : 0
  }
  return fixes
}

/** Tabs and line breaks as spaces, trimmed. */
function flatCell(text: string): string {
  return text.replace(/\r\n|[\t\r\n]/g, ' ').trim()
}

/**
 * Source bytes for a whole cell written at once: trimmed, tabs and line
 * breaks as spaces, every pipe literal. A pipe after an odd run of
 * backslashes gets one more first, as when typed.
 */
export function escapeCell(text: string): string {
  const flat = flatCell(text)
  let fixed = ''
  let at = 0
  for (const fix of literalPipeFixes(flat, [{ from: 0, to: flat.length }])) {
    fixed += flat.slice(at, fix.from) + fix.insert
    at = fix.to
  }
  return escapeCellInsert(fixed + flat.slice(at))
}

/**
 * Source bytes for a cell shown inside a backtick code span. A code span has
 * no backslash escapes, and the table only turns `\|` into `|`, so only
 * pipes are escaped and backslashes stay as they are. A pipe after an odd run
 * of backslashes is already escaped by that run; it shows without its last
 * backslash, since no source shows `\|` in a code span.
 */
export function escapeCodeCell(text: string): string {
  const flat = flatCell(text)
  let out = ''
  let run = 0
  for (const ch of flat) {
    out += ch === '|' && run % 2 === 0 ? '\\|' : ch
    run = ch === '\\' ? run + 1 : 0
  }
  return out
}

/**
 * True when `source` ends in an odd run of backslashes. Written directly
 * before a cell's closing pipe, that run would escape the pipe and merge the
 * cell with the next one, so writers put a pad space between them.
 */
export function endsWithEscape(source: string): boolean {
  let run = 0
  for (let i = source.length - 1; i >= 0 && source[i] === '\\'; i--) run++
  return run % 2 === 1
}

/** Source offset (relative to the cell text start) of a text position. */
export function sourceOffset(cell: CellText, pos: number): number {
  return cell.offsets[Math.max(0, Math.min(pos, cell.offsets.length - 1))]!
}

/** Text position of a source offset; inside an escape it rounds down. */
export function textOffset(cell: CellText, offset: number): number {
  let pos = 0
  for (let i = 0; i < cell.offsets.length; i++) {
    if (cell.offsets[i]! <= offset) pos = i
  }
  return pos
}
