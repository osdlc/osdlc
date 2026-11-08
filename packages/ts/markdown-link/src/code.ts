/**
 * Code fences and inline code spans: finding them, and blanking them so a
 * lexer never harvests out of them. A port of the `markdown-link` crate's
 * `code` module; that module's doc states every rule set in full.
 *
 * In short, `'commonmark'` (the default) follows CommonMark, `'skill-export'`
 * keeps the looser rules of `skill-export`'s renderer, and `'none'` finds no
 * code, for a caller that has already parsed it. Under `'commonmark'` a fence
 * is found inside a list item or a block quote, and a code span stays inside
 * its cell of a table row, a line starting with `|`. `'skill-export'` reads
 * one line at a time and knows no containers. Indented code blocks are not
 * code.
 *
 * Every marker is ASCII, so a scan over UTF-16 code units never splits a
 * character.
 */

/** Which rules the lexer follows. */
export type CodeRules = 'commonmark' | 'skill-export' | 'none'

const NEWLINE = 10
const CR = 13
const TAB = 9
const SPACE = 32
const BACKTICK = 96
const BACKSLASH = 92
const TILDE = 126
const GT = 62
const PIPE = 124
const DASH = 45
const STAR = 42
const PLUS = 43

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
  if (rules === 'none') return null
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

/** A block that can hold a fence: a block quote, or a list item and the column its content starts at. */
type Container = { quote: true } | { quote: false; content: number }

/** A fence that is open, and how many containers it is inside. */
interface OpenFence extends Fence {
  depth: number
}

/**
 * The fence state of a line-by-line scan: which fence, if any, is open, and
 * under `'commonmark'` the block quotes and list items around it.
 */
class Fences {
  private open: OpenFence | null = null
  private containers: Container[] = []
  private readonly cursor = new Cursor()
  /** Where the outermost block quote in `containers` is. */
  private firstQuote = -1
  /** Where the text of the last line starts, past the markers of its containers. */
  contentStart = 0
  private readonly rules: CodeRules

  constructor(rules: CodeRules) {
    this.rules = rules
  }

  /** Classify the line `s[start, end)` and step past it. */
  line(s: string, start: number, end: number): FenceLine {
    this.contentStart = start
    if (this.rules === 'none') return 'outside'
    if (this.rules === 'skill-export') return this.lineFlat(s, start, end)
    return this.lineInContainers(s, start, end)
  }

  /** One line at a time, knowing no containers. */
  private lineFlat(s: string, start: number, end: number): FenceLine {
    if (this.open === null) {
      const fence = opensFence(s, start, end, this.rules)
      this.open = fence === null ? null : { ...fence, depth: 0 }
      return this.open === null ? 'outside' : 'marker'
    }
    if (closesFence(s, start, end, this.open, this.rules)) {
      this.open = null
      return 'marker'
    }
    return fenceRun(s, start, end) !== null ? 'marker' : 'inside'
  }

  private truncate(depth: number): void {
    this.containers.length = Math.min(this.containers.length, depth)
    if (this.firstQuote >= depth) this.firstQuote = -1
  }

  private push(container: Container): void {
    if (container.quote && this.firstQuote === -1) this.firstQuote = this.containers.length
    this.containers.push(container)
  }

  /**
   * CommonMark's containers, as far as a fence needs them. The blocks that
   * continue on this line are matched first, then a new block quote or list
   * item may start, then the rest of the line may open a fence. A pass costs
   * the characters of the markers and indent it reads.
   */
  private lineInContainers(s: string, start: number, lineEnd: number): FenceLine {
    // The common line: outside every block, and starting with a character that
    // opens no container and no fence.
    if (
      this.open === null &&
      this.containers.length === 0 &&
      (start >= lineEnd || !opensBlock(s.charCodeAt(start)))
    ) {
      return 'outside'
    }
    const end = lineEnd > start && s.charCodeAt(lineEnd - 1) === CR ? lineEnd - 1 : lineEnd
    const blank = isBlank(s, start, end)
    const depth = this.containers.length
    const cursor = this.cursor.reset(s, start, end)
    let matched = 0
    if (blank) {
      // A blank line continues every list item and ends a block quote.
      matched = this.firstQuote === -1 ? depth : this.firstQuote
    } else {
      while (matched < depth) {
        const container = this.containers[matched]!
        if (container.quote) {
          if (!cursor.quote()) break
        } else if (cursor.textCol >= container.content) {
          cursor.base = container.content
        } else {
          break
        }
        matched++
      }
    }

    if (this.open !== null) {
      if (matched >= this.open.depth) {
        this.contentStart = cursor.contentStart()
        const closes =
          !blank &&
          cursor.indent() <= 3 &&
          closesFence(s, cursor.textPos, end, this.open, this.rules)
        if (closes) this.open = null
        return closes ? 'marker' : 'inside'
      }
      // The fence's container ended before this line.
      this.open = null
    }

    this.truncate(matched)
    if (!blank) {
      while (cursor.indent() <= 3) {
        if (cursor.quote()) {
          this.push({ quote: true })
          continue
        }
        const content = cursor.itemStart()
        if (content === null) break
        this.push({ quote: false, content })
      }
      if (cursor.indent() <= 3) {
        const fence = opensFence(s, cursor.textPos, end, this.rules)
        if (fence !== null) {
          this.open = { ...fence, depth: this.containers.length }
          this.contentStart = cursor.contentStart()
          return 'marker'
        }
      }
    }
    this.contentStart = cursor.contentStart()
    return 'outside'
  }
}

/**
 * Whether a line starting with the character `code` may open a container or a
 * fence: it is a space, a tab, `>`, `-`, `*`, `+`, a digit, a backtick or a
 * tilde.
 */
function opensBlock(code: number): boolean {
  return (
    code === SPACE ||
    code === TAB ||
    code === GT ||
    code === DASH ||
    code === STAR ||
    code === PLUS ||
    code === BACKTICK ||
    code === TILDE ||
    isAsciiDigit(code)
  )
}

/** The column after `code` at column `col`. A tab goes to the next multiple of four. */
function nextCol(code: number, col: number): number {
  return code === TAB ? col + 4 - (col % 4) : col + 1
}

/**
 * Where a line has been read to: `base` is the column that containers have
 * taken, and `textPos` and `textCol` are the first character that is not a
 * space or tab from there on, with its column.
 */
class Cursor {
  base = 0
  textPos = 0
  textCol = 0
  private s = ''
  private lineStart = 0
  private end = 0

  /** Start reading the line `s[lineStart, end)`. */
  reset(s: string, lineStart: number, end: number): this {
    this.s = s
    this.lineStart = lineStart
    this.end = end
    this.base = 0
    this.skipSpace(lineStart, 0)
    return this
  }

  /** Set the text position to the first character from `pos`, at column `col`, that is not a space or tab. */
  private skipSpace(pos: number, col: number): void {
    let p = pos
    let c = col
    for (; p < this.end; p++) {
      const code = this.s.charCodeAt(p)
      if (code !== SPACE && code !== TAB) break
      c = nextCol(code, c)
    }
    this.textPos = p
    this.textCol = c
  }

  /** Columns of indent between what containers took and the text. */
  indent(): number {
    return Math.max(0, this.textCol - this.base)
  }

  /**
   * Where the text starts for a caller that reads its first characters, or
   * four characters before it when it is indented four columns or more.
   */
  contentStart(): number {
    return this.indent() > 3 ? Math.max(this.lineStart, this.textPos - 4) : this.textPos
  }

  /** A `>` at the text is a block quote's marker: step past it and the space or tab after it. */
  quote(): boolean {
    if (this.indent() > 3 || this.textPos >= this.end || this.s.charCodeAt(this.textPos) !== GT) {
      return false
    }
    const pos = this.textPos + 1
    const col = this.textCol + 1
    // The marker takes one space or the first column of a tab after it.
    const next = pos < this.end ? this.s.charCodeAt(pos) : -1
    this.base = next === SPACE || next === TAB ? col + 1 : col
    this.skipSpace(pos, col)
    return true
  }

  /**
   * A list marker at the text starts a list item: step past it, and give the
   * column its content starts at, or `null` when there is no marker.
   */
  itemStart(): number | null {
    const { s, end } = this
    const at = this.textPos
    if (at >= end) return null
    const first = s.charCodeAt(at)
    let marker: number
    if (first === DASH || first === STAR || first === PLUS) {
      marker = 1
    } else if (isAsciiDigit(first)) {
      let digitsEnd = at
      while (digitsEnd < end && isAsciiDigit(s.charCodeAt(digitsEnd))) digitsEnd++
      const delimiter = digitsEnd < end ? s[digitsEnd] : ''
      if (digitsEnd - at > 9 || (delimiter !== '.' && delimiter !== ')')) return null
      marker = digitsEnd - at + 1
    } else {
      return null
    }
    const after = at + marker < end ? s.charCodeAt(at + marker) : -1
    if ((after !== -1 && after !== SPACE && after !== TAB) || thematicBreak(s, at, end)) return null
    const markerEnd = this.textCol + marker
    this.skipSpace(at + marker, markerEnd)
    // Nothing after the marker, or an indented code block: the content
    // starts one column past the marker.
    const content =
      this.textPos >= end || this.textCol - markerEnd >= 5 ? markerEnd + 1 : this.textCol
    this.base = content
    return content
  }
}

/**
 * What the line a span opened on lets it do: run on to later lines of its
 * block, stay on its line (an ATX heading), or stay in its cell of a table
 * row.
 */
type SpanBlock = 'paragraph' | 'heading' | 'row'

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
  /** What the current line lets a span do. */
  private block: SpanBlock = 'paragraph'
  private noClose: BlockRuns | null = null
  private readonly rules: CodeRules
  private readonly s: string

  constructor(rules: CodeRules, s: string) {
    this.rules = rules
    this.s = s
  }

  /**
   * Note the line `s[start, end)` the scan has reached; for a line in a list
   * item or a block quote, `start` is where the text past the markers
   * begins. Under `'commonmark'`, a span opened on an ATX heading stays on
   * that line, and one opened on a line starting with `|` stays in its cell:
   * it closes before the next `|` that is not escaped as `\|`, or not at all.
   */
  line(start: number, end: number): void {
    if (this.rules !== 'commonmark') {
      this.block = 'paragraph'
      return
    }
    const at = start + leadingSpaces(this.s, start, end, 3)
    if (atxHeading(this.s, at, end)) this.block = 'heading'
    else if (at < end && this.s[at] === '|') this.block = 'row'
    else this.block = 'paragraph'
  }

  /**
   * The backtick run that starts at `start`: its length, and where the span it
   * opens closes (the start of the closing run), or `null` if it does not.
   */
  close(start: number): [number, number | null] {
    const length = runLength(this.s, start, this.s.length)
    const from = start + length
    const runs = this.noClose
    if (runs !== null && runs.start <= from && from < runs.end && !runs.hasClose(length, from)) {
      return [length, null]
    }
    const found = this.search(length, from)
    if ('close' in found) return [length, found.close]
    this.noClose = new BlockRuns(this.s, from, found.blockEnd, this.rules)
    return [length, null]
  }

  /** The close, or the end of the block when there is none. */
  private search(length: number, from: number): { close: number } | { blockEnd: number } {
    const s = this.s
    const row = this.block === 'row'
    let at = from
    for (;;) {
      while (at < s.length && s.charCodeAt(at) !== NEWLINE) {
        if (row && s.charCodeAt(at) === PIPE && !escaped(s, at)) {
          return { blockEnd: at }
        }
        if (s.charCodeAt(at) !== BACKTICK) {
          at++
          continue
        }
        const run = runLength(s, at, s.length)
        if (closes(run, length, this.rules)) return { close: at }
        at += run
      }
      const next = at + 1
      if (this.block !== 'paragraph' || next >= s.length)
        return { blockEnd: Math.min(next, s.length) }
      if (endsSpanBlock(s, next, lineEnd(s, next), this.rules)) return { blockEnd: next }
      at = next
    }
  }
}

function closes(run: number, length: number, rules: CodeRules): boolean {
  if (rules === 'none') return false
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
  if (rules === 'none') return false
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
  const endsMarker = (at: number): boolean =>
    at >= end || s.charCodeAt(at) === SPACE || s.charCodeAt(at) === TAB

  let equals = indented
  while (equals < end && s[equals] === '=') equals++
  const setext = equals > indented && isBlank(s, equals, end)
  const quote = rest < end && s[rest] === '>'
  const bullet = rest < end && '-*+'.includes(s[rest]!) && endsMarker(rest + 1)
  let digitsEnd = rest
  while (digitsEnd < end && isAsciiDigit(s.charCodeAt(digitsEnd))) digitsEnd++
  const digits = digitsEnd - rest
  const ordered =
    digits >= 1 &&
    digits <= 9 &&
    digitsEnd < end &&
    (s[digitsEnd] === '.' || s[digitsEnd] === ')') &&
    endsMarker(digitsEnd + 1)
  return (
    isOneLineBlock(s, start, end) ||
    setext ||
    quote ||
    bullet ||
    ordered ||
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

/** Whether the character at `at` follows an odd run of `\`: a backslash escape. */
function escaped(s: string, at: number): boolean {
  let i = at
  while (i > 0 && s.charCodeAt(i - 1) === BACKSLASH) i--
  return (at - i) % 2 === 1
}

/**
 * Blank out fenced and inline code so links and tags inside it are not
 * harvested. `stripCodeWith` under `'commonmark'`.
 */
export function stripCode(text: string): string {
  return stripCodeWith(text, 'commonmark')
}

/**
 * Blank out fenced and inline code under `rules`.
 *
 * Every character of code, fence marker lines included, becomes a space, and
 * every `\n` stays. The output has the same number of **code points** as the
 * input, as the Rust crate keeps the same number of `char`s. It is not the
 * same UTF-16 length: a character outside the Basic Multilingual Plane in code
 * becomes one space, not two.
 */
export function stripCodeWith(text: string, rules: CodeRules): string {
  if (rules === 'none') return text
  const out: string[] = []
  const fences = new Fences(rules)
  const spans = new Spans(rules, text)
  let writtenUpTo = 0
  const blank = (start: number, end: number): void => {
    out.push(text.slice(writtenUpTo, start))
    out.push(text.slice(start, end).replace(/[^\n]/gu, ' '))
    writtenUpTo = end
  }

  let offset = 0
  while (offset < text.length) {
    if (offset === 0 || text.charCodeAt(offset - 1) === NEWLINE) {
      const end = lineEnd(text, offset)
      if (fences.line(text, offset, end) !== 'outside') {
        blank(offset, end)
        offset = end + 1
        continue
      }
      spans.line(fences.contentStart, end)
    }
    if (text.charCodeAt(offset) === BACKTICK) {
      if (rules === 'commonmark' && escaped(text, offset)) {
        // A `\`` outside a span is a literal backtick, so a run opens at the
        // next one. Inside a span a `\` is literal, so a close is never escaped.
        offset++
        continue
      }
      const [run, close] = spans.close(offset)
      if (close === null) {
        offset += run
      } else {
        blank(offset, close + run)
        offset = close + run
      }
      continue
    }
    offset++
  }
  out.push(text.slice(writtenUpTo))
  return out.join('')
}
