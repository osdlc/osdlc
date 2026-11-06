/**
 * The body link scanner: every link in a body, with its span. A port of the
 * `markdown-link` crate's `body_links_spanned` and `body_links`.
 */

import { type CodeRules, blank, regions } from './code.ts'
import {
  type Size,
  isVaultLinkUrl,
  isWhitespace,
  mdLinkTarget,
  parseInner,
  parseInnerSelf,
  trim,
} from './parse.ts'

/** What a body scan counts as a link. Every field is optional; the defaults are what `bodyLinksSpanned` uses. */
export interface ScanOptions {
  /** Which rules decide what is code. Default `'commonmark'`. */
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
  /** Whether a `!` came before the `[[`. */
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
  const chars = Array.from(skipComments ? blank(body, found) : codeBlanked())
  // With comments blanked too, the code points with only code blanked, made
  // the first time an abandoned link needs them.
  let codeChars: string[] | null = null
  // Code point index -> UTF-16 offset in the body, plus an end sentinel.
  const at: number[] = []
  let offset = 0
  for (const c of body) {
    at.push(offset)
    offset += c.length
  }
  at.push(body.length)
  if (chars.length + 1 !== at.length) {
    // `stripCode` must keep the code point count. If it ever does not,
    // reporting no links beats reporting spans that index the wrong text.
    return { links: [], abandoned: [] }
  }

  const brackets = new Brackets(chars, body, at)
  // Made the first time a `](` is reached.
  let scan: UrlScan | null = null
  const out: BodyLink[] = []
  const abandoned: AbandonedLink[] = []
  let i = 0
  while (i < chars.length) {
    if (chars[i] === '[' && chars[i + 1] === '[') {
      const embed = i > 0 && chars[i - 1] === '!'
      const start = at[embed ? i - 1 : i]!
      let j = i + 2
      let inner = ''
      let pipe = -1
      let closed = false
      let bracket = false
      while (j + 1 < chars.length) {
        if (chars[j] === ']' && chars[j + 1] === ']') {
          closed = true
          break
        }
        // `[[` never nests, and `[` or `]` inside is a malformed link: stop
        // rather than swallow the rest of the note.
        if (chars[j] === '[' || chars[j] === ']') {
          bracket = true
          break
        }
        if (pipe === -1 && chars[j] === '|') pipe = j
        inner += chars[j]
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
        let link = null
        if (inner !== '') {
          link =
            options.selfLinks === true ? parseInnerSelf(inner, embed) : parseInner(inner, embed)
        }
        if (link === null) {
          // Code inside was blanked to spaces, so the body there differs from
          // the code-blanked text. A blanked comment is not code.
          const code = skipComments ? (codeChars ??= Array.from(codeBlanked())) : chars
          const heldCode = body.slice(at[i + 2], at[j]) !== code.slice(i + 2, j).join('')
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
    const close = chars[i] === '[' ? brackets.textEnd(i) : undefined
    if (close !== undefined) {
      if (chars[close + 1] === '(') scan ??= new UrlScan(body)
      const destination = chars[close + 1] === '(' ? scan!.destination(close) : null
      if (
        overlaps(abandoned, at[i]!) &&
        (destination !== null || brackets.isReference(chars, i, close))
      ) {
        dropOverlapped(abandoned, at[i]!)
      }
      const link = destination === null ? null : markdownLink(i, destination, at, scan!)
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
  const last = abandoned[abandoned.length - 1]
  return last !== undefined && last.start + (last.embed ? 1 : 0) + 2 > bracket
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
   * its `[`. The brackets between balance, hold no `[[` and no `](` (a
   * link's text holds no link), and no blank line comes between them. A `\[`
   * or `\]` is not a bracket.
   */
  private readonly ends = new Map<number, number>()
  /** Each `[label]: …` definition's label, as `normalizeLabel` gives it. */
  private readonly labels = new Set<string>()

  /**
   * `chars` are the body's code points with code blanked, and `at` maps a
   * code point index to its UTF-16 offset in `body`. A blank line is read in
   * `body`, so a line that is only code is not blank.
   */
  constructor(chars: string[], body: string, at: number[]) {
    // Each open `[`, and how many `[[` had started when it was pushed,
    // counting one that it starts.
    const open: [number, number][] = []
    let seen = 0
    for (let k = 0; k < chars.length; k++) {
      const c = chars[k]
      if (c === '\\' && k + 1 < chars.length && chars[k + 1] !== '\n') {
        // An escaped character, `\[` and `\\` among them. A `\` at the end
        // of a line escapes nothing.
        k++
      } else if (c === '[') {
        if (chars[k + 1] === '[') seen++
        open.push([k, seen])
      } else if (c === ']') {
        const popped = open.pop()
        if (popped !== undefined && popped[1] === seen) this.ends.set(popped[0], k)
        if (chars[k + 1] === '(') seen++
      } else if (c === '\n') {
        let next = at[k + 1]!
        while (body[next] === ' ' || body[next] === '\t' || body[next] === '\r') next++
        if (next >= body.length || body[next] === '\n') open.length = 0
        this.define(chars, k + 1)
      }
    }
    this.define(chars, 0)
  }

  /** The `]` that ends the text of a link opened by the `[` at `start`. */
  textEnd(start: number): number | undefined {
    return this.ends.get(start)
  }

  /**
   * Whether the `[` at `start`, whose text ends at `close`, opens a reference
   * link whose label a definition in the body names: `[text][label]`,
   * `[label][]` or `[label]`.
   */
  isReference(chars: string[], start: number, close: number): boolean {
    let label = chars.slice(start + 1, close)
    if (chars[close + 1] === '[') {
      let end = close + 2
      while (end < chars.length && chars[end] !== '[' && chars[end] !== ']') end++
      if (chars[end] !== ']') return false
      const written = chars.slice(close + 2, end)
      if (!written.every(isWhitespace)) label = written
    }
    return this.labels.has(normalizeLabel(label))
  }

  /**
   * Notes the label of a link reference definition, `[label]:` after up to
   * three spaces, starting the line at `at`.
   */
  private define(chars: string[], at: number): void {
    let i = at
    while (i < at + 3 && chars[i] === ' ') i++
    if (chars[i] !== '[') return
    let end = i + 1
    while (end < chars.length && chars[end] !== '[' && chars[end] !== ']' && chars[end] !== '\n')
      end++
    const label = normalizeLabel(chars.slice(i + 1, end))
    if (chars[end] === ']' && chars[end + 1] === ':' && label !== '') this.labels.add(label)
  }
}

/**
 * A link label as a definition and a reference match it: lowercase, with
 * each run of whitespace one space and none at either end. Empty for a label
 * of only whitespace, which no reference matches.
 */
function normalizeLabel(label: string[]): string {
  const words: string[] = []
  let word = ''
  for (const c of label) {
    if (isWhitespace(c)) {
      if (word !== '') words.push(word)
      word = ''
    } else {
      word += c
    }
  }
  if (word !== '') words.push(word)
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
  at: number[],
  scan: UrlScan,
): BodyLink | null {
  // Not a link this dialect harvests. The caller advances one code point, so
  // a match may start at an inner `[`: `[a[b](x.md)` is a link.
  if (!scan.isVaultLink(urlStart, urlEnd) || hasScheme(scan.chars, urlStart, urlEnd)) {
    return null
  }
  const url = scan.chars.slice(urlStart, urlEnd).join('')
  return {
    kind: 'markdown',
    raw: url,
    target: mdLinkTarget(url),
    heading: null,
    block: null,
    alias: null,
    size: null,
    start: at[start]!,
    end: at[end]!,
  }
}

/**
 * A body's code points as written, and tables over them that let each
 * markdown link attempt read its URL in constant time, whatever order the
 * attempts come in, so a body of failed attempts stays linear.
 *
 * A destination is read as written, not with code blanked: a link's
 * destination is read where its `](` is, so no code or math starts in it, and
 * `[a](notes/$x$.md)` is a link.
 */
class UrlScan {
  readonly chars: string[]
  /** For each index, the first `)`, `>` or whitespace at or after it. */
  private readonly stop: number[]
  /** For each index, the last `.` or `/` before it, or -1. */
  private readonly mark: number[]
  /** `isVaultLinkUrl` of each URL tail asked so far, by `start,end`. */
  private readonly answers = new Map<string, boolean>()

  constructor(body: string) {
    const chars = Array.from(body)
    this.chars = chars
    this.stop = Array.from({ length: chars.length + 1 }, () => chars.length)
    for (let k = chars.length - 1; k >= 0; k--) {
      const c = chars[k]!
      this.stop[k] = c === ')' || c === '>' || isWhitespace(c) ? k : this.stop[k + 1]!
    }
    this.mark = Array.from({ length: chars.length + 1 }, () => -1)
    for (let k = 0; k < chars.length; k++) {
      this.mark[k + 1] = chars[k] === '.' || chars[k] === '/' ? k : this.mark[k]!
    }
  }

  /**
   * The destination after the `]` at `close`, when its shape is the regex
   * `\(<?([^)>\s]*)>?\)`. A URL containing whitespace is not one.
   */
  destination(close: number): Destination | null {
    const chars = this.chars
    if (chars[close + 1] !== '(') return null
    const angled = chars[close + 2] === '<'
    const urlStart = angled ? close + 3 : close + 2
    const urlEnd = this.stop[Math.min(urlStart, chars.length)]!
    let end = urlEnd
    if (angled) {
      if (chars[end] !== '>') return null
      end++
    }
    return chars[end] === ')' ? { urlStart, urlEnd, end: end + 1 } : null
  }

  /**
   * `isVaultLinkUrl` of `chars[from, end)`. That answer depends only on
   * whether the URL ends in `.md` after at least one character and on the
   * extension of its last segment. So the URL from the character before its
   * last `.` gives the same answer, and that tail is shared by every URL
   * ending at `end`.
   */
  isVaultLink(from: number, end: number): boolean {
    const chars = this.chars
    const mark = this.mark[end]!
    if (mark < from || chars[mark] !== '.') return false
    const tailStart = Math.max(from, mark - 1)
    const key = `${tailStart},${end}`
    let answer = this.answers.get(key)
    if (answer === undefined) {
      answer = isVaultLinkUrl(chars.slice(tailStart, end).join(''))
      this.answers.set(key, answer)
    }
    return answer
  }
}

/**
 * Whether `chars[from, end)` starts with a URI scheme (`http:`, `https:`,
 * `mailto:`), which marks the URL external. Read in place, like the rest of
 * the URL: `/^[A-Za-z][A-Za-z0-9+.-]*:/` on a built string would cost the
 * whole URL on every failed attempt.
 */
function hasScheme(chars: string[], from: number, end: number): boolean {
  if (from >= end || !/^[A-Za-z]$/.test(chars[from]!)) return false
  for (let i = from + 1; i < end; i++) {
    if (chars[i] === ':') return true
    if (!/^[A-Za-z0-9+.-]$/.test(chars[i]!)) return false
  }
  return false
}
