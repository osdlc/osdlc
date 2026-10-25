/**
 * A narrow, hand-written YAML line lexer, shared by the three `parse`
 * runners that read YAML: `docker-compose.ts`, `github-actions.ts`, and
 * `go-task.ts`.
 *
 * Why it is hand-written: these runners read one mapping level from any
 * repository, and keep going (with a diagnostic) past YAML a parser would
 * reject or that uses anchors and merge keys. A full parse would fail the
 * whole file instead. `pnpm-workspace.yaml`, whose one list must be read
 * exactly, uses the `yaml` parser instead. All three runners need the same
 * lexing: strip comments, track quoting, find the indent, tell a block
 * scalar's body from structure, and stop at a document separator. This
 * module does that.
 *
 * What it does not do: it is not a parser and builds no tree. It does not
 * resolve anchors, aliases or merge keys. It only flags them, so a runner can
 * warn instead of reporting too little. It does not decode block scalars,
 * escapes in quoted scalars, tags, or multi-line flow collections. It reads
 * only the first YAML document. Nothing here validates: input a real YAML
 * parser would reject gets whatever the scanner happens to find.
 *
 * What each runner keeps: only the lexer is shared. Each runner has its own
 * structural reader (the walk over `services:`, `tasks:`, or `on:`) and its
 * own diagnostics, worded for that runner. Two runners warning about the same
 * construct still describe different losses, so those strings are not
 * shared.
 */

/** Indent of a line, counting spaces only. YAML forbids tabs for indentation. */
export function leadingSpaces(line: string): number {
  let n = 0
  while (n < line.length && line[n] === ' ') n++
  return n
}

/**
 * Where a plain (unquoted) scalar value begins on this line, or Infinity if
 * the line has none.
 *
 * A YAML plain scalar runs to the end of the line, so `&` and `*` inside one
 * are ordinary text: `command: rm -rf *tmp` contains a glob, not an alias.
 * An anchor or alias can appear only where a node begins, so the value's
 * first character decides. `image: *base` and `web: &base` start with the
 * indicator and are still scanned, and so is a flow collection
 * (`x: [*a, *b]`), which can hold aliases. Only a value that starts as a plain
 * or quoted scalar stops the scan, and only from that point on. The key part
 * of the line is still scanned.
 */
export function plainScalarStart(line: string): number {
  const m = /^(?:\s*(?:-\s+)?(?:'[^']*'|"[^"]*"|[^-'"#:\s][^:]*):(?:\s+|$)|\s*-\s+)/.exec(line)
  if (m === null) return Infinity
  const head = m[0].length
  const first = line[head]
  if (first === undefined) return Infinity
  // Node indicators: anything a real anchor, alias, flow collection, tag or
  // block scalar could start with. Everything else opens a scalar.
  if ('&*[{!?|>'.includes(first)) return Infinity
  return head
}

/**
 * One line with its comment stripped, flagging any anchor, alias or merge
 * key seen outside a quoted string.
 *
 * The `plainScalarStart` check only removes false positives (the `&`/`*` in
 * `command: rm -rf *tmp`). A real anchor or alias sits at the start of a node,
 * which always comes before `plainScalarStart`.
 */
export function scanLine(line: string): { cleaned: string; anchor: boolean; merge: boolean } {
  const plainFrom = plainScalarStart(line)
  let out = ''
  let inSingle = false
  let inDouble = false
  let anchor = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    const prev = i > 0 ? line[i - 1] : undefined

    if (inSingle) {
      out += ch
      if (ch === "'") inSingle = false
      continue
    }
    if (inDouble) {
      out += ch
      if (ch === '"' && prev !== '\\') inDouble = false
      continue
    }
    if (ch === "'") {
      inSingle = true
      out += ch
      continue
    }
    if (ch === '"') {
      inDouble = true
      out += ch
      continue
    }
    if (ch === '#' && (i === 0 || /\s/.test(prev ?? ''))) {
      // Comment start outside a string: everything after is not YAML content.
      break
    }
    if (
      (ch === '&' || ch === '*') &&
      i < plainFrom &&
      (i === 0 || /\s/.test(prev ?? '')) &&
      /[A-Za-z0-9_]/.test(line[i + 1] ?? '')
    ) {
      anchor = true
    }
    out += ch
  }

  const merge = /^\s*<<\s*:/.test(out)
  return { cleaned: out, anchor, merge }
}

/**
 * A block scalar header: `|` or `>` with an optional indentation digit and
 * chomping indicator, in either order (`|`, `>-`, `|2`, `>-3`, `|-2`). YAML
 * allows both orders, and real files use both.
 *
 * Shared by its two users: `unquoteValue`, which must not return a header as
 * a value, and `opensBlockScalar`, which uses it to know the following lines
 * are literal text.
 */
export const BLOCK_SCALAR_VALUE = /^[|>](?:[0-9]*[+-]?|[+-]?[0-9]*)$/

/**
 * The line ends in a block scalar header, so what follows it is literal text.
 *
 * Runs on a line whose comment `scanLine` has already stripped. `prepass`
 * guarantees that, which is why there is no `(?:#.*)?` tail here. Matches a
 * bare `key: |` at end of line, a `- run: |-` sequence item, and `key: |2`.
 *
 * The regex is not anchored, so it matches at the last `:` on the line:
 * `opensBlockScalar("run: echo a: |")` is `true`. That input is not valid YAML
 * and no runner's answer changes, but this is not an exact header test.
 */
export function opensBlockScalar(line: string): boolean {
  const m = /(?::|^\s*-)\s+(\S+)\s*$/.exec(line)
  return m !== null && BLOCK_SCALAR_VALUE.test(m[1] ?? '')
}

/**
 * Trim and strip one matched pair of surrounding quotes. Escapes are not
 * decoded: single-quoted `'It''s CI'` yields `It''s CI`, and `\` escapes in a
 * double-quoted scalar stay as written.
 *
 * Always returns a string, so it suits a flow-collection entry, where an
 * empty entry is still an entry. Use `unquoteValue` for a mapping value,
 * where empty and a block scalar header must both read as absent.
 */
export function unquote(raw: string): string {
  const t = raw.trim()
  if (
    t.length >= 2 &&
    ((t[0] === "'" && t[t.length - 1] === "'") || (t[0] === '"' && t[t.length - 1] === '"'))
  ) {
    return t.slice(1, -1)
  }
  return t
}

/**
 * A mapping value, unquoted, or undefined when there is no readable scalar
 * value. Empty is undefined, and so is a block scalar header: this module
 * does not decode block scalars, and returning `|` or `|2` as a `desc:` would
 * give a wrong value instead of a missing one.
 */
export function unquoteValue(raw: string): string | undefined {
  const t = raw.trim()
  if (t === '' || BLOCK_SCALAR_VALUE.test(t)) return undefined
  return unquote(t)
}

/**
 * A `key: value` line at a known indent, quoted or bare key, list items
 * excluded. The value part allows `:` on purpose, so `image: nginx:alpine`
 * yields the whole tag.
 */
export function matchKey(line: string, indent: number): { key: string; value: string } | null {
  const content = line.slice(indent)
  if (content.startsWith('-')) return null
  let m = /^'([^']*)'\s*:\s*(.*)$/.exec(content)
  if (m) return { key: m[1] ?? '', value: m[2] ?? '' }
  m = /^"([^"]*)"\s*:\s*(.*)$/.exec(content)
  if (m) return { key: m[1] ?? '', value: m[2] ?? '' }
  m = /^([^:\s][^:]*):\s*(.*)$/.exec(content)
  if (m) return { key: (m[1] ?? '').trim(), value: m[2] ?? '' }
  return null
}

/**
 * A document separator (`---`) or end marker (`...`), at column 0 only.
 *
 * Wider on purpose than `line.trim() === "---"`, which misses three real
 * cases: `--- # switching documents` (a marker with a trailing comment),
 * `--- foo` (a marker with trailing content), and `...` in any form. Each miss
 * makes the reader run past the first document and report keys from the
 * second as if they were in the first. That is a wrong answer. Stopping early
 * only gives an incomplete one, which the runner already warns about. The
 * column-0 rule keeps an indented `---` inside a `command: |` from matching,
 * and `prepass` never passes such a line here anyway.
 */
export function isDocumentMarker(line: string): boolean {
  return /^(?:---|\.\.\.)(?:\s|$)/.test(line)
}

/** One line's lexical reading, parallel to the input line at the same index. */
export interface ScannedLine {
  /** The line with comments stripped, or `""` for a block scalar's body. */
  cleaned: string
  /** An anchor or alias was seen outside a quoted string on this line. */
  anchor: boolean
  /** This line is a merge key (`<<:`). */
  merge: boolean
  /** This line is the body of a block scalar, so it was not scanned. */
  blockScalar: boolean
}

/** Everything the three runners need out of one walk over a YAML file. */
export interface Prepass {
  /** Parallel to `scanned`: each retained line's `cleaned` text. */
  lines: string[]
  scanned: ScannedLine[]
  /** An anchor or alias appears somewhere in the retained lines. */
  anchor: boolean
  /** A merge key appears somewhere in the retained lines. */
  merge: boolean
  /**
   * A document separator was found with another document after it, so that
   * document was dropped. False for a trailing `---`/`...` followed only by
   * blank lines or comments: the input is cut there too, but nothing is
   * missing.
   */
  multiDoc: boolean
}

/**
 * One walk over a YAML file, doing everything the three runners need before
 * their own structural readers run: BOM strip, line split, comment strip,
 * anchor/merge flagging, block-scalar masking, and truncation at the first
 * document separator.
 *
 * A block scalar's body is blanked, not passed through. Its content is
 * literal text: a `---`, an `&anchor`, a `<<:` or a `#` inside a `run: |` are
 * just characters. Blanking means none of them can be misread. A blank line
 * cannot be mistaken for structure, cannot raise a false anchor warning, and
 * cannot look like a document separator. The lines keep their index, so
 * `lines` stays parallel to the file.
 */
export function prepass(text: string): Prepass {
  // Strip a leading BOM first. JS `\s` matches U+FEFF, so the BOM sticks to
  // the first key: `services:` after a BOM never matches `services`, and the
  // whole file reads as empty with nothing to report. Written as an escape,
  // not a literal byte, so the source has no invisible character.
  const rawLines = text.replace(/^\uFEFF/, '').split(/\r?\n/)

  const lines: string[] = []
  const scanned: ScannedLine[] = []
  let anchor = false
  let merge = false
  let multiDoc = false
  // Whether any kept line had document content. This alone decides opener
  // versus separator. The opener line is kept and its `cleaned` is `"---"`,
  // which sets `sawContent` below, so a second `---` always finds content and
  // reads as a separator. A `%YAML` or `%TAG` directive is the one line that
  // must not set it; see below.
  let sawContent = false

  // Block scalar extent. `headerIndent` is the indent of the header line.
  // `contentIndent` is the indent of the scalar's first non-blank line, which
  // sets the level the rest of the body must keep.
  let headerIndent = -1
  let contentIndent = -1

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i] ?? ''

    if (headerIndent !== -1) {
      if (raw.trim() === '') {
        // A blank line inside a block scalar is content, whatever its indent.
        lines.push('')
        scanned.push({ cleaned: '', anchor: false, merge: false, blockScalar: true })
        continue
      }
      const indent = leadingSpaces(raw)
      if (contentIndent === -1 && indent > headerIndent) contentIndent = indent
      if (contentIndent !== -1 && indent >= contentIndent) {
        lines.push('')
        scanned.push({ cleaned: '', anchor: false, merge: false, blockScalar: true })
        continue
      }
      // Dedented out of the scalar: it ends here, and this line is ordinary
      // YAML, handled below.
      //
      // The `contentIndent` test is stricter than a bare
      // `indent > headerIndent`, not more precise. They differ only for a line
      // indented between the header and the content indent, which real YAML
      // rejects ("a leading all-space line must not have too many spaces").
      // Treating it as the end of the scalar keeps the following structure
      // readable instead of swallowing the rest of the mapping.
      //
      // Known limitation: `contentIndent` is always taken from the first body
      // line, even when the header has an explicit indentation indicator.
      // `BLOCK_SCALAR_VALUE` accepts `|2`, but the `2` (which declares the
      // content indent) is ignored here. The indicator is recognized, not
      // applied. If the first body line is indented deeper than the indicator
      // declares, the computed extent is wrong.
      headerIndent = -1
      contentIndent = -1
    }

    // `---` before any document content is the directives-end marker that
    // opens the first document, not a separator. Deciding by content, not by
    // line number, lets a file start with a comment header, a blank line, or
    // a `%YAML` directive (none of which set `sawContent`) and still read its
    // `---` as the opener. A second `---` always separates, because the kept
    // opener line sets `sawContent` itself. `...` is never an opener: it ends
    // a document.
    //
    // Known limitation: a mapping that starts on the marker line
    // (`--- services:`) is not seen. The line is kept as `"--- services:"`,
    // which `matchKey` rejects because it starts with `-`.
    if (isDocumentMarker(raw)) {
      const opener = raw.startsWith('---') && !sawContent
      if (!opener) {
        // Stop here either way; nothing past a separator is read. But report a
        // later document only if one exists. A trailing `---` or `...` with
        // only blank lines after it closes the file's single document, and the
        // reader read all of it. Saying content was dropped would be false.
        //
        // The test uses the cleaned line, not the raw one: trailing comments
        // are not a document either.
        multiDoc = rawLines.slice(i + 1).some((rest) => scanLine(rest).cleaned.trim() !== '')
        break
      }
    }

    const line = scanLine(raw)
    if (line.anchor) anchor = true
    if (line.merge) merge = true
    lines.push(line.cleaned)
    scanned.push({ ...line, blockScalar: false })
    // A `%YAML`/`%TAG` directive is kept like any other line but is not
    // document content. Directives are what YAML allows before a
    // directives-end marker (hence the marker's name). If a directive set
    // `sawContent`, the `---` after it would read as a separator and the
    // whole file would be lost.
    if (line.cleaned.trim() !== '' && !line.cleaned.startsWith('%')) sawContent = true

    if (opensBlockScalar(line.cleaned)) {
      headerIndent = leadingSpaces(raw)
      contentIndent = -1
    }
  }

  // `anchor` and `merge` cover the kept lines only. Lines past a document
  // separator were never read, so they do not count.
  return { lines, scanned, anchor, merge, multiDoc }
}
