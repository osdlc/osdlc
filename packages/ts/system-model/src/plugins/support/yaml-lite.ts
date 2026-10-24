/**
 * A narrow, hand-written YAML line lexer, shared by the three `parse`
 * runners that read YAML: `docker-compose.ts`, `github-actions.ts`, and
 * `go-task.ts`.
 *
 * WHY IT IS HAND-WRITTEN. This package takes no YAML dependency (see
 * `package.json`, and the note in `go-task.ts`): the monorepo's `yaml` and
 * `yaml-splice` packages are span-preserving editors for known top-level
 * fields, not general parsers, and neither belongs in a runner that reads
 * arbitrary repositories on someone else's disk. So each runner reads the
 * one mapping level it cares about out of raw text. What they all needed was
 * the same lexical layer underneath: strip comments, notice quoting, find the
 * indent, tell a block scalar's body from structure, and stop at a document
 * separator. That layer is this module.
 *
 * WHAT IT DOES NOT ATTEMPT. It is not a parser and produces no tree. It does
 * not resolve anchors, aliases or merge keys — it only FLAGS them, so a
 * runner can warn instead of under-reporting. It does not decode block
 * scalars, escapes inside double-quoted scalars, tags, or multi-line flow
 * collections. It reads only the first YAML document. Nothing here validates:
 * input a real YAML parser would reject gets whatever the scanner happens to
 * find.
 *
 * WHAT STAYS WITH EACH PROVIDER. Only the lexer is shared. Every runner
 * keeps its own structural reader — the walk over `services:`, `tasks:`, or
 * `on:` — and its own diagnostics, whose wording names that runner's
 * consequences. Two runners warning about the same construct still say
 * different things about what the user loses, so those strings are not shared.
 */

/** Indent of a line, counting spaces only — YAML forbids tabs for indentation. */
export function leadingSpaces(line: string): number {
  let n = 0
  while (n < line.length && line[n] === ' ') n++
  return n
}

/**
 * Where a plain (unquoted) scalar VALUE begins on this line, or Infinity if
 * the line has none.
 *
 * A YAML plain scalar runs to the end of the line, so `&` and `*` inside one
 * are ordinary text: `command: rm -rf *tmp` contains a glob, not an alias.
 * An anchor or an alias can only appear where a node begins, which is why the
 * value's FIRST character decides — `image: *base` and `web: &base` start
 * with the indicator and are still scanned, and so is a flow collection
 * (`x: [*a, *b]`), whose interior can hold aliases. Only a value that starts
 * as a plain or quoted scalar suppresses the scan, and only from that point
 * on: the key half of the line is still scanned.
 */
export function plainScalarStart(line: string): number {
  const m = /^(?:\s*(?:-\s+)?(?:'[^']*'|"[^"]*"|[^-'"#:\s][^:]*?)\s*:(?:\s+|$)|\s*-\s+)/.exec(line)
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
 * One line, comment-stripped, flagging any anchor/alias/merge-key it saw
 * outside a quoted string.
 *
 * The `plainScalarStart` guard only ever removes false positives — the `&`/`*`
 * in `command: rm -rf *tmp` — because a real anchor or alias sits at the start
 * of a node, which is before `plainScalarStart` by construction.
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
 * A block scalar header — `|` or `>` with an optional explicit indentation
 * digit and chomping indicator, IN EITHER ORDER (`|`, `>-`, `|2`, `>-3`,
 * `|-2`). YAML permits both orders, and files in the wild use both.
 *
 * One source of truth for both readers of it: `unquoteValue`, which must not
 * return a header as if it were a value, and `opensBlockScalar`, which uses
 * it to know the following lines are literal text.
 */
export const BLOCK_SCALAR_VALUE = /^[|>](?:[0-9]*[+-]?|[+-]?[0-9]*)$/

/**
 * The line ends in a block scalar header, so what follows it is literal text.
 *
 * Runs on a line whose comment has ALREADY been stripped by `scanLine` — the
 * contract `prepass` establishes, and why there is no `(?:#.*)?` tail here.
 * Matches a bare `key: |` at end of line, a `- run: |-` sequence item, and
 * `key: |2`.
 *
 * The regex is UNANCHORED and so matches at the LAST `:` on the line:
 * `opensBlockScalar("run: echo a: |")` is `true`. That input is not valid YAML
 * and no runner's answer changes, but this is not an exact header test.
 */
export function opensBlockScalar(line: string): boolean {
  const m = /(?::|^\s*-)\s+(\S+)\s*$/.exec(line)
  return m !== null && BLOCK_SCALAR_VALUE.test(m[1] ?? '')
}

/**
 * Trim and strip one matched pair of surrounding quotes. Escapes inside a
 * double-quoted scalar are not decoded: `'It''s CI'` yields `It''s CI`.
 *
 * Always returns a string, so it suits a flow-collection entry, where an
 * empty entry is still an entry. Use `unquoteValue` for a mapping value,
 * where empty and "block scalar header" both have to read as absent.
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
 * one. Empty is undefined, and so is a block scalar header: this module does
 * not decode block scalars, and returning `|` or `|2` as a `desc:` would be a
 * wrong value rather than a missing one.
 */
export function unquoteValue(raw: string): string | undefined {
  const t = raw.trim()
  if (t === '' || BLOCK_SCALAR_VALUE.test(t)) return undefined
  return unquote(t)
}

/**
 * A `key: value` line at a known indent, quoted or bare key, list items
 * excluded. The value half is deliberately permissive about `:` so that
 * `image: nginx:alpine` yields the whole tag.
 */
export function matchKey(line: string, indent: number): { key: string; value: string } | null {
  const content = line.slice(indent)
  if (content.startsWith('-')) return null
  let m = /^'([^']*)'\s*:\s*(.*)$/.exec(content)
  if (m) return { key: m[1] ?? '', value: m[2] ?? '' }
  m = /^"([^"]*)"\s*:\s*(.*)$/.exec(content)
  if (m) return { key: m[1] ?? '', value: m[2] ?? '' }
  m = /^([^:\s][^:]*?)\s*:\s*(.*)$/.exec(content)
  if (m) return { key: (m[1] ?? '').trim(), value: m[2] ?? '' }
  return null
}

/**
 * A document separator (`---`) or end marker (`...`), at column zero only.
 *
 * Deliberately wider than `line.trim() === "---"`, which misses three real
 * cases: `--- # switching documents` (a marker with a trailing comment),
 * `--- foo` (a marker with trailing content), and `...` in any form. Each miss
 * makes the reader run past the end of the first document and report keys from
 * the second as if they belonged to the first — a wrong answer, where stopping
 * early is merely an incomplete one the runner already warns about. The
 * column-zero requirement is what keeps an indented `---` inside a
 * `command: |` from tripping this; `prepass` never even offers such a line.
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
  /** This line is the BODY of a block scalar, and so was never scanned. */
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
   * A document separator was found with a further document behind it, so that
   * document was dropped. False for a trailing `---`/`...` followed only by
   * blank lines or comments: the input is truncated there too, but nothing is
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
 * A block scalar's body is BLANKED rather than passed through. Its content is
 * literal text — a `---`, an `&anchor`, a `<<:`, a `#` inside a `run: |` are
 * all just characters — so blanking is what makes each of those impossible to
 * misread. A blank line cannot be mistaken for structure, cannot raise a
 * false anchor warning, and cannot look like a document separator. The lines
 * still occupy their index, so `lines` stays parallel to the file.
 */
export function prepass(text: string): Prepass {
  // A leading BOM first. JS `\s` matches U+FEFF, so the byte binds to the
  // first key: a BOM'd `services:` never matches `services`, and the whole
  // file reads as empty with nothing to report. Written as the escape rather
  // than a literal byte, per `scripts/guard-control-chars.ts`.
  const rawLines = text.replace(/^\uFEFF/, '').split(/\r?\n/)

  const lines: string[] = []
  const scanned: ScannedLine[] = []
  let anchor = false
  let merge = false
  let multiDoc = false
  // Whether any retained line carried document content. This is the whole
  // opener-versus-separator decision: the opener line is itself retained and
  // its `cleaned` is `"---"`, which sets `sawContent` below, so a second `---`
  // always finds content already seen and reads as a separator. A `%YAML` or
  // `%TAG` directive is the one exception that must NOT set it; see there.
  let sawContent = false

  // Block scalar extent. `headerIndent` is the indent of the line carrying the
  // header; `contentIndent` is the indent of the scalar's first non-blank
  // line, which fixes the level the rest of the body must hold.
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
      // Dedented out of the scalar: it ends here, and THIS line is ordinary
      // YAML, reconsidered in place below.
      //
      // The `contentIndent` test is STRICTER than a bare `indent >
      // headerIndent`, not more precise. They differ only for a line
      // indented between the header and the content indent, which real YAML
      // rejects outright ("a leading all-space line must not have too many
      // spaces"); treating it as the end of the scalar keeps the following
      // structure readable instead of swallowing the rest of the mapping.
      //
      // KNOWN LIMITATION. `contentIndent` is always inferred from the first
      // body line, even when the header carried an explicit indentation
      // indicator. `BLOCK_SCALAR_VALUE` was widened to ACCEPT `|2`, but the
      // `2` — which declares the content indent, and is the whole reason the
      // indicator exists — is then ignored here. The indicator is recognised,
      // not honoured. For a body whose first line is indented deeper than the
      // indicator declares, the inferred extent is wrong.
      headerIndent = -1
      contentIndent = -1
    }

    // `---` before any document CONTENT is the directives-end marker opening
    // the FIRST document, not a separator. Deciding that on content rather
    // than on line index is what lets a file open with a comment header, a
    // blank line, or a `%YAML` directive — none of which set `sawContent` —
    // and still have its `---` read as the opener. A second `---` always
    // separates, because the retained opener line sets `sawContent` itself.
    // `...` is never an opener: it ends a document rather than starting one.
    //
    // KNOWN LIMITATION. A mapping opened ON the marker line (`--- services:`)
    // is invisible: the line is retained as `"--- services:"`, which
    // `matchKey` rejects for starting with `-`, so the key is never seen.
    if (isDocumentMarker(raw)) {
      const opener = raw.startsWith('---') && !sawContent
      if (!opener) {
        // Truncate here either way — nothing past a separator is read. But say
        // a later document EXISTS only if one does: a trailing `---` or `...`
        // with nothing but blank lines after it closes the single document
        // this file declares, and the reader read all of it. Claiming content
        // was dropped there would be a diagnostic asserting the opposite of
        // what happened.
        //
        // The test runs on the CLEANED line, not the raw one: a tail of
        // comments is not a document, and reporting one as dropped is the
        // same false diagnostic in a different shape.
        multiDoc = rawLines.slice(i + 1).some((rest) => scanLine(rest).cleaned.trim() !== '')
        break
      }
    }

    const line = scanLine(raw)
    if (line.anchor) anchor = true
    if (line.merge) merge = true
    lines.push(line.cleaned)
    scanned.push({ ...line, blockScalar: false })
    // A `%YAML`/`%TAG` directive is retained like any other line but is not
    // document CONTENT: a directive is precisely what YAML permits ahead of a
    // directives-end marker, and is what that marker's name refers to. Letting
    // it set `sawContent` would make the `---` it introduces read as a
    // separator and cost the whole file.
    if (line.cleaned.trim() !== '' && !line.cleaned.startsWith('%')) sawContent = true

    if (opensBlockScalar(line.cleaned)) {
      headerIndent = leadingSpaces(raw)
      contentIndent = -1
    }
  }

  // `anchor` and `merge` cover the RETAINED lines only. What sits past a
  // document separator was never read, so it cannot qualify what was.
  return { lines, scanned, anchor, merge, multiDoc }
}
