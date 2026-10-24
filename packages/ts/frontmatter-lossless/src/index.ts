/**
 * Byte-exact Markdown frontmatter framing.
 *
 * A note is `---`-fenced YAML frontmatter followed by a body. This module
 * splits the two and joins them again without changing any byte the author
 * wrote. The YAML text comes back as written (without the fences), and
 * {@link compose} rebuilds the original file exactly: the same BOM, the same
 * `\n` or `\r\n` fences, and the same ending.
 *
 * No YAML parsing, no file system, no dependencies: plain ES2022 string
 * handling. Reading the frontmatter's values is a job for a YAML parser. This
 * module only finds where the block is and puts it back.
 *
 * It is the TypeScript version of the `frontmatter-lossless` Rust crate. It
 * follows the crate's algorithm function for function (`split`, `compose`,
 * `split_lenient`), and both run one shared conformance corpus.
 *
 * It handles three cases that real notes contain:
 *
 * - **BOM.** Some Windows editors start a note with `\uFEFF---`. The split
 *   recognises the BOM and records it, so a later write can restore it.
 * - **CRLF.** The `\r` stays in the YAML slice, so callers see the exact text.
 *   {@link compose} rebuilds `---\r\n` fences rather than rewriting them to
 *   `---\n`, which would change every line of the file in a diff.
 * - **A missing or malformed closing fence is not an error.** An unterminated
 *   block is read as body, so code that reads thousands of notes keeps going
 *   instead of stopping at one bad note.
 *
 * @module @osdlc/frontmatter-lossless
 */

/**
 * Line ending after the opening `---` fence. A closed set. A new member would
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
 * Without it, a writer that edits the values carefully can still write `---\n`
 * fences over a file whose fences were `---\r\n`. Then every line of the note
 * shows as changed in git. The fences have to be kept too.
 *
 * Take it from {@link split} and pass it back to {@link compose}. For a new
 * note with no source text, take it from {@link newShape}. Do not build one by
 * hand. A minor release may add a field, which would break an object literal
 * typed as `NoteShape`.
 */
export interface NoteShape {
  /** The byte-order mark, if the file had one. */
  readonly bom: boolean
  /** Line ending of the opening fence. */
  readonly openEol: OpenEol
  /** Line ending of the closing fence, empty when the note ends at it. */
  readonly closeEol: CloseEol
  /** Whether the `\n` between the block's content and the closing `---` is
   *  present. True for every block except the empty one with no line between
   *  the fences (`---\n---`), where the closing fence directly follows the
   *  opening fence's newline. It is a separate field because {@link Split.yaml}
   *  alone cannot tell that block from one that holds only a blank line
   *  (`---\n\n---`). Both give `""`, but only the second has a separator byte
   *  to restore. */
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
 * crate's offsets are UTF-8 byte offsets. Each side indexes its own string
 * type. The shared corpus checks the content, not the offsets.)
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
   *  and `body` the whole text, as for a note with no block, so a reader of
   *  many notes keeps going. A caller that requires valid frontmatter can read
   *  this to report the note as malformed instead. `false` otherwise.
   *  Optional so a `Split` built by hand, such as a test fake, still
   *  type-checks. {@link split} always sets it. */
  readonly unterminated?: boolean | undefined
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
 * Anything else, including a missing closing fence, is body. A missing
 * closing fence also sets {@link Split.unterminated}. A leading BOM is part of
 * the framing: it is recorded in {@link Split.shape} and left out of both
 * `yaml` and `body`.
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
 * Rebuild a note from a frontmatter block (possibly edited) and a body. This is
 * the exact inverse of {@link split}.
 *
 * `frontmatter` mirrors {@link Split.yaml}: `null` is a note with no block
 * (just the body, after any BOM), `""` is an empty `---` / `---` block, and
 * text is a block with content. Passing `split(src).yaml` straight back
 * reproduces `src` byte for byte for every shape.
 */
export function compose(frontmatter: string | null, body: string, shape: NoteShape): string {
  let out = shape.bom ? BOM : ''
  if (frontmatter === null) {
    // No block: the document is its body, after the BOM if there is one.
    return out + body
  }
  out += '---' + shape.openEol
  out += frontmatter
  // Restore the separator that split removed before the closing fence: a
  // single `\n`. (Under CRLF the block ends in a bare `\r`, so `\n`, not
  // `openEol`, rebuilds the original text.) The recorded shape decides this,
  // not the yaml text: a block that ends in a blank line ends with `\n` and
  // still had a separator after it. Only empty YAML can leave it out. Text
  // written into a shape taken from an empty `---\n---` block still needs its
  // own line before the closing fence.
  if (shape.closeSep || frontmatter !== '') out += '\n'
  // A shape from a file that ended at its closing fence has no line ending
  // there. A new body still needs one, so use the opening fence's.
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
 * An empty `yaml` gives `---\n\n---\n`. The separator before the closing
 * fence is kept, so the block holds one blank line. It round-trips through
 * {@link split}.
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
 * A tolerant, read-only frontmatter read for input that may be loosely
 * written.
 *
 * {@link split} is strict and lossless, and is the one to use before a write.
 * This function also accepts things hand-written notes often contain and a
 * reader can safely ignore: a leading BOM, blank lines or indentation before
 * the opening fence, and trailing whitespace on the `---` fence lines. The
 * closing fence must not be indented. It returns `{ yaml, body }`, or `null`
 * when there is no block (where {@link split} gives a result with
 * `yaml: null`). It records no framing, so its result cannot be written back
 * exactly. Use it to read, never to rewrite. A fence still closes only on
 * `---` alone on its line (trailing whitespace aside), so a `---heading` in
 * the body does not end the block.
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
// JavaScript's `trimStart`/`trimEnd` also strip U+FEFF (so a BOM inside the
// leading spaces would be lost) and miss U+0085 NEL. So this code trims the
// same characters the Rust crate does.
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
