/**
 * The body link scanner: every link in a body, with its span. A port of the
 * `markdown-link` crate's `body_links_spanned` and `body_links`.
 */

import { type CodeRules, type Region, blank, regions } from './code.ts'
import {
  type Size,
  isVaultLinkUrl,
  isSpaceUnit,
  mdLinkTarget,
  parseInner,
  parseInnerSelf,
  trim,
} from './parse.ts'

/** What a body scan counts as a link. Every field is optional; the defaults are what `bodyLinksSpanned` uses. */
export interface ScanOptions {
  /**
   * Which rules decide what is code. Default `'commonmark'`. `'none'` finds
   * no code, for text that a markdown parser has already taken the code out
   * of.
   */
  codeRules?: CodeRules
  /**
   * Skip links inside HTML comments, as the code lexer finds them. Default
   * `false`.
   */
  skipHtmlComments?: boolean
  /**
   * Read `[[#Heading]]` or `[[#^block]]` as a link to the note it is written
   * in, with an empty `target`. Default `false`: such a link is dropped.
   */
  selfLinks?: boolean
}

/** What syntax produced a `BodyLink`. */
export type BodyLinkKind = 'wikilink' | 'embed' | 'markdown'

/** One outgoing reference found in a body, with its span, before resolution. */
export interface BodyLink {
  kind: BodyLinkKind
  /**
   * The reference as written between the delimiters, with any code inside it
   * blanked to spaces.
   */
  raw: string
  /**
   * What resolution runs against. A wikilink's `raw` minus `#heading` /
   * `^block` / `|alias` and the `\` escaping the pipe; a markdown link's URL
   * percent-decoded and minus a trailing `.md`. Empty for a link to the note
   * it is written in (see `ScanOptions.selfLinks`).
   */
  target: string
  /** A wikilink's `#heading`, as `WikiLink.heading`. `null` for a markdown link. */
  heading: string | null
  /** A wikilink's `#^block`, as `WikiLink.block`. `null` for a markdown link. */
  block: string | null
  /** An embed's size, as `WikiLink.size`. */
  size: Size | null
  /**
   * A wikilink's or embed's `|alias`: the text after the first `|` outside
   * code, read from the body so code inside it is kept. `null` when there is
   * none or it is empty, and for a markdown link.
   */
  alias: string | null
  /**
   * UTF-16 offsets of the whole link syntax within the body, so
   * `body.slice(start, end)` is the link. The Rust crate reports byte offsets.
   * An embed's `!` is inside the span.
   */
  start: number
  end: number
}

/**
 * Why the scanner gave up on a `[[`. `'bracket'`: a `[` or `]` came before
 * the closing `]]`. `'code'`: closed, but the target is empty once the code
 * inside it is blanked. `'empty-target'`: closed with an empty target (`[[]]`,
 * `[[ |alias]]`, or `[[#Heading]]` when `selfLinks` is off). `'unclosed'`: no
 * `]]` before the end of the body.
 */
export type AbandonReason = 'bracket' | 'code' | 'empty-target' | 'unclosed'

/**
 * A `[[` the scanner found outside code and did not read as a link: what a
 * renderer would otherwise leave in its output as literal brackets. A `[[`
 * inside code, or inside an HTML comment when `skipHtmlComments` is on, is not
 * reported. Nor is one that a link found after it starts inside, `[[[Note]]`
 * being a literal `[` and a link, or one whose first or second `[` opens a
 * Markdown link, of any URL: `[[WIP] Fix](https://example.com)`,
 * `[[Note](Note.md)]`, or `[[1]` with a `[1]: …` definition in the body. A
 * run of `[` with no link after it, such as `[[[TODO`, is one entry: from the
 * first `[[`, with the reason and end of the last.
 */
export interface AbandonedLink {
  reason: AbandonReason
  /** Whether an unescaped `!` came before the `[[`. */
  embed: boolean
  /**
   * UTF-16 offsets of what the scanner read, from the `[[` (or the `!` before
   * it): past the `]]` for `'code'` and `'empty-target'`, up to the `[` or `]`
   * it stopped at for `'bracket'`, and the end of the body for `'unclosed'`.
   */
  start: number
  end: number
}

/** What `scanBodyWith` found: the links, and the `[[` it gave up on. */
export interface BodyScan {
  links: BodyLink[]
  abandoned: AbandonedLink[]
}

/** What kind of reference produced a `RawLink`. */
export type LinkKind = 'wikilink' | 'embed'

/** A body reference without its span. */
export interface RawLink {
  /**
   * What resolution runs against. A wikilink's text minus `#heading`, `|alias`
   * and the `\` escaping the pipe; a markdown link's URL percent-decoded and
   * minus a trailing `.md`.
   */
  target: string
  kind: LinkKind
}

/**
 * Every wikilink, embed and relative markdown link in a note body, in the
 * order they appear. `bodyLinksSpanned` without the spans, so the two cannot
 * disagree. A markdown link is reported as `'wikilink'`.
 */
export function bodyLinks(body: string): RawLink[] {
  return bodyLinksSpanned(body).map((link) => ({
    target: link.target,
    kind: link.kind === 'embed' ? 'embed' : 'wikilink',
  }))
}

/**
 * Every wikilink, embed and relative markdown link in a body, in encounter
 * order, with spans.
 *
 * Code is blanked before matching, `[[` never nests, and a markdown link
 * counts only when `isVaultLinkUrl` accepts its URL and it carries no scheme.
 * A markdown link's text may hold brackets that balance, but no `[[`, no
 * link and no blank line, so `[[WIP] Fix](fix.md)` is a link and the
 * wikilink in `[see [[Note]]](a.md)` stays a wikilink. A `\[` or `\]` in it
 * does not count as a bracket. Its destination is read as written.
 * A `!` after an odd run of `\` is escaped: `\![[Note]]` is a `'wikilink'`
 * that starts at the `[[`, with the `!` left outside its span as literal
 * text, where `![[Note]]` is an `'embed'` that starts at the `!`. An even
 * run, as in `\\![[Note]]`, escapes the backslash and leaves an embed.
 *
 * The scan walks code points. `stripCode` keeps the code point count of its
 * input, not its UTF-16 length, so a code point index into the stripped text
 * is one into the body, and a table converts it to a UTF-16 offset.
 */
export function bodyLinksSpanned(body: string): BodyLink[] {
  return bodyLinksSpannedWith(body, {})
}

/**
 * `bodyLinksSpanned` under `options`: which code rules apply, whether HTML
 * comments hide links, and whether `[[#Heading]]` is a link. Code and
 * comments are found in one pass, left to right, so a `<!--` inside code does
 * not open a comment and a backtick inside a comment does not open code.
 */
export function bodyLinksSpannedWith(body: string, options: ScanOptions): BodyLink[] {
  return scanBodyWith(body, options).links
}

/**
 * `bodyLinksSpannedWith`, and each `[[` it gave up on: one holding a `[` or
 * `]`, one whose target is empty or only code, and one never closed.
 */
export function scanBodyWith(body: string, options: ScanOptions): BodyScan {
  const found = regions(body, options.codeRules ?? 'commonmark')
  const codeBlanked = (): string =>
    blank(
      body,
      found.filter((region) => region.kind === 'code'),
    )
  const skipComments = options.skipHtmlComments === true
  const text = found.length === 0 ? body : skipComments ? blank(body, found) : codeBlanked()
  const real = indexCodePoints(body)
  let stripped = real
  if (text !== body) {
    stripped = real.ascii ? blankCodes(real, found, skipComments) : indexCodePoints(text)
  }
  const chars = stripped.codes
  // With comments blanked too, the code points with only code blanked, made
  // the first time an abandoned link needs them.
  let codeText: [string, Int32Array] | null = null
  const at = real.at
  const tat = stripped.at
  if (chars.length !== real.codes.length) {
    // `stripCode` must keep the code point count. If it ever does not,
    // reporting no links beats reporting spans that index the wrong text.
    return { links: [], abandoned: [] }
  }

  const brackets = new Brackets(chars, body, at)
  // Made the first time a `](` is reached.
  let scan: UrlScan | null = null
  const out: BodyLink[] = []
  const abandoned: AbandonedLink[] = []
  const n = chars.length
  let i = 0
  while (i < n) {
    if (chars[i] !== OPEN) {
      i++
      continue
    }
    if (chars[i + 1] === OPEN) {
      const embed = i > 0 && chars[i - 1] === BANG && !escapedBang(chars, i - 1)
      const start = at[embed ? i - 1 : i]!
      let j = i + 2
      let pipe = -1
      let closed = false
      let bracket = false
      while (j + 1 < n) {
        const c = chars[j]
        if (c === CLOSE && chars[j + 1] === CLOSE) {
          closed = true
          break
        }
        // `[[` never nests, and `[` or `]` inside is a malformed link: stop
        // rather than swallow the rest of the note.
        if (c === OPEN || c === CLOSE) {
          bracket = true
          break
        }
        if (pipe === -1 && c === PIPE) pipe = j
        j++
      }
      if (!closed) {
        abandoned.push({
          reason: bracket ? 'bracket' : 'unclosed',
          embed,
          start,
          end: bracket ? at[j]! : body.length,
        })
      }
      if (closed) {
        const inner = text.slice(tat[i + 2], tat[j])
        let link = null
        if (inner !== '') {
          link =
            options.selfLinks === true ? parseInnerSelf(inner, embed) : parseInner(inner, embed)
        }
        if (link === null) {
          // Code inside was blanked to spaces, so the body there differs from
          // the code-blanked text. A blanked comment is not code.
          let code = text
          let cat = tat
          if (skipComments) {
            if (codeText === null) {
              const only = codeBlanked()
              codeText = [only, indexCodePoints(only).at]
            }
            code = codeText[0]
            cat = codeText[1]
          }
          const heldCode = body.slice(at[i + 2], at[j]) !== code.slice(cat[i + 2], cat[j])
          abandoned.push({
            reason: heldCode ? 'code' : 'empty-target',
            embed,
            start,
            end: at[j + 2]!,
          })
        }
        if (link !== null) {
          // Split at the pipe `parseInner` used, found in the stripped chars
          // so a `|` in code is not one, then read the alias from the body so
          // code inside it is kept.
          const alias = pipe === -1 ? null : trim(body.slice(at[pipe + 1], at[j])) || null
          dropOverlapped(abandoned, at[i]!)
          out.push({
            kind: embed ? 'embed' : 'wikilink',
            raw: inner,
            target: link.target,
            heading: link.heading,
            block: link.block,
            alias,
            size: link.size,
            start,
            end: at[j + 2]!,
          })
        }
        i = j + 2
        continue
      }
    }
    const close = brackets.textEnd(i)
    if (close !== undefined) {
      const paren = chars[close + 1] === PAREN
      if (paren) scan ??= new UrlScan(body, real)
      const destination = paren ? scan!.destination(close) : null
      if (
        overlaps(abandoned, at[i]!) &&
        (destination !== null || brackets.isReference(chars, i, close))
      ) {
        dropOverlapped(abandoned, at[i]!)
      }
      const link = destination === null ? null : markdownLink(i, destination, scan!)
      if (link !== null) {
        out.push(link)
        i = destination!.end
        continue
      }
    }
    i++
  }
  return { links: out, abandoned: mergeRuns(abandoned) }
}

const OPEN = 0x5b
const CLOSE = 0x5d
const BANG = 0x21
const PIPE = 0x7c
const PAREN = 0x28
const BACKSLASH = 0x5c
const NEWLINE = 0x0a

/** A text's code points, and the UTF-16 offset of each, plus an end sentinel. */
interface CodePoints {
  codes: Int32Array
  at: Int32Array
  /** Whether every code point is one UTF-16 unit, so `at` is the identity. */
  ascii: boolean
}

/**
 * The code points of the text `blank` makes of a body of single-unit code
 * points: the body's, with each blanked range but its `\n` set to a space.
 * A comment is blanked too only when `comments` says so.
 */
function blankCodes(real: CodePoints, found: Region[], comments: boolean): CodePoints {
  const codes = real.codes.slice()
  for (const { start, end, kind } of found) {
    if (kind === 'comment' && !comments) continue
    for (let k = start; k < end; k++) if (codes[k] !== NEWLINE) codes[k] = 0x20
  }
  return { codes, at: real.at, ascii: true }
}

/** The code points of `s`, and the UTF-16 offset of each with `s.length` after the last. */
function indexCodePoints(s: string): CodePoints {
  const len = s.length
  const codes = new Int32Array(len)
  let k = 0
  for (; k < len; k++) {
    const unit = s.charCodeAt(k)
    if (unit >= 0xd800 && unit <= 0xdbff) break
    codes[k] = unit
  }
  // Without a surrogate pair every offset is its index.
  if (k === len) return { codes, at: identity(len + 1), ascii: true }
  const at = new Int32Array(len + 1)
  for (let j = 0; j < k; j++) at[j] = j
  let n = k
  for (; k < len; k++) {
    const unit = s.charCodeAt(k)
    at[n] = k
    if (unit >= 0xd800 && unit <= 0xdbff && k + 1 < len) {
      const low = s.charCodeAt(k + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        codes[n++] = ((unit - 0xd800) << 10) + (low - 0xdc00) + 0x10000
        k++
        continue
      }
    }
    codes[n++] = unit
  }
  at[n] = len
  return { codes: codes.subarray(0, n), at: at.subarray(0, n + 1), ascii: false }
}

const scratchBuffers = [new Int32Array(0), new Int32Array(0)]

/** A reusable buffer `slot` of at least `size` entries, holding whatever it held before. */
function scratch(slot: 0 | 1, size: number): Int32Array {
  let buffer = scratchBuffers[slot]!
  if (buffer.length < size) {
    buffer = new Int32Array(Math.max(size, buffer.length * 2))
    scratchBuffers[slot] = buffer
  }
  return buffer
}

let identityTable = new Int32Array(0)

/** `[0, 1, ..., size - 1]`, shared and never written to. */
function identity(size: number): Int32Array {
  if (identityTable.length < size) {
    identityTable = new Int32Array(Math.max(size, identityTable.length * 2))
    for (let k = 0; k < identityTable.length; k++) identityTable[k] = k
  }
  return identityTable.subarray(0, size)
}

/**
 * Whether the `!` at `bang` follows an odd run of `\`: `\![[Note]]` is a
 * literal `!` and a wikilink, not an embed.
 */
function escapedBang(chars: Int32Array, bang: number): boolean {
  let i = bang
  while (i > 0 && chars[i - 1] === BACKSLASH) i--
  return (bang - i) % 2 === 1
}

/**
 * Folds each abandoned `[[` that starts inside the one before it into that
 * one, so a run of `[` such as `[[[TODO` is one entry: from the first `[[`,
 * with the reason and end of the last. As in `dropOverlapped`, an embed's `!`
 * does not count: in `[[x![[y` the embed is its own entry.
 */
function mergeRuns(abandoned: AbandonedLink[]): AbandonedLink[] {
  const out: AbandonedLink[] = []
  for (const next of abandoned) {
    const run = out[out.length - 1]
    if (run !== undefined && next.start + (next.embed ? 1 : 0) < run.end) {
      run.reason = next.reason
      run.end = next.end
    } else {
      out.push(next)
    }
  }
  return out
}

/**
 * Whether the last abandoned `[[` has its first or second `[` at or after
 * `bracket`, the offset of a `[`. An embed's `!` right after an abandoned
 * `[[`, as in `[[x![[B]]`, does not count.
 */
function overlaps(abandoned: AbandonedLink[], bracket: number): boolean {
  // A read at index -1 of an empty array is slow, so check the length.
  if (abandoned.length === 0) return false
  const last = abandoned[abandoned.length - 1]!
  return last.start + (last.embed ? 1 : 0) + 2 > bracket
}

/**
 * Drops each abandoned `[[` whose first or second `[` opens a link: `bracket`
 * is the offset of the link's first `[`, after any `!`. After a `[` or `]`
 * the scanner moves on one code point, so `[[[Note]]` is a literal `[` and a
 * link, not a `[[` given up on.
 */
function dropOverlapped(abandoned: AbandonedLink[], bracket: number): void {
  while (overlaps(abandoned, bracket)) abandoned.pop()
}

/**
 * The brackets of a body's Markdown links: where the text of each link that
 * a `[` could open ends, and the labels of the link reference definitions.
 */
class Brackets {
  /**
   * The code point index of each `]` that closes link text, by the index of
   * its `[`, or 0 for a `[` that opens none (a `]` is never at index 0). The
   * brackets between balance, hold no `[[` and no `](` (a link's text holds
   * no link), and no blank line comes between them. A `\[` or `\]` is not a
   * bracket.
   */
  private readonly ends: Int32Array
  /** Each `[label]: …` definition's label, as `normalizeLabel` gives it. */
  private readonly labels = new Set<string>()

  /**
   * `chars` are the body's code points with code blanked, and `at` maps a
   * code point index to its UTF-16 offset in `body`. A blank line is read in
   * `body`, so a line that is only code is not blank.
   */
  constructor(chars: Int32Array, body: string, at: Int32Array) {
    const n = chars.length
    const ends = new Int32Array(n)
    // The open `[`s: each one's index, and how many `[[` had started when it
    // was pushed, counting one that it starts.
    const openAt = scratch(0, n)
    const openSeen = scratch(1, n)
    let top = 0
    let seen = 0
    for (let k = 0; k < n; k++) {
      const c = chars[k]
      if (c === BACKSLASH && k + 1 < n && chars[k + 1] !== NEWLINE) {
        // An escaped character, `\[` and `\\` among them. A `\` at the end
        // of a line escapes nothing.
        k++
      } else if (c === OPEN) {
        if (chars[k + 1] === OPEN) seen++
        openAt[top] = k
        openSeen[top] = seen
        top++
      } else if (c === CLOSE) {
        if (top > 0) {
          top--
          if (openSeen[top] === seen) ends[openAt[top]!] = k
        }
        if (chars[k + 1] === PAREN) seen++
      } else if (c === NEWLINE) {
        let next = at[k + 1]!
        for (;;) {
          const b = body.charCodeAt(next)
          if (b !== 0x20 && b !== 0x09 && b !== 0x0d) break
          next++
        }
        if (next >= body.length || body.charCodeAt(next) === NEWLINE) top = 0
        this.define(chars, k + 1)
      }
    }
    this.define(chars, 0)
    this.ends = ends
  }

  /** The `]` that ends the text of a link opened by the `[` at `start`. */
  textEnd(start: number): number | undefined {
    const end = this.ends[start]!
    return end === 0 ? undefined : end
  }

  /**
   * Whether the `[` at `start`, whose text ends at `close`, opens a reference
   * link whose label a definition in the body names: `[text][label]`,
   * `[label][]` or `[label]`.
   */
  isReference(chars: Int32Array, start: number, close: number): boolean {
    let from = start + 1
    let to = close
    if (chars[close + 1] === OPEN) {
      let end = close + 2
      while (end < chars.length && chars[end] !== OPEN && chars[end] !== CLOSE) end++
      if (chars[end] !== CLOSE) return false
      let blank = true
      for (let k = close + 2; k < end; k++) {
        if (!isSpaceUnit(chars[k]!)) {
          blank = false
          break
        }
      }
      if (!blank) {
        from = close + 2
        to = end
      }
    }
    return this.labels.has(normalizeLabel(fromCodePoints(chars, from, to)))
  }

  /**
   * Notes the label of a link reference definition, `[label]:` after up to
   * three spaces, starting the line at `at`.
   */
  private define(chars: Int32Array, at: number): void {
    let i = at
    while (i < at + 3 && chars[i] === 0x20) i++
    if (chars[i] !== OPEN) return
    let end = i + 1
    while (
      end < chars.length &&
      chars[end] !== OPEN &&
      chars[end] !== CLOSE &&
      chars[end] !== NEWLINE
    )
      end++
    if (chars[end] !== CLOSE || chars[end + 1] !== COLON) return
    const label = normalizeLabel(fromCodePoints(chars, i + 1, end))
    if (label !== '') this.labels.add(label)
  }
}

const COLON = 0x3a

/** The string of the code points `chars[from, to)`. */
function fromCodePoints(chars: Int32Array, from: number, to: number): string {
  let out = ''
  for (let k = from; k < to; k += 4096) {
    out += String.fromCodePoint(...chars.subarray(k, Math.min(k + 4096, to)))
  }
  return out
}

/**
 * A link label as a definition and a reference match it: lowercase, with
 * each run of whitespace one space and none at either end. Empty for a label
 * of only whitespace, which no reference matches.
 */
function normalizeLabel(label: string): string {
  const words: string[] = []
  let from = -1
  for (let k = 0; k < label.length; k++) {
    if (isSpaceUnit(label.charCodeAt(k))) {
      if (from !== -1) words.push(label.slice(from, k))
      from = -1
    } else if (from === -1) {
      from = k
    }
  }
  if (from !== -1) words.push(label.slice(from))
  return words.join(' ').toLowerCase()
}

/** An inline link's destination: `(url)` or `(<url>)` after the `]` that ends its text. */
interface Destination {
  /** The code point index where the URL starts. */
  urlStart: number
  /** The code point index just past the URL. */
  urlEnd: number
  /** The code point index just past the `)`. */
  end: number
}

/**
 * `[text](relative/note.md)` starting at `start`, with its `destination`, or
 * `null` when it is not a link this dialect harvests. The URL is built only
 * for a link, so a body of failed attempts stays linear.
 */
function markdownLink(
  start: number,
  { urlStart, urlEnd, end }: Destination,
  scan: UrlScan,
): BodyLink | null {
  // Not a link this dialect harvests. The caller advances one code point, so
  // a match may start at an inner `[`: `[a[b](x.md)` is a link.
  if (!scan.isVaultLink(urlStart, urlEnd) || hasScheme(scan.chars, urlStart, urlEnd)) {
    return null
  }
  const url = scan.body.slice(scan.at[urlStart], scan.at[urlEnd])
  return {
    kind: 'markdown',
    raw: url,
    target: mdLinkTarget(url),
    heading: null,
    block: null,
    alias: null,
    size: null,
    start: scan.at[start]!,
    end: scan.at[end]!,
  }
}

/**
 * A body's code points as written, with the reads a markdown link attempt
 * needs of its URL: where it stops, and where its last `.` or `/` is. The
 * attempts come in order of their `[`, and the link texts that a `(` follows
 * do not nest, so the URLs of attempts that read the same stop overlap and
 * the rest are disjoint. Each read remembers its last answer, and a body of
 * failed attempts stays linear.
 *
 * A destination is read as written, not with code blanked: a link's
 * destination is read where its `](` is, so no code or math starts in it, and
 * `[a](notes/$x$.md)` is a link.
 */
class UrlScan {
  readonly body: string
  readonly chars: Int32Array
  readonly at: Int32Array
  /** The last stop found: the one for every start from `stopFrom` through `stopAt`. */
  private stopFrom = 0
  private stopAt = -1
  /** The last `.` or `/` in `[markLow, markEnd)`, or -1, as `lastMark` found it. */
  private markLow = 0
  private markEnd = -1
  private markAt = -1
  /** `isVaultLinkUrl` of each URL tail asked so far, by `tailStart * (n + 1) + end`. */
  private readonly answers = new Map<number, boolean>()

  constructor(body: string, { codes, at }: Pick<CodePoints, 'codes' | 'at'>) {
    this.body = body
    this.chars = codes
    this.at = at
  }

  /** The first `)`, `>` or whitespace at or after `from`, or the end. */
  private stop(from: number): number {
    if (from >= this.stopFrom && from <= this.stopAt) return this.stopAt
    const chars = this.chars
    const n = chars.length
    let k = from
    while (k < n) {
      const c = chars[k]!
      if (c === CLOSE_PAREN || c === GT || isSpace(c)) break
      k++
    }
    this.stopFrom = from
    this.stopAt = k
    return k
  }

  /** The last `.` or `/` in `chars[from, end)`, or -1. */
  private lastMark(from: number, end: number): number {
    if (end === this.markEnd && from >= this.markLow) {
      return this.markAt >= from ? this.markAt : -1
    }
    const chars = this.chars
    let k = end - 1
    while (k >= from && chars[k] !== DOT && chars[k] !== SLASH) k--
    this.markLow = from
    this.markEnd = end
    this.markAt = k >= from ? k : -1
    return this.markAt
  }

  /**
   * The destination after the `]` at `close`, when its shape is the regex
   * `\(<?([^)>\s]*)>?\)`. A URL containing whitespace is not one.
   */
  destination(close: number): Destination | null {
    const chars = this.chars
    if (chars[close + 1] !== PAREN) return null
    const angled = chars[close + 2] === LT
    const urlStart = angled ? close + 3 : close + 2
    const urlEnd = this.stop(Math.min(urlStart, chars.length))
    let end = urlEnd
    if (angled) {
      if (chars[end] !== GT) return null
      end++
    }
    return chars[end] === CLOSE_PAREN ? { urlStart, urlEnd, end: end + 1 } : null
  }

  /**
   * `isVaultLinkUrl` of `chars[from, end)`. That answer depends only on
   * whether the URL ends in `.md` after at least one character and on the
   * extension of its last segment. So the URL from the character before its
   * last `.` gives the same answer, and that tail is shared by every URL
   * ending at `end`.
   */
  isVaultLink(from: number, end: number): boolean {
    const mark = this.lastMark(from, end)
    if (mark === -1 || this.chars[mark] !== DOT) return false
    const tailStart = Math.max(from, mark - 1)
    const key = tailStart * (this.chars.length + 1) + end
    let answer = this.answers.get(key)
    if (answer === undefined) {
      answer = isVaultLinkUrl(this.body.slice(this.at[tailStart], this.at[end]))
      this.answers.set(key, answer)
    }
    return answer
  }
}

const CLOSE_PAREN = 0x29

/** `isSpaceUnit`, with a quick no for the ASCII that is not space. */
function isSpace(c: number): boolean {
  return c === 0x20 || (c >= 0x09 && c <= 0x0d) || (c > 0x7f && isSpaceUnit(c))
}

const GT = 0x3e
const LT = 0x3c
const DOT = 0x2e
const SLASH = 0x2f

/**
 * Whether `chars[from, end)` starts with a URI scheme (`http:`, `https:`,
 * `mailto:`), which marks the URL external. Read in place, like the rest of
 * the URL: `/^[A-Za-z][A-Za-z0-9+.-]*:/` on a built string would cost the
 * whole URL on every failed attempt.
 */
function hasScheme(chars: Int32Array, from: number, end: number): boolean {
  if (from >= end || !isAsciiLetter(chars[from]!)) return false
  for (let i = from + 1; i < end; i++) {
    const c = chars[i]!
    if (c === COLON) return true
    if (!(isAsciiLetter(c) || (c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === DOT)) {
      return false
    }
  }
  return false
}

function isAsciiLetter(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)
}
