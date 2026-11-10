/**
 * Source slicing for partial transclusion: `![[Note#Heading]]` and
 * `![[Note#^block-id]]` embed a *piece* of a note.
 *
 * Slicing happens on the markdown source, before parsing, which is both the
 * cheap thing and the correct one — a heading section is a source range, and
 * re-rendering the slice keeps every dialect feature working inside it.
 *
 * Every slicer expects a note body with frontmatter already removed. A leading
 * `---` line is a thematic break and stays content.
 */

import { BLOCK_ID_RE, STANDALONE_BLOCK_ID_RE } from './plugins/block-ids.ts'

/**
 * An ATX heading: up to three spaces of indent (four is code), then the `#`
 * run. An optional closing `#` run counts only after a space or tab, per
 * CommonMark.
 */
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*(?:(?<=[ \t])#+[ \t]*)?$/
/** The `===` / `---` line under a setext heading. */
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/

/** A line that opens a list item. */
const LIST_ITEM_START = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/

/**
 * A line that opens a list item or a block quote. A setext underline cannot
 * follow one, so `- item` over `---` is a list and a thematic break.
 */
const CONTAINER_START = /^ {0,3}(?:(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)|>)/

/** A `***`, `---` or `___` thematic break. */
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/

/** A line that opens a block of its own, and so ends a paragraph above it. */
const BLOCK_START = /^ {0,3}(?:#{1,6}(?:[ \t]|$)|`{3,}|~{3,}|<)/

/** A block quote's `>` marker. */
const QUOTE_MARKER = /^ {0,3}> ?/

/** A list item opener: indent, marker (an ordered one's number), then its content. */
const LIST_ITEM = /^( {0,3})([-+*]|(\d{1,9})[.)])(?:([ \t]+)(.*))?$/

/** A fenced-code delimiter: up to three spaces, then three or more ` or ~. */
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/**
 * Which lines sit inside a fenced code block, the delimiters themselves
 * included.
 *
 * Slicing has no parser to ask, and both markers it looks for are ordinary
 * characters inside a fence. A `# install deps` comment in a ```bash block read
 * as a heading and truncated the section mid-fence, handing the embed an
 * unterminated fence and silently dropping the rest; a line ending in `^id`
 * inside a fence claimed a block reference that belongs elsewhere. One
 * line-level pass is all the fence-awareness the slicers need.
 *
 * CommonMark's rules, as far as they matter here: a closing fence uses the
 * same character as its opener, is at least as long, and carries no info
 * string — which is what lets a ```` ```` ```` block contain a ``` one.
 */
function fencedLines(lines: string[]): boolean[] {
  return fenceStarts(lines).map((start) => start >= 0)
}

/**
 * For each line inside a fence (see {@link fencedLines}), the index of that
 * fence's opening delimiter; -1 outside every fence. Two fences can touch with
 * no line between them, so "fenced" alone does not say where one begins.
 */
function fenceStarts(lines: string[]): number[] {
  const starts = new Array<number>(lines.length).fill(-1)
  let open: { char: string; length: number; at: number } | null = null

  for (const [i, line] of lines.entries()) {
    const match = CODE_FENCE.exec(line)
    const marker = match?.[1] ?? ''
    const info = match?.[2] ?? ''
    const char = marker[0]
    if (!open) {
      // A backtick fence's info string may not itself contain a backtick.
      if (match && char && !(char === '`' && info.includes('`'))) {
        open = { char, length: marker.length, at: i }
        starts[i] = i
      }
      continue
    }
    starts[i] = open.at
    if (match && marker[0] === open.char && marker.length >= open.length && !info.trim()) {
      open = null
    }
  }
  return starts
}

/** Four columns of indent: an indented code line, outside a container. */
const INDENTED_CODE = /^(?: {4}| {0,3}\t)/

/**
 * The line that opens a raw HTML block (CommonMark types 1-7): `<!`, `<?`, a
 * block-level tag such as `<div>` or `</pre>`, or any other tag only when it
 * is the whole line. `<b>Note</b> text` is a paragraph.
 */
const HTML_BLOCK_START = new RegExp(
  '^ {0,3}<(?:[!?]|/?(?:script|pre|style|textarea|address|article|aside|base|basefont|' +
    'blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|' +
    'figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|' +
    'li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|' +
    'summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[\\s>]|/>|$))',
  'i',
)
/** A CommonMark type 7 HTML block line: one open or closing tag, alone on its line. */
const HTML_TAG_LINE = /^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>\s*$/

/**
 * An inline HTML tag or comment. A tag name runs to a space, `/` or `>`, so an
 * autolink (`<https://…>`), whose label IS text, does not match. A tag's
 * attributes stop at the next `<` as well as `>`, so a long line of unclosed
 * `<a ` costs linear time, not quadratic.
 */
const INLINE_HTML = /<\/?[A-Za-z][A-Za-z0-9-]*(?:[\s/][^<>]*)?>|<!--(?:(?!-->)[^<])*-->/g

/** A GFM table delimiter row: `| - | :-: |`. It needs a pipe, or it is a setext underline. */
const TABLE_DELIMITER = /^ {0,3}(?=[^|]*\|)\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/

/** The cells of a table row: split on unescaped pipes, outer pipes dropped. */
function tableCells(line: string): number {
  const inner = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
  return inner.split(/(?<!\\)\|/).length
}

/**
 * Which lines are rows of a GFM table: a header row, a delimiter row with as
 * many cells, and every line after them up to a blank line or the start of
 * another block. A `^id` line right under a table is a row, not a marker.
 */
function tableLines(lines: string[], fenced: boolean[]): boolean[] {
  const rows = Array.from({ length: lines.length }, () => false)
  for (let i = 1; i < lines.length; i++) {
    const header = lines[i - 1] ?? ''
    const delimiter = lines[i] ?? ''
    if (fenced[i] || fenced[i - 1] || !header.includes('|') || !TABLE_DELIMITER.test(delimiter)) {
      continue
    }
    if (CONTAINER_START.test(delimiter) || tableCells(header) !== tableCells(delimiter)) continue
    rows[i - 1] = rows[i] = true
    let k = i + 1
    for (; k < lines.length; k++) {
      const line = lines[k] ?? ''
      if (fenced[k] || !line.trim() || BLOCK_START.test(line) || CONTAINER_START.test(line)) break
      if (THEMATIC_BREAK.test(line)) break
      rows[k] = true
    }
    i = k
  }
  return rows
}

/** An ATX heading line, the empty `#` heading included. */
const ATX_START = /^ {0,3}#{1,6}(?:[ \t]|$)/

/**
 * Whether line `k` is a whole block by itself — an ATX heading, a thematic
 * break, or a setext underline under paragraph text — so no paragraph is open
 * after it.
 */
function oneLineBlock(lines: string[], k: number): boolean {
  const line = lines[k] ?? ''
  if (ATX_START.test(line) || THEMATIC_BREAK.test(line)) return true
  const above = lines[k - 1]
  return SETEXT_UNDERLINE.test(line) && !!above?.trim() && !CONTAINER_START.test(above)
}

/**
 * Which lines are indented code or a raw HTML block — markdown that never
 * becomes an mdast `text` node, so a `%%` on it is not a comment marker.
 *
 * An approximation of CommonMark, as the slicers are: indented code needs no
 * paragraph open above it — a blank line, a fence, a heading, a thematic break
 * or another code line — and no list open, since inside a list item an
 * indented line is the item's paragraph text. A heading or a rule at the
 * margin closes a list. An HTML block of types 1-6 may interrupt a paragraph;
 * a type 7 one needs a break above it. It runs to the next blank line; an
 * `<!--` one runs to its `-->`.
 */
function nonTextLines(lines: string[], fenced: boolean[]): boolean[] {
  const skip = Array.from({ length: lines.length }, () => false)
  let inList = false
  let inCode = false
  let html: 'blank' | 'comment' | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const blank = !line.trim()
    if (html) {
      if (html === 'blank' && blank) html = null
      else skip[i] = true
      if (html === 'comment' && line.includes('-->')) html = null
      continue
    }
    if (blank || fenced[i]) {
      inCode = false
      continue
    }
    const previous = i > 0 ? lines[i - 1] : undefined
    const afterBreak =
      previous === undefined ||
      !previous.trim() ||
      (fenced[i - 1] ?? false) ||
      oneLineBlock(lines, i - 1)
    if ((afterBreak || inCode) && !inList && INDENTED_CODE.test(line)) {
      skip[i] = inCode = true
      continue
    }
    inCode = false
    if (HTML_BLOCK_START.test(line) || (afterBreak && HTML_TAG_LINE.test(line))) {
      skip[i] = true
      const comment = /^ {0,3}<!--/.test(line)
      if (!(comment && line.includes('-->'))) html = comment ? 'comment' : 'blank'
      continue
    }
    const ownBlock = oneLineBlock(lines, i)
    if (LIST_ITEM_START.test(line) && !ownBlock) inList = true
    else if ((afterBreak || ownBlock) && !/^[ \t]/.test(line)) inList = false
  }
  return skip
}

/**
 * `line` with each inline code span blanked out. A span opens on a run of
 * backticks and closes on the next run of the same length; a run with no
 * partner is literal backticks. Each run is visited once and each length
 * keeps a queue of where its runs are, so a line of thousands of backticks
 * costs linear time — a backtracking regex for the same rule took seconds.
 */
function maskCodeSpans(line: string): string {
  const runs: Array<{ start: number; length: number }> = []
  for (const match of line.matchAll(/`+/g)) {
    runs.push({ start: match.index, length: match[0].length })
  }
  const byLength = new Map<number, number[]>()
  for (const [k, run] of runs.entries()) {
    const queue = byLength.get(run.length) ?? []
    queue.push(k)
    byLength.set(run.length, queue)
  }
  const cursor = new Map<number, number>()
  let masked = ''
  let from = 0
  for (let k = 0; k < runs.length; k++) {
    const open = runs[k] as { start: number; length: number }
    if (open.start < from) continue
    const queue = byLength.get(open.length) ?? []
    let at = cursor.get(open.length) ?? 0
    while (at < queue.length && (queue[at] as number) <= k) at++
    cursor.set(open.length, at)
    const partner = queue[at]
    if (partner === undefined) continue
    const close = runs[partner] as { start: number; length: number }
    const end = close.start + close.length
    masked += line.slice(from, open.start) + ' '.repeat(end - open.start)
    from = end
    k = partner
  }
  return masked + line.slice(from)
}

/** How each line sits relative to a `%%` comment. */
interface Commented {
  /**
   * The line lies wholly inside a comment — it opens inside one and holds no
   * marker — so a heading on it is not rendered. A heading line that closes
   * the comment keeps its tail, and renders.
   */
  hidden: boolean[]
  /** The line closes inside a comment, so a trailing `^id` on it is not rendered. */
  ends: boolean[]
}

/**
 * Which lines a `%%…%%` comment covers, the way `plugins/comments.ts` reads
 * them: `%%` is a document-level delimiter that runs across blocks, and an
 * unclosed one runs to the end. Only `text` nodes carry one, so a marker
 * inside a fence, indented code, raw HTML, inline code or escaped (`\%%`
 * escapes the first `%`) opens nothing.
 */
function commentedLines(lines: string[], fenced: boolean[]): Commented {
  const hidden = Array.from({ length: lines.length }, () => false)
  const ends = Array.from({ length: lines.length }, () => false)
  const nonText = nonTextLines(lines, fenced)
  let inside = false
  for (const [i, line] of lines.entries()) {
    let markers = 0
    if (!fenced[i] && !nonText[i]) {
      const prose = maskCodeSpans(
        line
          .replace(INLINE_HTML, (tag) => ' '.repeat(tag.length))
          .replace(/\\[\p{P}\p{S}]/gu, '  '),
      )

      markers = prose.split('%%').length - 1
    }
    hidden[i] = inside && !markers
    if (markers % 2) inside = !inside
    ends[i] = inside
  }
  return { hidden, ends }
}

/**
 * The source's lines. Split on CRLF and lone CR as well as LF, the endings
 * remark accepts: a kept `\r` matches none of the line regexes here, so a
 * CRLF note sliced to nothing.
 */
function splitLines(markdown: string): string[] {
  return markdown.split(/\r\n?|\n/)
}

/** The source's first line ending, which a slice is joined back with. */
function lineEnding(markdown: string): string {
  return /\r\n?|\n/.exec(markdown)?.[0] ?? '\n'
}

/**
 * Whether `next` ends the block `line` closes, so a `^id` at the end of `line`
 * ends that block's last text run — the only inline place `remarkBlockIds`
 * takes one. A line that merely continues the paragraph (soft-wrapped, or a
 * lazy continuation) leaves the marker mid-paragraph, as literal text. Inside
 * a quote, the next line is read past its own `>`.
 */
function endsBlock(line: string, next: string | undefined, nextFenced: boolean): boolean {
  if (next === undefined || nextFenced) return true
  const following = QUOTE_MARKER.test(line) ? next.replace(QUOTE_MARKER, '') : next
  return (
    !following.trim() ||
    BLOCK_START.test(following) ||
    CONTAINER_START.test(following) ||
    SETEXT_UNDERLINE.test(following) ||
    THEMATIC_BREAK.test(following)
  )
}

/**
 * Whether a standalone `^id` line under `previous` is a marker paragraph of
 * its own. Under paragraph text, a list item or a quote line it is a lazy
 * continuation of that block instead, and ends that block's text. It stands
 * alone after a blank line, a fence, a heading or a thematic break (and after
 * indented code, which the caller checks).
 */
function standsAlone(
  previous: string | undefined,
  previousFenced: boolean,
  previousIsHeading: boolean,
): boolean {
  if (previous === undefined || previousFenced || previousIsHeading) return true
  return !previous.trim() || THEMATIC_BREAK.test(previous) || SETEXT_UNDERLINE.test(previous)
}

interface Heading {
  index: number
  /** The first line of the heading; differs from `index` for a multi-line setext title. */
  first: number
  depth: number
  title: string
  setext: boolean
}

/** Where a list item's content starts, or `undefined` when `line` opens none. */
function listItemContent(line: string): number | undefined {
  const item = LIST_ITEM.exec(line)
  if (!item) return undefined
  const lead = (item[1] ?? '').length + (item[2] ?? '').length
  const gap = (item[4] ?? '').length
  // An empty item, or one whose content is indented code, starts one past the marker.
  return !item[5]?.trim() || gap > 4 ? lead + 1 : lead + gap
}

/**
 * Whether `line` starts a new block even directly under paragraph text. A list
 * item does only when it has content and, if ordered, is numbered 1.
 */
function interruptsParagraph(line: string): boolean {
  if (QUOTE_MARKER.test(line)) return true
  const item = LIST_ITEM.exec(line)
  return !!item?.[5]?.trim() && (item[3] === undefined || item[3] === '1')
}

/** The first line of the paragraph whose last line is `i`. */
function paragraphStart(lines: string[], fenced: boolean[], i: number): number {
  let start = i
  while (start > 0 && !interruptsParagraph(lines[start] ?? '')) {
    const above = lines[start - 1] ?? ''
    if (!above.trim() || fenced[start - 1] || ATX_HEADING.test(above)) break
    if (SETEXT_UNDERLINE.test(above) || THEMATIC_BREAK.test(above)) break
    start--
  }
  return start
}

/**
 * Every heading in the source, ATX and setext alike,
 * skipping fences, indented code, raw HTML blocks and `%%` comments. A setext
 * heading's `index` is its title line; the underline below it belongs to the
 * section the same way the `#` line does.
 */
function headings(lines: string[], fenced: boolean[]): Heading[] {
  const found: Heading[] = []
  const commented = commentedLines(lines, fenced).hidden
  const code = nonTextLines(lines, fenced)
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i] || code[i] || commented[i]) continue
    const line = lines[i] ?? ''
    const atx = ATX_HEADING.exec(line)
    const hashes = atx?.[1]
    if (atx && hashes !== undefined) {
      found.push({ index: i, first: i, depth: hashes.length, title: atx[2] ?? '', setext: false })
      continue
    }
    // Setext: a paragraph line with an underline beneath it. The line above the
    // underline has to hold paragraph text — `---` under a blank line or another
    // thematic break is a thematic break, not a heading.
    const under = lines[i + 1]
    if (!line.trim() || under === undefined || fenced[i + 1]) continue
    if (!SETEXT_UNDERLINE.test(under) || THEMATIC_BREAK.test(line)) continue
    // An underline cannot continue a block quote, nor a list item unless it is
    // indented to the item's content: `- y` over `---` is a list and a
    // thematic break, but `- y` over `  ---` is an h2 inside the item.
    const start = paragraphStart(lines, fenced, i)
    const opener = lines[start] ?? ''
    if (QUOTE_MARKER.test(opener)) continue
    const content = listItemContent(opener)
    if (content !== undefined && under.length - under.trimStart().length < content) continue
    const title = lines
      .slice(start, i + 1)
      .map((text, at) => (at === 0 && content !== undefined ? text.slice(content) : text).trim())
      .join(' ')
    found.push({
      index: i,
      first: start,
      depth: under.trim().startsWith('=') ? 1 : 2,
      title,
      setext: true,
    })
    // The underline is part of this heading, not a line to read again.
    i++
  }
  return found
}

/** One heading of a markdown source, as {@link sourceHeadings} reports it. */
export interface SourceHeading {
  /** Heading text as written, markup and all — what an embed target names. */
  heading: string
  /** 1–6. */
  depth: number
  /** 1-based line number; for a setext heading, the first line of its title. */
  line: number
}

/**
 * Every heading in a markdown body, ATX and setext alike, with fences,
 * indented code, raw HTML blocks and `%%` comments skipped. The source must be
 * a body: a leading `---` is a thematic break, not frontmatter.
 *
 * The shape an editor host's `searchHeadings` answers with. A host completing
 * `[[Note#` has the target's SOURCE and nothing parsed, and the rule for which
 * `#` lines are headings — not the ones inside a fenced `bash` block or a
 * `%%` comment — is the same rule
 * {@link sliceByHeading} applies when the completed link is later embedded.
 * One implementation keeps the offer and the slice from disagreeing.
 */
export function sourceHeadings(markdown: string): SourceHeading[] {
  const lines = splitLines(markdown)
  return headings(lines, fencedLines(lines)).map((found) => ({
    heading: found.title,
    depth: found.depth,
    line: found.first + 1,
  }))
}

/**
 * Strip a heading down to the words a reader sees, so `![[Note#See the key]]`
 * finds `## See the **key**`. `loose` also turns punctuation into a space, as
 * Obsidian's own heading match has it: Obsidian writes `## Step 1: Install` as
 * `[[Note#Step 1 Install]]`, and a `|`, `[`, `]` or `#` cannot appear in a
 * link's heading text at all. Both sides of a comparison go through this, so
 * it only has to be consistent, not faithful.
 */
function normalizeHeading(value: string, loose: boolean): string {
  const words = value
    // `\*` is a literal asterisk, not emphasis; drop the backslash before the
    // markup strip below can mistake what follows it for markup.
    .replace(/\\([\p{P}\p{S}])/gu, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) =>
      (alias ?? target).trim(),
    )
    // `[alias](Note.md)` shows its alias, the same as a wikilink's.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // A heading may also carry a block id; that is an anchor, not its text.
    .replace(BLOCK_ID_RE, '')
    .replace(/[*_`~]/g, '')
  return (loose ? words.replace(/[!"#$%&()+,./:;<=>?@^{|}\\[\]]/g, ' ') : words)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * The first heading in `found[from, to)` deeper than `depth` that matches
 * `text` — Obsidian matches on text, not on slug, ignoring case. A match with
 * the punctuation kept wins over one with it ignored, so a link to `C` reaches
 * `## C` rather than an earlier `## C++`.
 */
function matchHeading(
  found: Heading[],
  text: string,
  from = 0,
  to = found.length,
  depth = 0,
): number {
  for (const loose of [false, true]) {
    const want = normalizeHeading(text, loose)
    const at = found.findIndex(
      (candidate, k) =>
        k >= from &&
        k < to &&
        candidate.depth > depth &&
        normalizeHeading(candidate.title, loose) === want,
    )
    if (at >= 0) return at
  }
  return -1
}

/** The index in `found` of the first heading after `at`'s section. */
function sectionEnd(found: Heading[], at: number): number {
  const depth = (found[at] as Heading).depth
  const next = found.findIndex((candidate, k) => k > at && candidate.depth <= depth)
  return next < 0 ? found.length : next
}

/**
 * Where `heading` is in `found`, or -1. A `#` between two parts separates a
 * path, as in Obsidian's `[[Note#Heading#Sub]]`: each part is found in turn, a
 * heading deeper than the one before it, inside that one's section. When no
 * path matches, or the `#` leaves only one part (`C#`), the whole fragment is
 * tried as one heading's text — exactly first, so `C#` reaches `## C#` and not
 * an earlier `## C`.
 */
function findHeading(found: Heading[], heading: string): number {
  const parts = heading.split('#').filter((piece) => piece.trim())
  if (parts.length > 1) {
    let at = -1
    let from = 0
    let to = found.length
    let depth = 0
    for (const part of parts) {
      at = matchHeading(found, part, from, to, depth)
      if (at < 0) break
      depth = (found[at] as Heading).depth
      from = at + 1
      to = sectionEnd(found, at)
    }
    if (at >= 0) return at
  }
  return matchHeading(found, heading)
}

/**
 * The section a heading owns: the heading line through everything before the
 * next heading of the same or shallower depth. `heading` may be a
 * `Heading#Subheading` path. Returns `null` when no heading matches. The
 * slice keeps the source's line endings.
 */
export function sliceByHeading(markdown: string, heading: string): string | null {
  const lines = splitLines(markdown)
  const found = headings(lines, fencedLines(lines))
  const at = findHeading(found, heading)
  if (at < 0) return null

  const start = found[at] as Heading
  const next = found[sectionEnd(found, at)]
  const end = next ? next.first : lines.length
  return lines.slice(start.first, end).join(lineEnding(markdown)).trimEnd()
}

/**
 * The block a `^block-id` marks: the contiguous run of lines ending at the
 * marker, back to the preceding blank line or block boundary. The marker
 * itself is stripped, so the embedded copy does not re-declare the id. Returns
 * `null` when no line carries the id where the renderer would assign it. Like
 * {@link sliceByHeading}, the slice keeps the source's line endings.
 */
export function sliceByBlockId(markdown: string, blockId: string): string | null {
  const lines = splitLines(markdown)
  const starts = fenceStarts(lines)
  const fenced = starts.map((start) => start >= 0)
  const commented = commentedLines(lines, fenced).ends
  const nonText = nonTextLines(lines, fenced)
  const tableRow = tableLines(lines, fenced)

  // A heading is a block of its own: it ends the block above it and is not
  // part of the one below. Each of its lines maps to its first line — a
  // setext heading is its title and its underline.
  const headingStart = new Map<number, number>()
  const atx = new Set<number>()
  const underlines = new Set<number>()
  for (const found of headings(lines, fenced)) {
    headingStart.set(found.index, found.first)
    if (found.setext) {
      headingStart.set(found.index + 1, found.first)
      underlines.add(found.index + 1)
    } else atx.add(found.index)
  }

  // Only where `remarkBlockIds` would take the marker: at the end of a heading
  // or another block, or as a marker paragraph of its own. `last` is the final
  // line of the block that owns it — for a marker paragraph, the block above.
  let last = -1
  for (const [i, line] of lines.entries()) {
    if (fenced[i] || commented[i]) continue
    const match = BLOCK_ID_RE.exec(line)
    if (!match || match[1] !== blockId) continue
    const ends = endsBlock(line, lines[i + 1], fenced[i + 1] ?? false)
    if (STANDALONE_BLOCK_ID_RE.test(line)) {
      if (!ends) continue
      // Indented code cannot take a lazy line, so a marker under it stands alone.
      const codeAbove = nonText[i - 1] && !nonText[i] && INDENTED_CODE.test(lines[i - 1] ?? '')
      if (
        !codeAbove &&
        !standsAlone(lines[i - 1], fenced[i - 1] ?? false, headingStart.has(i - 1))
      ) {
        // A lazy continuation of the paragraph, item or quote above: the marker
        // ends that block's last text run, so the block owns it. A run of
        // marker lines owns nothing unless text opens it. Raw HTML, code and
        // table rows own nothing, and a run under a heading, fence or rule is
        // a marker-only paragraph of its own.
        let above = i - 1
        while (above >= 0 && STANDALONE_BLOCK_ID_RE.test(lines[above] ?? '')) above--
        if (above < 0 || nonText[i - 1] || nonText[above] || tableRow[i]) continue
        if (standsAlone(lines[above], fenced[above] ?? false, headingStart.has(above))) continue
        last = i
        break
      }
      let above = i - 1
      while (above >= 0 && !lines[above]?.trim()) above--
      // With no block above it the marker owns nothing, so it stays literal
      // text — and a later marker with the same id may still be the real one.
      if (above < 0) continue
      last = above
      break
    }
    // A table row's trailing text is a cell, never the table's own text.
    if (tableRow[i]) continue
    if (headingStart.has(i) || ends) {
      last = i
      break
    }
  }
  if (last < 0) return null
  // The id sits on a setext heading's title line; its underline is part of the block.
  const idLine = last
  if (underlines.has(last + 1) && !underlines.has(last)) last++

  let start = last
  const heading = headingStart.get(last)
  if (heading !== undefined) {
    // The marker is on a heading, or stands below one: the heading is the block.
    start = heading
  } else if (fenced[last]) {
    // The block above the marker is itself a fenced code block — jump to its
    // opening delimiter instead of the generic blank-line scan below, which
    // would stop right on the closing fence and slice out just that one line.
    start = starts[last] ?? last
  } else {
    // Stop where the parser starts a new block without a blank line: after a
    // fence, a heading, a thematic break or an empty list item, and at a heading
    // line, a thematic break or the first line of a block quote. A quote's lazy
    // continuation lines stay with it. A `=` or `--` line that underlines
    // nothing is paragraph text.
    const line = (i: number) => lines[i] ?? ''
    const emptyItem = (i: number) => {
      const item = LIST_ITEM.exec(line(i))
      return !!item && !item[5]?.trim() && !line(i - 1).trim()
    }
    const closesAbove = (i: number) =>
      fenced[i] || atx.has(i) || underlines.has(i) || THEMATIC_BREAK.test(line(i)) || emptyItem(i)
    const opensBlock = (i: number) =>
      atx.has(i) ||
      (THEMATIC_BREAK.test(line(i)) && !underlines.has(i)) ||
      (QUOTE_MARKER.test(line(i)) && !QUOTE_MARKER.test(line(i - 1)))
    while (start > 0 && line(start - 1).trim() && !closesAbove(start - 1) && !opensBlock(start)) {
      start--
    }
  }

  const block = lines.slice(start, last + 1)
  const at = idLine - start
  block[at] = (block[at] ?? '').replace(BLOCK_ID_RE, '').trimEnd()
  return block.join(lineEnding(markdown)).trimEnd()
}

/** Apply whichever fragment an embed carried; no fragment returns the note as given. */
export function sliceEmbed(
  markdown: string,
  fragment: { heading?: string; blockId?: string },
): string | null {
  if (fragment.blockId) return sliceByBlockId(markdown, fragment.blockId)
  if (fragment.heading) return sliceByHeading(markdown, fragment.heading)
  return markdown
}
