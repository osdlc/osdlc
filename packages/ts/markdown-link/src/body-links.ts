/**
 * The body link scanner: every link in a body, with its span. A port of the
 * `markdown-link` crate's `body_links_spanned` and `body_links`.
 */

import { type CodeRules, stripCodeWith } from './code.ts'
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
  /** Skip links inside HTML comments, `<!--` to `-->` or the end. Default `false`. */
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
 * reported, and nor is one that a link found after it starts inside:
 * `[[[Note]]` is a literal `[` and a link. A run of `[` with no link after it,
 * such as `[[[TODO`, is one entry: from the first `[[`, with the reason and
 * end of the last.
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
 * comments hide links, and whether `[[#Heading]]` is a link. A comment is
 * found after code is blanked, so a `<!--` inside code does not open one.
 */
export function bodyLinksSpannedWith(body: string, options: ScanOptions): BodyLink[] {
  return scanBodyWith(body, options).links
}

/**
 * `bodyLinksSpannedWith`, and each `[[` it gave up on: one holding a `[` or
 * `]`, one whose target is empty or only code, and one never closed.
 */
export function scanBodyWith(body: string, options: ScanOptions): BodyScan {
  const codeBlanked = stripCodeWith(body, options.codeRules ?? 'commonmark')
  const skipComments = options.skipHtmlComments === true
  const chars = Array.from(skipComments ? blankComments(codeBlanked) : codeBlanked)
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

  const out: BodyLink[] = []
  const abandoned: AbandonedLink[] = []
  const scan = new UrlScan()
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
          const code = skipComments ? (codeChars ??= Array.from(codeBlanked)) : chars
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
    if (chars[i] === '[') {
      const found = markdownLink(chars, i, at, scan)
      if (found !== null) {
        dropOverlapped(abandoned, at[i]!)
        out.push(found.link)
        i = found.next
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
 * Drops each abandoned `[[` whose second `[` opens a link: `bracket` is the
 * offset of the link's first `[`, after any `!`. After a `[` or `]` the
 * scanner moves on one code point, so `[[[Note]]` is a literal `[` and a link,
 * not a `[[` given up on. An embed's `!` right after an abandoned `[[`, as in
 * `[[x![[B]]`, does not count.
 */
function dropOverlapped(abandoned: AbandonedLink[], bracket: number): void {
  for (;;) {
    const last = abandoned[abandoned.length - 1]
    if (last === undefined || last.start + (last.embed ? 1 : 0) + 2 <= bracket) return
    abandoned.pop()
  }
}

/**
 * `text` with every HTML comment, `<!--` to `-->` or the end, blanked to
 * spaces, newlines kept. The code point count does not change.
 */
function blankComments(text: string): string {
  let out = ''
  let rest = text
  for (;;) {
    const open = rest.indexOf('<!--')
    if (open === -1) break
    out += rest.slice(0, open)
    const close = rest.indexOf('-->', open + 4)
    const end = close === -1 ? rest.length : close + 3
    for (const c of rest.slice(open, end)) out += c === '\n' ? '\n' : ' '
    rest = rest.slice(end)
  }
  return out + rest
}

/**
 * `[text](relative/note.md)` starting at `start`, and the code point index
 * just past it, or `null` when this is not one.
 *
 * The shape is the regex `\[[^\]]*\]\(<?([^)>\s]+?)>?\)`, walked by hand so
 * positions index the body. A URL containing whitespace is not a link. The
 * URL is read in place and built only for a link, so a body of failed
 * attempts stays linear.
 */
function markdownLink(
  chars: string[],
  start: number,
  at: number[],
  scan: UrlScan,
): { link: BodyLink; next: number } | null {
  let j = start + 1
  while (j < chars.length && chars[j] !== ']' && chars[j] !== '[') j++
  if (chars[j] !== ']' || chars[j + 1] !== '(') return null
  const angled = chars[j + 2] === '<'
  const urlStart = angled ? j + 3 : j + 2
  const urlEnd = scan.urlEnd(chars, urlStart)
  let end = urlEnd
  if (angled) {
    if (chars[end] !== '>') return null
    end++
  }
  if (chars[end] !== ')') return null
  end++
  // Not a link this dialect harvests. The caller advances one code point, so
  // a match may start at an inner `[`: `[a[b](x.md)` is a link.
  if (!scan.isVaultLink(chars, urlStart, urlEnd) || hasScheme(chars, urlStart, urlEnd)) {
    return null
  }
  const url = chars.slice(urlStart, urlEnd).join('')
  return {
    link: {
      kind: 'markdown',
      raw: url,
      target: mdLinkTarget(url),
      heading: null,
      block: null,
      alias: null,
      size: null,
      start: at[start]!,
      end: at[end]!,
    },
    next: end,
  }
}

/**
 * What earlier markdown link attempts learned about the URLs they read. Each
 * attempt starts later than the one before, so remembering the last answer of
 * each kind keeps a body of failed attempts linear.
 */
class UrlScan {
  /** The first `)`, `>` or whitespace at or after `from` is at `stop`. */
  private from = -1
  private stop = -1
  private end = -1
  private markFrom = -1
  /**
   * The last `.` or `/` in `[markFrom, end)`, or below `markFrom` when there
   * is none.
   */
  private mark = -1
  /** `isVaultLinkUrl` of `chars[tailStart, end)`, by `tailStart`. */
  private answers = new Map<number, boolean>()

  /** Where a URL starting at `from` ends: the first `)`, `>` or whitespace. */
  urlEnd(chars: string[], from: number): number {
    if (from >= this.from && from <= this.stop) return this.stop
    let k = from
    while (k < chars.length && chars[k] !== ')' && chars[k] !== '>' && !isWhitespace(chars[k]!)) {
      k++
    }
    this.from = from
    this.stop = k
    return k
  }

  /**
   * `isVaultLinkUrl` of `chars[from, end)`. That answer depends only on
   * whether the URL ends in `.md` after at least one character and on the
   * extension of its last segment. So the URL from the character before its
   * last `.` gives the same answer, and that tail is shared by every attempt
   * ending at `end`.
   */
  isVaultLink(chars: string[], from: number, end: number): boolean {
    if (end !== this.end || from < this.markFrom) {
      let mark = end - 1
      while (mark >= from && chars[mark] !== '.' && chars[mark] !== '/') mark--
      this.end = end
      this.markFrom = from
      this.mark = mark
      this.answers.clear()
    }
    if (this.mark < from || chars[this.mark] === '/') return false
    const tailStart = Math.max(from, this.mark - 1)
    let answer = this.answers.get(tailStart)
    if (answer === undefined) {
      answer = isVaultLinkUrl(chars.slice(tailStart, end).join(''))
      this.answers.set(tailStart, answer)
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
