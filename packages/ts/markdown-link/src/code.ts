/**
 * Code, and blanking it so a lexer never harvests out of it. A port of the
 * `markdown-link` crate's `code` module; that module's doc states the rules
 * in full.
 *
 * In short, code is fenced code, indented code, inline code spans, math
 * (`$$…$$` in its block and `$…$` on one line), raw HTML blocks (`<pre>`, `<script>`, `<style>`,
 * `<textarea>`) and autolinks. An HTML comment is not code, but a backtick,
 * `$` or fence inside one opens nothing. `'commonmark'` (the default)
 * follows CommonMark for fences and spans, and `'skill-export'` keeps the
 * looser rules of `skill-export`'s renderer. The lexer reads one line at a
 * time, following list items far enough to know where their text starts. It
 * does not know about block quotes.
 *
 * Every marker is ASCII, so a scan over UTF-16 code units never splits a
 * character.
 */

import type { TextRange } from './parse.ts'

/** Which rules the lexer follows. */
export type CodeRules = 'commonmark' | 'skill-export'

const NEWLINE = 10
const CR = 13
const TAB = 9
const SPACE = 32
const BACKTICK = 96
const TILDE = 126
const DOLLAR = 36
const LESS = 60
const GREATER = 62

interface FenceRun {
  char: number
  length: number
  /** The index just past the run. */
  end: number
}

interface Fence {
  char: number
  length: number
}

/**
 * `^ {0,3}(`{3,}|~{3,})` on the line `s[start, end)`: the marker's shape only.
 */
function fenceRun(s: string, start: number, end: number): FenceRun | null {
  const at = start + leadingSpaces(s, start, end, 3)
  if (at >= end) return null
  const char = s.charCodeAt(at)
  if (char !== BACKTICK && char !== TILDE) return null
  let runEnd = at
  while (runEnd < end && s.charCodeAt(runEnd) === char) runEnd++
  const length = runEnd - at
  return length >= 3 ? { char, length, end: runEnd } : null
}

function opensFence(s: string, start: number, end: number, rules: CodeRules): Fence | null {
  const run = fenceRun(s, start, end)
  if (run === null) return null
  const backtickInInfo = run.char === BACKTICK && s.slice(run.end, end).includes('`')
  if (rules === 'commonmark' && backtickInInfo) return null
  return { char: run.char, length: run.length }
}

function closesFence(
  s: string,
  start: number,
  end: number,
  open: Fence,
  rules: CodeRules,
): boolean {
  const run = fenceRun(s, start, end)
  if (run === null) return false
  return (
    run.char === open.char &&
    run.length >= open.length &&
    (rules === 'skill-export' || isBlank(s, run.end, end))
  )
}

/** Where a line sits relative to fenced code. */
type FenceLine = 'marker' | 'inside' | 'outside'

/** The fence state of a line-by-line scan: which fence, if any, is open. */
class Fences {
  private open: Fence | null = null
  private readonly rules: CodeRules

  constructor(rules: CodeRules) {
    this.rules = rules
  }

  isOpen(): boolean {
    return this.open !== null
  }

  /** Ends the open fence, if any. */
  reset(): void {
    this.open = null
  }

  /** Classify the line `s[start, end)` and step past it. */
  line(s: string, start: number, end: number): FenceLine {
    if (this.open === null) {
      this.open = opensFence(s, start, end, this.rules)
      return this.open === null ? 'outside' : 'marker'
    }
    if (closesFence(s, start, end, this.open, this.rules)) {
      this.open = null
      return 'marker'
    }
    if (this.rules === 'skill-export' && fenceRun(s, start, end) !== null) return 'marker'
    return 'inside'
  }
}

/**
 * The backtick runs in `start..end`, the rest of a block from where a search
 * found no close.
 */
class BlockRuns {
  /**
   * `[length, start]` for each run length that occurs, sorted by length:
   * where the last run that would close a span of that length starts.
   */
  private readonly lastClose: [number, number][]
  readonly start: number
  readonly end: number
  private readonly rules: CodeRules

  constructor(s: string, start: number, end: number, rules: CodeRules) {
    this.start = start
    this.end = end
    this.rules = rules
    const last = new Map<number, number>()
    let at = start
    while (at < end) {
      if (s.charCodeAt(at) !== BACKTICK) {
        at++
        continue
      }
      const run = runLength(s, at, end)
      last.set(run, at)
      at += run
    }
    this.lastClose = [...last].sort((a, b) => a[0] - b[0])
    if (rules === 'skill-export') {
      // A longer run closes a shorter span too.
      for (let i = this.lastClose.length - 2; i >= 0; i--) {
        const entry = this.lastClose[i]!
        entry[1] = Math.max(entry[1], this.lastClose[i + 1]![1])
      }
    }
  }

  /** Whether a run at or after `from` closes a span opened by `length` backticks. */
  hasClose(length: number, from: number): boolean {
    let lo = 0
    let hi = this.lastClose.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.lastClose[mid]![0] < length) lo = mid + 1
      else hi = mid
    }
    const entry = this.lastClose[lo]
    if (entry === undefined) return false
    return entry[1] >= from && (entry[0] === length || this.rules === 'skill-export')
  }
}

/**
 * Finds where inline code spans close, for a scan that reads its input once,
 * left to right. Call `line` at each line start the scan reaches outside a
 * fence, and `close` at each backtick run it reaches. A whole pass is linear
 * in the size of its input.
 */
class Spans {
  /** Whether the current line is one a span cannot leave. */
  private oneLine = false
  private noClose: BlockRuns | null = null
  private readonly rules: CodeRules
  private readonly s: string

  constructor(rules: CodeRules, s: string) {
    this.rules = rules
    this.s = s
  }

  /**
   * Note the line `s[start, end)` the scan has reached. Under `'commonmark'`,
   * a span opened on an ATX heading or a line starting with `|` stays on that
   * line.
   */
  line(start: number, end: number): void {
    this.oneLine = this.rules === 'commonmark' && isOneLineBlock(this.s, start, end)
  }

  /**
   * The backtick run that starts at `start`: its length, and where the span it
   * opens closes (the start of the closing run), or `null` if it does not.
   */
  close(start: number, ends: LineTest = () => false): [number, number | null] {
    const length = runLength(this.s, start, this.s.length)
    const from = start + length
    const runs = this.noClose
    if (runs !== null && runs.start <= from && from < runs.end && !runs.hasClose(length, from)) {
      return [length, null]
    }
    const s = this.s
    const found = this.inBlock(from, ends, (start) => {
      let at = start
      while (at < s.length && s.charCodeAt(at) !== NEWLINE) {
        if (s.charCodeAt(at) !== BACKTICK) {
          at++
          continue
        }
        const run = runLength(s, at, s.length)
        if (closes(run, length, this.rules)) return { found: at }
        at += run
      }
      return { lineEnd: at }
    })
    if ('found' in found) return [length, found.found]
    this.noClose = new BlockRuns(this.s, from, found.blockEnd, this.rules)
    return [length, null]
  }

  /**
   * Calls `find(at)` on the rest of the current line from `from`, then on
   * each later line of the block a span opened there may reach, until it
   * finds something. `find` returns what it found, or the end of the line
   * when it found nothing. A line that `ends` accepts ends the block too.
   */
  inBlock(
    from: number,
    ends: LineTest,
    find: (at: number) => { found: number } | { lineEnd: number },
  ): { found: number } | { blockEnd: number } {
    const s = this.s
    let at = from
    for (;;) {
      const result = find(at)
      if ('found' in result) return result
      const next = result.lineEnd + 1
      if (this.oneLine || next >= s.length) return { blockEnd: Math.min(next, s.length) }
      const end = lineEnd(s, next)
      if (endsSpanBlock(s, next, end, this.rules) || ends(next, end)) return { blockEnd: next }
      at = next
    }
  }
}

/** A test on the line `s[start, end)` of the text being scanned. */
type LineTest = (start: number, end: number) => boolean

function closes(run: number, length: number, rules: CodeRules): boolean {
  return rules === 'commonmark' ? run === length : run >= length
}

function runLength(s: string, at: number, end: number): number {
  let i = at
  while (i < end && s.charCodeAt(i) === BACKTICK) i++
  return i - at
}

/** Whether the line `s[start, end)` starts a block that a span cannot reach into. */
function endsSpanBlock(s: string, start: number, end: number, rules: CodeRules): boolean {
  const stop = end > start && s.charCodeAt(end - 1) === CR ? end - 1 : end
  if (isBlank(s, start, stop)) return true
  if (rules === 'skill-export') return fenceRun(s, start, stop) !== null
  return opensFence(s, start, stop, rules) !== null || startsBlock(s, start, stop)
}

/** An ATX heading or a line starting with `|`: a block that is one line long. */
function isOneLineBlock(s: string, start: number, end: number): boolean {
  const at = start + leadingSpaces(s, start, end, 3)
  return atxHeading(s, at, end) || (at < end && s[at] === '|')
}

/** `#{1,6}` then a space, a tab or the end of the line, from `at`. */
function atxHeading(s: string, at: number, end: number): boolean {
  let i = at
  while (i < end && s[i] === '#') i++
  const hashes = i - at
  if (hashes < 1 || hashes > 6) return false
  if (i >= end) return true
  const after = s.charCodeAt(i)
  return after === SPACE || after === TAB || after === CR
}

/**
 * An ATX heading, a line starting with `|`, a setext underline, a thematic
 * break, a block quote or a list item.
 */
function startsBlock(s: string, start: number, end: number): boolean {
  const indented = start + leadingSpaces(s, start, end, 3)
  let rest = start
  while (rest < end && (s.charCodeAt(rest) === SPACE || s.charCodeAt(rest) === TAB)) rest++
  let equals = indented
  while (equals < end && s[equals] === '=') equals++
  const setext = equals > indented && isBlank(s, equals, end)
  const quote = rest < end && s[rest] === '>'
  return (
    isOneLineBlock(s, start, end) ||
    setext ||
    quote ||
    listMarker(s, rest, end) !== null ||
    thematicBreak(s, indented, end)
  )
}

/** Three or more of one of `-`, `*` or `_`, with only spaces or tabs between. */
function thematicBreak(s: string, start: number, end: number): boolean {
  if (start >= end) return false
  const mark = s[start]!
  if (mark !== '-' && mark !== '*' && mark !== '_') return false
  let count = 0
  for (let i = start; i < end; i++) {
    const c = s[i]
    if (c === mark) count++
    else if (c !== ' ' && c !== '\t') return false
  }
  return count >= 3
}

function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57
}

function leadingSpaces(s: string, start: number, end: number, max: number): number {
  let n = 0
  while (n < max && start + n < end && s.charCodeAt(start + n) === SPACE) n++
  return n
}

function isBlank(s: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const c = s.charCodeAt(i)
    if (c !== SPACE && c !== TAB && c !== CR) return false
  }
  return true
}

/** The index of the `\n` ending the line that holds `from`, or the end of input. */
function lineEnd(s: string, from: number): number {
  const at = s.indexOf('\n', from)
  return at === -1 ? s.length : at
}

/**
 * Blank out code so links and tags inside it are not harvested.
 * `stripCodeWith` under `'commonmark'`.
 */
export function stripCode(text: string): string {
  return stripCodeWith(text, 'commonmark')
}

/**
 * Blank out the code under `rules`: each of `codeRanges`.
 *
 * Every character of code, fence marker lines included, becomes a space, and
 * every `\n` stays. The output has the same number of **code points** as the
 * input, as the Rust crate keeps the same number of `char`s. It is not the
 * same UTF-16 length: a character outside the Basic Multilingual Plane in code
 * becomes one space, not two.
 */
export function stripCodeWith(text: string, rules: CodeRules): string {
  return blank(text, codeRanges(text, rules))
}

/**
 * The ranges of `text` that are code under `rules`, as the module doc
 * describes: what `stripCodeWith` blanks. UTF-16 offsets, where the Rust
 * crate's `code_ranges` returns byte offsets.
 *
 * The ranges are in order and do not overlap. Each holds its delimiters: a
 * span's backticks, a fence's marker lines, an autolink's `<` and `>`. Two
 * ranges that touch, or that only a line break separates, are one, so a fence
 * or a run of indented code lines is one range. HTML comments are in none.
 */
export function codeRanges(text: string, rules: CodeRules): TextRange[] {
  return regions(text, rules)
    .filter((region) => region.kind === 'code')
    .map(({ start, end }) => ({ start, end }))
}

/** A range of `regions`: code, or an HTML comment (`<!--` to `-->` or the end). */
export interface Region extends TextRange {
  kind: 'code' | 'comment'
}

/**
 * The code and the HTML comments in `text`, in order, from one left-to-right
 * pass. Ranges of the same kind that touch, or that only a line break
 * separates, are merged.
 */
export function regions(text: string, rules: CodeRules): Region[] {
  const out: Region[] = []
  const push = (start: number, end: number, kind: Region['kind']): void => {
    const last = out[out.length - 1]
    if (
      last !== undefined &&
      last.kind === kind &&
      (last.end === start || (last.end + 1 === start && text.charCodeAt(last.end) === NEWLINE))
    ) {
      last.end = end
    } else if (end > start) {
      out.push({ start, end, kind })
    }
  }
  const blocks = new Blocks(rules)
  const spans = new Spans(rules, text)
  const math = new MathClose()
  let offset = 0
  while (offset < text.length) {
    if (offset === 0 || text.charCodeAt(offset - 1) === NEWLINE) {
      const end = lineEnd(text, offset)
      if (blocks.codeLine(text, offset, end)) {
        push(offset, end, 'code')
        offset = end + 1
        continue
      }
      spans.line(offset, end)
    }
    const start = offset
    const c = text.charCodeAt(offset)
    if (c === BACKTICK) {
      const [run, close] = spans.close(offset, (from, to) => blocks.opensCode(text, from, to))
      if (close === null) {
        offset += run
        continue
      }
      offset = close + run
      push(start, offset, 'code')
    } else if (c === DOLLAR && !escaped(text, offset)) {
      const found = mathEnd(text, offset, spans, blocks, math)
      if ('skip' in found) {
        offset += found.skip
        continue
      }
      offset = found.end
      push(start, offset, 'code')
    } else if (c === LESS && text.startsWith('<!--', offset)) {
      const close = text.indexOf('-->', offset + 4)
      offset = close === -1 ? text.length : close + 3
      push(start, offset, 'comment')
    } else if (c === LESS) {
      const end = autolinkEnd(text, offset)
      if (end === null) {
        offset++
        continue
      }
      offset = end
      push(start, offset, 'code')
    } else {
      offset++
    }
  }
  return out
}

/**
 * `text` with every character in `ranges` but `\n` made a space. `ranges`
 * are in order and do not overlap. The code point count does not change.
 */
export function blank(text: string, ranges: Iterable<TextRange>): string {
  const out: string[] = []
  let writtenUpTo = 0
  for (const { start, end } of ranges) {
    out.push(text.slice(writtenUpTo, start))
    for (const c of text.slice(start, end)) out.push(c === '\n' ? '\n' : ' ')
    writtenUpTo = end
  }
  out.push(text.slice(writtenUpTo))
  return out.join('')
}

/**
 * The block state of a line-by-line scan: the open fence or raw HTML block,
 * the list items the scan is in, and whether the line before was paragraph
 * text.
 */
class Blocks {
  private readonly rules: CodeRules
  private readonly fences: Fences
  /**
   * Where the text of the list item that the open fence or raw HTML block is
   * in starts. A fence's lines are read from there.
   */
  private base = 0
  /** Whether a `<pre>`, `<script>`, `<style>` or `<textarea>` block is open. */
  private rawHtml = false
  /** The column where each open list item's text starts, innermost last. */
  private items: number[] = []
  /**
   * Whether the line before was paragraph text, which a line indented four
   * or more columns continues rather than starting indented code.
   */
  private paragraph = false

  constructor(rules: CodeRules) {
    this.rules = rules
    this.fences = new Fences(rules)
  }

  /**
   * Whether the line `s[start, end)` is code from end to end: a line of a
   * fence, of indented code or of a raw HTML block. Steps past it.
   */
  codeLine(s: string, start: number, lineEndAt: number): boolean {
    const end = lineEndAt > start && s.charCodeAt(lineEndAt - 1) === CR ? lineEndAt - 1 : lineEndAt
    const [column, rest] = indent(s, start, end, 0)
    if ((this.rawHtml || this.fences.isOpen()) && (column >= this.base || isBlank(s, rest, end))) {
      if (this.rawHtml) this.rawHtml = !closesRawHtml(s, start, end)
      else if (column <= this.base + 3) this.fences.line(s, rest, end)
      return true
    }
    // A line indented less than the text of the list item a fence or raw
    // HTML block is in ends the item, and the block with it.
    this.rawHtml = false
    this.fences.reset()
    if (isBlank(s, rest, end)) {
      this.paragraph = false
      return false
    }
    const base = this.baseAt(column)
    const relative = column - base
    if (this.paragraph && (relative >= 4 || !this.interrupts(s, rest, end))) {
      // A lazy or indented continuation line: the paragraph and the list
      // items it is in go on.
      return false
    }
    this.items = this.items.filter((item) => item <= column)
    if (relative >= 4) return true
    if (this.fences.line(s, rest, end) === 'marker') {
      this.base = base
      this.paragraph = false
      return true
    }
    if (opensRawHtml(s, rest, end)) {
      this.base = base
      this.rawHtml = !closesRawHtml(s, start, end)
      this.paragraph = false
      return true
    }
    const marker = listMarker(s, rest, end)
    if (
      thematicBreak(s, rest, end) ||
      atxHeading(s, rest, end) ||
      isSetext(s, rest, end, this.paragraph) ||
      s.startsWith('<!--', rest)
    ) {
      this.paragraph = false
    } else if (marker !== null) {
      const markerEnd = column + marker.length
      const [spacesEnd, textAt] = indent(s, rest + marker.length, end, markerEnd)
      this.items.push(textAt === end || spacesEnd - markerEnd > 4 ? markerEnd + 1 : spacesEnd)
      this.paragraph = marker.text
    } else {
      this.paragraph = true
    }
    return false
  }

  /**
   * Where the text of the innermost open list item that a line starting at
   * `column` is in starts, or 0.
   */
  private baseAt(column: number): number {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i]! <= column) return this.items[i]!
    }
    return 0
  }

  /**
   * Whether the line `s[start, end)`, read as the next line of a paragraph,
   * opens a fence or a raw HTML block: where an inline span or math must stop.
   */
  opensCode(s: string, start: number, lineEndAt: number): boolean {
    const end = lineEndAt > start && s.charCodeAt(lineEndAt - 1) === CR ? lineEndAt - 1 : lineEndAt
    const [column, rest] = indent(s, start, end, 0)
    return (
      column - this.baseAt(column) <= 3 &&
      (opensFence(s, rest, end, this.rules) !== null || opensRawHtml(s, rest, end))
    )
  }

  /**
   * Whether the line from `at`, its first character that is not a space or
   * tab, to `end` starts a block that ends a paragraph. A list item does
   * when it has text and is a bullet or starts at 1.
   */
  private interrupts(s: string, at: number, end: number): boolean {
    const marker = listMarker(s, at, end)
    return (
      opensFence(s, at, end, this.rules) !== null ||
      opensRawHtml(s, at, end) ||
      s.startsWith('<!--', at) ||
      thematicBreak(s, at, end) ||
      atxHeading(s, at, end) ||
      isSetext(s, at, end, true) ||
      s[at] === '>' ||
      (marker !== null &&
        marker.text &&
        (marker.length === 1 || s.slice(at, at + marker.length - 1) === '1'))
    )
  }
}

/**
 * The column of the first character from `at` that is not a space or tab,
 * and its index, when `at` is at `column`. A tab moves to the next multiple
 * of four columns.
 */
function indent(s: string, at: number, end: number, column: number): [number, number] {
  let i = at
  let col = column
  while (i < end) {
    const c = s.charCodeAt(i)
    if (c === SPACE) col++
    else if (c === TAB) col += 4 - (col % 4)
    else break
    i++
  }
  return [col, i]
}

/**
 * A list item marker at `at`, `-`, `*`, `+`, or one to nine digits and `.`
 * or `)`, followed by a space, a tab or the end of the line: the marker's
 * length, and whether text follows it.
 */
function listMarker(s: string, at: number, end: number): { length: number; text: boolean } | null {
  let digitsEnd = at
  while (digitsEnd < end && isAsciiDigit(s.charCodeAt(digitsEnd))) digitsEnd++
  const digits = digitsEnd - at
  let length: number
  if (at < end && '-*+'.includes(s[at]!)) length = 1
  else if (
    digits >= 1 &&
    digits <= 9 &&
    (s[digitsEnd] === '.' || s[digitsEnd] === ')') &&
    digitsEnd < end
  )
    length = digits + 1
  else return null
  const after = at + length
  if (after >= end || s.charCodeAt(after) === CR) return { length, text: false }
  const c = s.charCodeAt(after)
  if (c !== SPACE && c !== TAB) return null
  return { length, text: !isBlank(s, after, end) }
}

/** A line of only `=`, or of only `-` after a paragraph, then whitespace. */
function isSetext(s: string, at: number, end: number, afterParagraph: boolean): boolean {
  if (at >= end) return false
  const mark = s[at]
  if (mark !== '=' && mark !== '-') return false
  let i = at
  while (i < end && s[i] === mark) i++
  return afterParagraph && isBlank(s, i, end)
}

/** The tags whose HTML block holds text as written. */
const RAW_HTML_TAGS = ['pre', 'script', 'style', 'textarea']

/**
 * `<pre`, `<script`, `<style` or `<textarea`, any case, then a space, a tab,
 * `>` or the end of the line, at `at`.
 */
function opensRawHtml(s: string, at: number, end: number): boolean {
  if (s[at] !== '<') return false
  return RAW_HTML_TAGS.some((tag) => {
    const after = at + 1 + tag.length
    if (after > end || s.slice(at + 1, after).toLowerCase() !== tag) return false
    if (after === end) return true
    const c = s[after]
    return c === ' ' || c === '\t' || c === '>' || c === '\r'
  })
}

/** Whether `s[start, end)` holds `</pre>`, `</script>`, `</style>` or `</textarea>`, in any case. */
function closesRawHtml(s: string, start: number, end: number): boolean {
  const line = s.slice(start, end).toLowerCase()
  return RAW_HTML_TAGS.some((tag) => line.includes(`</${tag}>`))
}

/** Whether the character at `at` is escaped: an odd number of `\` comes right before it. */
function escaped(s: string, at: number): boolean {
  let i = at
  while (i > 0 && s[i - 1] === '\\') i--
  return (at - i) % 2 === 1
}

/**
 * The math that the `$` at `at` opens: the index just past its close, or how
 * many `$` to step past as text. `$$` closes at the next `$$` in the block a
 * span opened there would stay in.
 */
function mathEnd(
  s: string,
  at: number,
  spans: Spans,
  blocks: Blocks,
  inline: MathClose,
): { end: number } | { skip: number } {
  if (s[at + 1] === '$') {
    const found = spans.inBlock(
      at + 2,
      (from, to) => blocks.opensCode(s, from, to),
      (from) => {
        let i = from
        while (i < s.length && s.charCodeAt(i) !== NEWLINE) {
          if (s.startsWith('$$', i)) return { found: i }
          i++
        }
        return { lineEnd: i }
      },
    )
    return 'found' in found ? { end: found.found + 2 } : { skip: 2 }
  }
  const next = s.charCodeAt(at + 1)
  if (Number.isNaN(next) || next === SPACE || next === TAB || next === CR || next === NEWLINE) {
    return { skip: 1 }
  }
  const close = inline.find(s, at + 1)
  return close === null ? { skip: 1 } : { end: close + 1 }
}

/**
 * Finds the `$` that closes inline math, for a scan that asks at positions
 * that only move forward. A `$` closes math whatever opened it, and the scan
 * steps past each close it is given, so only a search that found nothing is
 * worth keeping: no later search on its line finds anything either.
 */
class MathClose {
  /** The end of the line on which a search found no close, or -1. */
  private noneUntil = -1

  find(s: string, from: number): number | null {
    if (from <= this.noneUntil) return null
    let at = from
    while (at < s.length && s.charCodeAt(at) !== NEWLINE) {
      const before = s[at - 1]
      if (
        s[at] === '$' &&
        before !== ' ' &&
        before !== '\t' &&
        !escaped(s, at) &&
        !isAsciiDigit(s.charCodeAt(at + 1))
      ) {
        return at
      }
      at++
    }
    this.noneUntil = at
    return null
  }
}

/**
 * The index just past the autolink `<scheme:…>` that starts at `at`, if one
 * does. A scheme is a letter, then 1 to 31 letters, digits, `+`, `.` or `-`.
 * The rest holds no space, control character, `<` or `>`.
 */
function autolinkEnd(s: string, at: number): number | null {
  if (!/^[A-Za-z]$/.test(s[at + 1] ?? '')) return null
  let i = at + 1
  while (i < s.length && /^[A-Za-z0-9+.-]$/.test(s[i]!)) i++
  const scheme = i - at - 1
  if (scheme < 2 || scheme > 32 || s[i] !== ':') return null
  for (i++; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === GREATER) return i + 1
    if (c === LESS || c <= SPACE || c === 0x7f) return null
  }
  return null
}
