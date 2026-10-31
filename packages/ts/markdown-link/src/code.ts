/**
 * Code fences and inline code spans: finding them, and blanking them so a
 * lexer never harvests out of them. A port of the `markdown-link` crate's
 * `wikilink::code` module; that module's doc states both rule sets in full.
 *
 * In short, `'commonmark'` (the default) follows CommonMark, and
 * `'skill-export'` keeps the looser rules of `skill-export`'s renderer. Both read one line at a time, so neither knows about container
 * blocks, and indented code blocks are not code.
 *
 * Every marker is ASCII, so a scan over UTF-16 code units never splits a
 * character.
 */

/** Which rules the lexer follows. */
export type CodeRules = 'commonmark' | 'skill-export'

const NEWLINE = 10
const CR = 13
const TAB = 9
const SPACE = 32
const BACKTICK = 96
const TILDE = 126

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
    let at = from
    for (;;) {
      while (at < s.length && s.charCodeAt(at) !== NEWLINE) {
        if (s.charCodeAt(at) !== BACKTICK) {
          at++
          continue
        }
        const run = runLength(s, at, s.length)
        if (closes(run, length, this.rules)) return { close: at }
        at += run
      }
      const next = at + 1
      if (this.oneLine || next >= s.length) return { blockEnd: Math.min(next, s.length) }
      if (endsSpanBlock(s, next, lineEnd(s, next), this.rules)) return { blockEnd: next }
      at = next
    }
  }
}

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
  const out: string[] = []
  const fences = new Fences(rules)
  const spans = new Spans(rules, text)
  let writtenUpTo = 0
  const blank = (start: number, end: number): void => {
    out.push(text.slice(writtenUpTo, start))
    for (const c of text.slice(start, end)) out.push(c === '\n' ? '\n' : ' ')
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
      spans.line(offset, end)
    }
    if (text.charCodeAt(offset) === BACKTICK) {
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
