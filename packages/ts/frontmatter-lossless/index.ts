/**
 * Byte-exact Markdown frontmatter framing.
 *
 * A note is `---`-fenced YAML frontmatter followed by a body. This module
 * splits the two and recomposes them without touching a single byte the
 * author wrote: the YAML text comes back verbatim (fences excluded), and
 * {@link compose} rebuilds the original file exactly — same BOM, same `\n` vs
 * `\r\n` fences, same trailing state.
 *
 * No YAML parsing, no file system, no dependencies: plain ES2022 string
 * handling. Reading the frontmatter's *values* is a job for a YAML parser; this
 * module only finds where the block is and puts it back.
 *
 * It is the TypeScript twin of the `frontmatter-lossless` Rust crate. It
 * follows the crate's algorithm function for function (`split`, `compose`,
 * `split_lenient`), and both run one shared conformance corpus.
 *
 * Three tolerances, each one a bug someone has already hit:
 *
 * - **BOM.** Notes written by some Windows editors start `\uFEFF---`. The
 *   split recognises and remembers it so a later write can restore it.
 * - **CRLF.** The `\r` stays attached to the YAML slice, so callers see the
 *   exact text and {@link compose} rebuilds `---\r\n` fences rather than
 *   silently rewriting them to `---\n` and churning the whole file in a diff.
 * - **A missing or malformed terminator is not an error.** An unterminated
 *   block is simply body: a projection over thousands of notes must degrade,
 *   never abort.
 *
 * @module @osdlc/frontmatter-lossless
 */

/**
 * Line ending after the opening `---` fence. A closed set: a new member would
 * be a major release, so an exhaustive `switch` over it is safe.
 */
export type OpenEol = '\n' | '\r\n'

/**
 * Line ending after the closing `---` fence. Empty when the file ended there.
 * A closed set, like {@link OpenEol}.
 */
export type CloseEol = '' | '\n' | '\r\n'

/**
 * Everything about a note's framing that a writer has to put back exactly.
 *
 * It exists because reassembling a note is where byte fidelity quietly dies:
 * the *values* survive a careful splice and then `---\n` gets written over a
 * file whose fences were `---\r\n`, and now every line of the note shows as
 * changed in git. The fences are data too.
 *
 * Take it from {@link split} and pass it back to {@link compose}, or, for a
 * new note with no source text, from {@link newShape}. Do not build one by
 * hand: a minor release may add a field, which would break an object literal
 * typed as `NoteShape`.
 */
export interface NoteShape {
  /** The byte-order mark, if the file had one. */
  readonly bom: boolean
  /** Line ending of the opening fence. */
  readonly openEol: OpenEol
  /** Line ending of the closing fence, empty when the note ends at it. */
  readonly closeEol: CloseEol
  /** Whether the `\n` separating the block's content from the closing `---`
   *  is present. True for every block except the adjacent-fence empty one
   *  (`---\n---`), where the closing fence directly follows the opener's
   *  newline. It is a separate bit because {@link Split.yaml} alone cannot
   *  distinguish that block from a blank-line-only one (`---\n\n---`): both
   *  yield `""`, but only the latter has a separator byte to restore. */
  readonly closeSep: boolean
}

/** A half-open index range `[start, end)` into the source string. */
export interface SourceRange {
  readonly start: number
  readonly end: number
}

/**
 * A note split into its parts, with offsets into the original source.
 *
 * Offsets are JavaScript string indices (UTF-16 code units), so
 * `src.slice(yamlRange.start, yamlRange.end) === yaml` and
 * `src.slice(bodyStart) === body` hold on the string you passed in. (The Rust
 * crate's offsets are UTF-8 byte offsets; each side indexes its own native
 * representation — the *content* invariants are what the shared corpus pins.)
 */
export interface Split {
  /** The frontmatter YAML, verbatim and without the `---` fences. `null`
   *  when the note has no frontmatter block at all. */
  readonly yaml: string | null
  /** Range of `yaml` within the source (empty when `yaml` is `null`). */
  readonly yamlRange: SourceRange
  /** Everything after the closing fence. */
  readonly body: string
  /** Offset of `body` within the source. */
  readonly bodyStart: number
  /** The framing to restore when writing this note back. */
  readonly shape: NoteShape
  /** `true` when the note opens a frontmatter block that never closes: it
   *  starts with a valid opening fence (`---` and a line break, after an
   *  optional BOM) and no closing `---` line follows. `yaml` is still `null`
   *  and `body` the whole text, as for a note with no block, so a projection
   *  keeps going; a caller that holds authored notes to a contract can read
   *  this to report the note as malformed instead. `false` otherwise. */
  readonly unterminated: boolean
}

/** Options for {@link newShape}. */
export interface NewShapeOptions {
  /** Line ending of both fences. Default `'\n'`. */
  readonly eol?: OpenEol | undefined
  /** Whether the note starts with a byte-order mark. Default `false`. */
  readonly bom?: boolean | undefined
}

/** The result of a tolerant read-only split: see {@link splitLenient}. */
export interface LenientSplit {
  /** The text between the fence lines, without the line break before the
   *  closing fence. */
  readonly yaml: string
  /** Everything after the closing fence line. */
  readonly body: string
}

const BOM = '\uFEFF'

/**
 * Split a note into its frontmatter YAML and body.
 *
 * Frontmatter is recognised only when the document begins with `---\n` (or
 * `---\r\n`, or either after a BOM) and is closed by `---` alone on a line.
 * Anything else — including a missing terminator — is body; a missing
 * terminator also sets {@link Split.unterminated}. A leading BOM is
 * framing: it is recorded in {@link Split.shape} and excluded from both
 * `yaml` and `body`, never duplicated into the content.
 */
export function split(src: string): Split {
  const bom = src.startsWith(BOM)
  const rest = bom ? src.slice(BOM.length) : src
  const offset = bom ? BOM.length : 0

  const noFrontmatter = (unterminated: boolean): Split => ({
    yaml: null,
    yamlRange: { start: 0, end: 0 },
    body: rest,
    bodyStart: offset,
    shape: { bom, openEol: '\n', closeEol: '\n', closeSep: true },
    unterminated,
  })

  let afterMarker: string
  let markerLen: number
  let openEol: OpenEol
  if (rest.startsWith('---\n')) {
    afterMarker = rest.slice(4)
    markerLen = 4
    openEol = '\n'
  } else if (rest.startsWith('---\r\n')) {
    afterMarker = rest.slice(5)
    markerLen = 5
    openEol = '\r\n'
  } else {
    return noFrontmatter(false)
  }
  const yamlStart = offset + markerLen

  // Empty frontmatter: the closing fence sits directly after the opener.
  for (const [fence, len, closeEol] of [
    ['---\n', 4, '\n'],
    ['---\r\n', 5, '\r\n'],
  ] as const) {
    if (afterMarker.startsWith(fence)) {
      return {
        yaml: '',
        yamlRange: { start: yamlStart, end: yamlStart },
        body: afterMarker.slice(len),
        bodyStart: yamlStart + len,
        shape: { bom, openEol, closeEol, closeSep: false },
        unterminated: false,
      }
    }
  }
  if (afterMarker === '---') {
    return {
      yaml: '',
      yamlRange: { start: yamlStart, end: yamlStart },
      body: '',
      bodyStart: src.length,
      shape: { bom, openEol, closeEol: '', closeSep: false },
      unterminated: false,
    }
  }

  let searchStart = 0
  for (;;) {
    const found = afterMarker.indexOf('\n---', searchStart)
    // An opening fence with no closing one.
    if (found === -1) return noFrontmatter(true)
    const dashesStart = found + 1
    const afterDashes = dashesStart + 3
    const yamlLen = found
    let bodyRel: number
    let closeEol: CloseEol
    if (afterDashes >= afterMarker.length) {
      bodyRel = afterMarker.length
      closeEol = ''
    } else if (afterMarker[afterDashes] === '\n') {
      bodyRel = afterDashes + 1
      closeEol = '\n'
    } else if (afterMarker[afterDashes] === '\r' && afterMarker[afterDashes + 1] === '\n') {
      bodyRel = afterDashes + 2
      closeEol = '\r\n'
    } else {
      // `\n---foo` is not a terminator; keep looking.
      searchStart = afterDashes
      continue
    }
    return {
      yaml: afterMarker.slice(0, yamlLen),
      yamlRange: { start: yamlStart, end: yamlStart + yamlLen },
      body: afterMarker.slice(bodyRel),
      bodyStart: yamlStart + bodyRel,
      shape: { bom, openEol, closeEol, closeSep: true },
      unterminated: false,
    }
  }
}

/**
 * Reassemble a note from a (possibly spliced) frontmatter block and a body —
 * the exact inverse of {@link split}.
 *
 * `frontmatter` mirrors {@link Split.yaml}: `null` is a note with no block
 * (just the body, after any BOM), `""` is an empty `---` / `---` block, and
 * text is a block with content. Handing `split(src).yaml` straight back
 * reproduces `src` byte for byte for every shape.
 */
export function compose(frontmatter: string | null, body: string, shape: NoteShape): string {
  let out = shape.bom ? BOM : ''
  if (frontmatter === null) {
    // No block: the document is just its body (which the BOM, if any, now
    // prefixes exactly once).
    return out + body
  }
  out += '---' + shape.openEol
  out += frontmatter
  // Restore the separator the split consumed while finding the terminator —
  // a single `\n` (under CRLF the block ends in a bare `\r`, so `\n`, not
  // `openEol`, rebuilds the original text). It is driven by the recorded
  // shape, never inferred from the yaml text: a block ENDING in a blank
  // line legitimately ends with `\n` and still had a separator after it.
  // Only empty YAML can omit it: text written into a shape taken from an
  // empty `---\n---` block still needs its own line before the closing fence.
  if (shape.closeSep || frontmatter !== '') out += '\n'
  // A shape from a file that ended at its closing fence has no line ending
  // there; a new body still needs one, so borrow the opening fence's.
  out += '---' + (shape.closeEol === '' && body !== '' ? shape.openEol : shape.closeEol) + body
  return out
}

/**
 * The shape for a new note, one with no source text to {@link split}: both
 * fences end in `eol` and the closing fence has its line ending. It stays
 * valid when {@link NoteShape} gains fields, which an object literal would
 * not.
 *
 * `compose(yaml, body, newShape())` gives `---\n<yaml>\n---\n<body>`. The
 * `yaml` argument is the text between the fences as {@link split} returns
 * it: without the line break before the closing fence. A YAML serializer's
 * output usually ends in one, so drop it first, or the block ends in a
 * blank line. With `eol: '\r\n'`, `compose` writes the fences as CRLF and
 * the yaml text keeps its own line endings, so end its lines in `\r\n` and
 * the text itself in `\r`, as {@link split} returns a CRLF block.
 *
 * @example
 * ```ts
 * compose('title: A', '# A\n', newShape()) // '---\ntitle: A\n---\n# A\n'
 * ```
 */
export function newShape(opts: NewShapeOptions = {}): NoteShape {
  const eol = opts.eol ?? '\n'
  return { bom: opts.bom ?? false, openEol: eol, closeEol: eol, closeSep: true }
}

/**
 * A tolerant, read-only frontmatter read for possibly-sloppy input.
 *
 * {@link split} is strict and lossless — the basis of the write path. This
 * accepts what hand-authored notes drift into and a *reader* can safely
 * ignore: a leading BOM, blank lines or indentation before the opening
 * fence, and trailing whitespace on the `---` fence lines. The closing fence
 * must not be indented. It returns `{ yaml, body }`, or `null`
 * when there is no block (where {@link split} gives a result with
 * `yaml: null`). It tracks no framing, so it is not a round trip —
 * parse with it, never rewrite. A fence still closes only on `---` alone on
 * its line (trailing whitespace aside), so a `---heading` in the body does
 * not end the block.
 */
export function splitLenient(content: string): LenientSplit | null {
  const afterBom = content.startsWith(BOM) ? content.slice(BOM.length) : content
  const start = trimStartWhitespace(afterBom)
  const nl = start.indexOf('\n')
  if (nl === -1) return null
  if (trimEndWhitespace(start.slice(0, nl)) !== '---') return null
  const rest = start.slice(nl + 1)

  let offset = 0
  while (offset < rest.length) {
    const lineNl = rest.indexOf('\n', offset)
    const lineEnd = lineNl === -1 ? rest.length : lineNl + 1
    if (trimEndWhitespace(rest.slice(offset, lineEnd)) === '---') {
      let yaml = rest.slice(0, offset)
      if (yaml.endsWith('\n')) yaml = yaml.slice(0, -1)
      if (yaml.endsWith('\r')) yaml = yaml.slice(0, -1)
      return { yaml, body: rest.slice(lineEnd) }
    }
    offset = lineEnd
  }
  return null
}

// Rust's `str::trim_start`/`trim_end` trim exactly Unicode `White_Space`.
// JavaScript's `trimStart`/`trimEnd` additionally strip U+FEFF (a BOM mid-way
// through leading spaces would silently vanish) and miss U+0085 NEL, so the
// port trims by the same character class the reference does.
const WHITESPACE_RE = /[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/

function trimStartWhitespace(s: string): string {
  let i = 0
  while (i < s.length && WHITESPACE_RE.test(s[i] as string)) i++
  return s.slice(i)
}

function trimEndWhitespace(s: string): string {
  let end = s.length
  while (end > 0 && WHITESPACE_RE.test(s[end - 1] as string)) end--
  return s.slice(0, end)
}
