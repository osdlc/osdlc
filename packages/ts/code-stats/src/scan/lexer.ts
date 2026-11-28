import { lineCommentOpens, type Language } from './language.ts'
import { FENCE } from './kinds.ts'
import type { DocstringRule } from './overlay.ts'
import type { QuoteSyntax } from './syntax.ts'

/** What one line holds, outside and inside comments and strings. */
export interface LineFacts {
  /** Code outside comments; string contents count, docstrings do not. */
  code: boolean
  comment: boolean
  doc: boolean
  /** The line with comments removed and strings kept: what boilerplate rules read. */
  codeText: string
  /** {@link codeText} with string contents removed, for counting brackets. */
  structure: string
  /** The line starts inside a string, so it cannot open a statement. */
  startsInString: boolean
  /** The line ends inside a block comment. */
  endsInComment: boolean
  /** The line holds a comment and no code but a pair of braces, as JSX's `{/* note *\/}` does. */
  bracedComment: boolean
  /** The line ends in a backslash that joins the next line to it, as in Python. */
  joinsNext: boolean
  /**
   * With {@link LexOptions.spaces}, the runs of spaces and tabs outside
   * strings and literals, in code or in a comment, as `[start, end)` offsets.
   * Each run is whole: no two runs touch.
   */
  spaces?: [number, number][]
}

export interface LexOptions {
  /** Record each line's {@link LineFacts.spaces}. */
  spaces?: boolean
}

/** Adds the runs of spaces and tabs in `line[from, to)` to `f.spaces`; neither end may cut a run (see {@link LineFacts.spaces}). */
function addSpaces(f: LineFacts, line: string, from: number, to: number): void {
  const runs = f.spaces
  if (runs === undefined) return
  for (let k = from; k < to; k += 1) {
    if (line[k] !== ' ' && line[k] !== '\t') continue
    let end = k + 1
    while (end < to && (line[end] === ' ' || line[end] === '\t')) end += 1
    runs.push([k, end])
    k = end
  }
}

const [OPEN_PAREN, OPEN_SQUARE, OPEN_CURLY, CLOSE_PAREN, CLOSE_SQUARE, CLOSE_CURLY] = [
  ...'([{)]}',
].map((c) => c.charCodeAt(0))

const BRACKET = /[()[\]{}]/

/** Brackets opened less brackets closed, in a line's {@link LineFacts.structure}. */
export function bracketDelta(structure: string): number {
  let delta = 0
  for (let k = 0; k < structure.length; k += 1) {
    const c = structure.charCodeAt(k)
    if (c === OPEN_PAREN || c === OPEN_SQUARE || c === OPEN_CURLY) delta += 1
    else if (c === CLOSE_PAREN || c === CLOSE_SQUARE || c === CLOSE_CURLY) delta -= 1
  }
  return delta
}

type Token =
  | { kind: 'line'; text: string }
  | { kind: 'block'; text: string; close: string }
  | { kind: 'quote'; text: string; quote: QuoteSyntax }
  | { kind: 'code'; text: string }

interface OpenBlock {
  open: string
  close: string
  depth: number
  doc: boolean
}

interface OpenQuote {
  quote: QuoteSyntax
  doc: boolean
  /** Brackets opened inside a string whose bracket nests. */
  depth: number
  /** Sticky: a run of the string's text, up to where it may end, escape, nest or interpolate. */
  run: RegExp
}

/** Code inside a string, from an interpolation's opener to its close. */
interface Interpolation {
  /** The string to go back to. */
  within: OpenQuote
  /** The opener's bracket, which nests, and the bracket that closes the code. */
  open: string
  close: string
  depth: number
}

type Brackets = readonly (readonly [string, string])[]

/** What the lexer precomputes for one language. */
interface LexTables {
  /** Openers by first character, longest first, so `--[[` wins over `--` and `r#"` over `r"`. */
  openers: Map<string, Token[]>
  /**
   * Sticky: a run of plain code, up to a character where something else may
   * start (an opener, a literal, whitespace, a template's brace).
   */
  plainRun: RegExp
  /** The language's heredoc opener, sticky. */
  heredoc: RegExp | null
  /** The code a percent literal or a regular expression may hold, as a `"` string's. */
  interpolation: Brackets | undefined
  /** A regular expression that goes on past its line, where strings may. */
  regex: QuoteSyntax
  /** {@link OpenQuote.run} by quote. */
  stringRuns: WeakMap<QuoteSyntax, RegExp>
}

const NO_TOKENS: readonly Token[] = []

/** Where a statement that has been nothing but docstrings so far began. */
interface DocstringStart {
  line: number
  /** The length of the line's {@link LineFacts.codeText} before it: a header's, not the docstring's. */
  codeBefore: number
}

/**
 * Where a language's {@link DocstringRule} stands: which statement is under
 * way and whether a docstring may open it.
 */
interface Statements {
  rule: DocstringRule
  /** Brackets open at the end of the line before. */
  depth: number
  /**
   * Brackets opened, less those closed, in the line's code so far: counted
   * as the code is read, not from the whole {@link LineFacts.structure}.
   */
  brackets: number
  /** The line starts a statement: the line before did not go on into it. */
  starts: boolean
  /** The next statement to start is the first of the module or of an owner's body. */
  first: boolean
  /** The statement under way is an owner's header, which a `:` ends. */
  header: boolean
  docstring: DocstringStart | null
}

/** The code on line `n` since the docstring under way began, trimmed. */
function codeSinceDocstring(start: DocstringStart, n: number, f: LineFacts): string {
  return (n === start.line ? f.codeText.slice(start.codeBefore) : f.codeText).trim()
}

/** `code`, less trailing space, ends in `:`; read without trimming, as it is read often. */
function endsWithColon(code: string): boolean {
  let k = code.length - 1
  while (code[k] === ' ' || code[k] === '\t') k -= 1
  return code[k] === ':'
}

/**
 * Whether a docstring may open at this point of line `n`: as the first
 * statement of a body, with nothing before it on its line or, on an owner's
 * header line, nothing after the `:` that ends the header; or as a further
 * string of a docstring under way, with nothing but space between.
 */
function docstringOpensHere(st: Statements, n: number, f: LineFacts): boolean {
  if (st.docstring !== null) return codeSinceDocstring(st.docstring, n, f) === ''
  if (!f.code) return st.starts && st.first
  if (st.depth + st.brackets !== 0 || !endsWithColon(f.codeText)) return false
  return st.starts ? st.rule.owners.test(f.codeText.trimStart()) : st.header
}

/**
 * A statement that opened as a docstring turned out to go on as code, as
 * `"""…""".strip()` does: its lines, up to line `n`, are code.
 */
function undoDocstring(
  start: DocstringStart,
  lines: readonly string[],
  facts: LineFacts[],
  n: number,
  f: LineFacts,
): void {
  for (let k = start.line; k <= n; k += 1) {
    const g = k === n ? f : facts[k]!
    g.doc = false
    g.code = true
    // Only the boilerplate rules read it, and a line led by a string is
    // neither an import nor punctuation.
    g.codeText = lines[k]!
  }
}

/** Updates `st` at the end of line `n`, and the facts of a docstring that turned out to be code. */
function endStatementLine(
  st: Statements,
  lines: readonly string[],
  facts: LineFacts[],
  n: number,
  f: LineFacts,
  inString: boolean,
): void {
  const start = st.docstring
  if (start !== null) {
    const after = codeSinceDocstring(start, n, f)
    if (after === '\\') {
      // A line continuation between the strings, or after the last, is no code of its own.
      f.code = n === start.line && f.codeText.slice(0, start.codeBefore).trim() !== ''
    } else if (after !== '') {
      undoDocstring(start, lines, facts, n, f)
      st.docstring = null
    }
  }
  if (st.starts && f.code) {
    // A statement's line starts with its code.
    st.header = st.rule.owners.test(lines[n]!.trimStart())
    st.first = false
  }
  st.depth = Math.max(0, st.depth + st.brackets)
  st.brackets = 0
  st.starts = st.depth === 0 && !f.joinsNext && !inString
  if (st.starts) {
    // A header's `:` ends its line, or the body follows on it.
    if (st.header) st.first = st.docstring === null && endsWithColon(f.codeText)
    st.header = false
    st.docstring = null
  }
}

const tablesCache = new WeakMap<Language, LexTables>()

function tablesOf(language: Language): LexTables {
  const cached = tablesCache.get(language)
  if (cached !== undefined) return cached
  const openers = new Map<string, Token[]>()
  const tokens: Token[] = [
    ...language.lineComments.map((text): Token => ({ kind: 'line', text })),
    ...language.blockComments.map(([text, close]): Token => ({ kind: 'block', text, close })),
    ...language.quotes.map((quote): Token => ({ kind: 'quote', text: quote.start, quote })),
    ...language.codeTokens.map((text): Token => ({ kind: 'code', text })),
  ]
  for (const t of tokens
    .filter((t) => t.text !== '')
    .sort((a, b) => b.text.length - a.text.length)) {
    const list = openers.get(t.text[0]!)
    if (list === undefined) openers.set(t.text[0]!, [t])
    else list.push(t)
  }
  const { syntax, heredoc } = language
  const interpolation = language.quotes.find((q) => q.start === '"')?.interpolation
  const stops = [
    ' \t',
    ...openers.keys(),
    // An interpolation's brackets, which nest inside it and close it.
    ...language.quotes.flatMap((q) => q.interpolation ?? []).map(([o, c]) => o.at(-1)! + c),
    syntax.regexLiterals ? '/' : '',
    syntax.charLiterals ? "'" : '',
    syntax.questionMarkChars ? '?' : '',
    syntax.cppRawStrings ? 'RuUL' : '',
    syntax.percentLiterals ? '%' : '',
    heredoc !== null ? '<' : '',
  ].join('')
  const tables: LexTables = {
    openers,
    plainRun: anyBut(stops),
    heredoc:
      heredoc === null ? null : new RegExp(heredoc.source.replace(/^\^/, ''), `${heredoc.flags}y`),
    interpolation,
    regex: withInterpolation({ start: '/', end: '/' }, interpolation),
    stringRuns: new WeakMap(),
  }
  tablesCache.set(language, tables)
  return tables
}

/** Sticky: a run of characters other than `chars`. */
function anyBut(chars: string): RegExp {
  return new RegExp(`[^${chars.replace(/[\\\]^-]/g, '\\$&')}]*`, 'y')
}

function stringRun(tables: LexTables, quote: QuoteSyntax, escape: string): RegExp {
  let run = tables.stringRuns.get(quote)
  if (run === undefined) {
    const stops = [
      quote.end[0],
      escape,
      ...(quote.interpolation ?? []).map(([o]) => o[0]),
      quote.nests === true ? quote.start.at(-1) : '',
    ]
    run = anyBut(stops.join(''))
    tables.stringRuns.set(quote, run)
  }
  return run
}

function interpolationAt(
  quote: QuoteSyntax,
  line: string,
  at: number,
): readonly [string, string] | undefined {
  return quote.interpolation?.find(([opener]) => line.startsWith(opener, at))
}

export function startsDocLine(line: string, at: number, markers: readonly string[]): boolean {
  return markers.some((m) => line.startsWith(m, at) && line[at + m.length] !== '/')
}

/** `/**` opens a doc block, but `/**\/` is empty and `/***` is a banner. */
export function startsDocBlock(line: string, at: number, markers: readonly string[]): boolean {
  return markers.some((m) => {
    if (!line.startsWith(m, at)) return false
    const next = line[at + m.length]
    return !m.endsWith('*') || (next !== '*' && next !== '/')
  })
}

/**
 * In most languages a one-character quote other than a backtick cannot cross
 * a line end; a {@link QuoteSyntax.singleLine} quote never does.
 */
function endsAtLineEnd(language: Language, quote: QuoteSyntax): boolean {
  if (quote.singleLine === true) return true
  return (
    !language.syntax.multilineStrings &&
    quote.start.length === 1 &&
    quote.end.length === 1 &&
    quote.start !== '`'
  )
}

/**
 * Where a `/` starts a regular expression rather than dividing, and a `%` or
 * `?` a Ruby literal: after an operator, an opener or a keyword (of
 * JavaScript or Ruby). Tested on the code before it, trimmed, and only its
 * tail: room for the longest keyword and the character before it.
 */
const BEFORE_REGEX =
  /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|void|in|of|delete|throw|yield|await|when|if|elsif|unless|while|until|and|or|not|then|else|do))$/
const BEFORE_REGEX_TAIL = 7

function atExpressionStart(before: string): boolean {
  return BEFORE_REGEX.test(before.trimEnd().slice(-BEFORE_REGEX_TAIL))
}

/** A Ruby percent literal's opening: `%w[`, `%r{`, `%(`; not `%=`. */
const PERCENT_LITERAL = /%([qQwWiIrsx]?)([^\w\s=])/y
const CLOSING_BRACKET: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}', '<': '>' }
/** Percent literals that hold no interpolation: `%q`, `%w`, `%i`, `%s`. */
const PLAIN_PERCENT = /^[qwis]$/

/** The length of a regex literal at `at`, or 0 when the line holds none there. */
function regexLength(line: string, at: number): number {
  let inClass = false
  for (let i = at + 1; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '\\') i += 1
    else if (ch === '[') inClass = true
    else if (ch === ']') inClass = false
    else if (ch === '/' && !inClass) {
      REGEX_FLAGS.lastIndex = i + 1
      REGEX_FLAGS.test(line)
      return REGEX_FLAGS.lastIndex - at
    }
  }
  return 0
}

const REGEX_FLAGS = /[a-z]*/y

/** `'a'` or `'\n'`, so that a quote inside one opens no string; a Rust lifetime `'a` is no literal. */
const CHAR_LITERAL = /'(?:\\(?:u\{[0-9a-fA-F]{1,6}\}|x[0-9a-fA-F]{2}|.)|[^'\\])'/uy

/** Ruby's `?a`, `?'` or `?\n`: one character, not the start of a word. */
const QUESTION_CHAR = /\?(?:\\.|[^\s\\])(?!\w)/y

/** A C++ raw string's opening, `R"delim(`, with its optional encoding prefix. */
const CPP_RAW_STRING = /(?:u8|u|U|L)?R"([^()\\\s]{0,16})\(/y
const CSHARP_RAW_STRING = /"{3,}/y

const BRACES_ONLY = /^\s*\{\s*\}\s*$/

/**
 * A heredoc body runs to a line holding its word, indented or not (as `<<-`
 * and `<<~` allow), and perhaps followed by `;`, `,` or `)`, as PHP's `EOT;`.
 */
function endsHeredoc(line: string, word: string): boolean {
  const t = line.trim()
  return t === word || (t.startsWith(word) && /^[;,)]/.test(t.slice(word.length)))
}

/** A heredoc opener's word: its last capture that matched. */
function heredocWord(opener: RegExpExecArray): string {
  for (let k = opener.length - 1; k > 0; k -= 1) if (opener[k] !== undefined) return opener[k]!
  return opener[0]
}

/** Where a word may start, so a shell's `#` may open a comment. */
const WORD_BREAK = /[\s;&|()<>]/

/** Per-line facts for a whole file, tracking comments and strings across lines. */
export function lexLines(
  language: Language,
  lines: readonly string[],
  options: LexOptions = {},
): LineFacts[] {
  const tables = tablesOf(language)
  const { openers, plainRun, heredoc: heredocOpener } = tables
  const escape = language.escape ?? '\\'
  const { syntax } = language
  let block: OpenBlock | null = null
  let quote: OpenQuote | null = null
  let fence = ''
  /** The strings an interpolation left open, innermost last. */
  const templates: Interpolation[] = []
  /** The words that end the heredocs whose bodies come next, in order. */
  let heredocs: string[] = []
  let heredocsNext: string[] = []
  /**
   * With no docstring rule, whether one may open on this line: see
   * Overlay.docstrings in overlay.ts.
   */
  let docStringAllowed = true
  const statements: Statements | null =
    language.docstrings === null
      ? null
      : {
          rule: language.docstrings,
          depth: 0,
          brackets: 0,
          starts: true,
          first: true,
          header: false,
          docstring: null,
        }
  const facts: LineFacts[] = []
  const openQuote = (q: QuoteSyntax, doc: boolean): OpenQuote => ({
    quote: q,
    doc,
    depth: 0,
    run: stringRun(tables, q, escape),
  })

  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n]!
    const f: LineFacts = {
      code: false,
      comment: false,
      doc: false,
      codeText: '',
      structure: '',
      startsInString: quote !== null || heredocs.length > 0,
      endsInComment: false,
      bracedComment: false,
      joinsNext: false,
    }
    if (options.spaces === true) f.spaces = []
    if (heredocs.length > 0) {
      if (endsHeredoc(line, heredocs[0]!)) heredocs.shift()
      f.code = line.trim() !== ''
      f.codeText = line
      facts.push(f)
      continue
    }
    const fenceMark = syntax.fencedCode ? FENCE.exec(line)?.[1] : undefined
    if (fenceMark !== undefined) {
      if (fence === '') fence = fenceMark
      else if (fenceMark[0] === fence[0] && fenceMark.length >= fence.length) fence = ''
    }
    let i = 0
    scan: while (i < line.length) {
      if (block !== null) {
        const b = block
        if (syntax.blockCommentLines) {
          if (i === 0 && line.startsWith(b.close)) block = null
          f[b.doc ? 'doc' : 'comment'] = true
          addSpaces(f, line, i, line.length)
          break
        }
        if (language.nestedBlocks && line.startsWith(b.open, i)) {
          b.depth += 1
          i += b.open.length
        } else if (line.startsWith(b.close, i)) {
          b.depth -= 1
          i += b.close.length
          if (b.depth === 0) block = null
        } else if (line[i] === ' ' || line[i] === '\t') {
          let j = i + 1
          while (line[j] === ' ' || line[j] === '\t') j += 1
          addSpaces(f, line, i, j)
          i = j
          continue
        } else {
          // Skip to the comment's close, or a nested open, recording only its spaces.
          const close = line.indexOf(b.close, i + 1)
          const open = language.nestedBlocks ? line.indexOf(b.open, i + 1) : -1
          const to = Math.min(close < 0 ? line.length : close, open < 0 ? line.length : open)
          addSpaces(f, line, i, to)
          i = to
        }
        f[b.doc ? 'doc' : 'comment'] = true
        continue
      }

      if (quote !== null) {
        const q = quote
        let piece: string
        const code = interpolationAt(q.quote, line, i)
        if (q.quote.raw !== true && line[i] === escape) {
          piece = line.slice(i, i + 2)
        } else if (code !== undefined) {
          templates.push({ within: q, open: code[0].at(-1)!, close: code[1], depth: 0 })
          quote = null
          f.code = true
          f.codeText += code[0]
          f.structure += '"'
          i += code[0].length
          continue
        } else if (q.quote.doubledEnd === true && line.startsWith(q.quote.end.repeat(2), i)) {
          piece = q.quote.end.repeat(2)
        } else if (line.startsWith(q.quote.end, i)) {
          piece = q.quote.end
          if (q.depth > 0) q.depth -= 1
          else {
            quote = null
            if (!q.doc) f.structure += '"'
          }
        } else if (q.quote.nests === true && line[i] === q.quote.start.at(-1)) {
          piece = line[i]!
          q.depth += 1
        } else {
          q.run.lastIndex = i + 1
          q.run.test(line)
          piece = line.slice(i, q.run.lastIndex)
        }
        if (q.doc) f.doc = true
        else {
          f.code = true
          f.codeText += piece
        }
        i += piece.length
        continue
      }

      const ch = line[i]!
      if (ch === ' ' || ch === '\t') {
        let j = i + 1
        while (line[j] === ' ' || line[j] === '\t') j += 1
        addSpaces(f, line, i, j)
        f.codeText += line.slice(i, j)
        i = j
        continue
      }
      if (fence !== '' || fenceMark !== undefined) {
        f.code = true
        f.codeText += line.slice(i)
        addSpaces(f, line, i, line.length)
        break
      }
      const frame = templates.at(-1)
      if (frame !== undefined && (ch === frame.open || ch === frame.close)) {
        if (ch === frame.open) frame.depth += 1
        else if (frame.depth > 0) frame.depth -= 1
        else {
          templates.pop()
          quote = frame.within
        }
        f.code = true
        f.codeText += ch
        f.structure += quote === null ? ch : '"'
        if (statements !== null && quote === null) statements.brackets += bracketDelta(ch)
        i += 1
        continue
      }
      let opener: RegExpExecArray | null = null
      if (ch === '<' && heredocOpener !== null) {
        heredocOpener.lastIndex = i
        opener = heredocOpener.exec(line)
      }
      if (opener !== null) {
        heredocsNext.push(heredocWord(opener))
        f.code = true
        f.codeText += opener[0]
        f.structure += '""'
        i += opener[0].length
        continue
      }
      const literal =
        ch === '/' || ch === "'" || ch === '?' ? literalLength(language, line, i, f.codeText) : 0
      if (literal > 0) {
        f.code = true
        f.codeText += line.slice(i, i + literal)
        f.structure += '""'
        i += literal
        continue
      }
      const literalQuote =
        ch === '%' || ch === '/' ? openingLiteral(language, tables, line, i, f.codeText) : null
      if (literalQuote !== null) {
        quote = openQuote(literalQuote, false)
        f.code = true
        f.codeText += literalQuote.start
        f.structure += '"'
        i += literalQuote.start.length
        continue
      }
      let raw: RegExpExecArray | null = null
      if (syntax.cppRawStrings && (ch === 'R' || ch === 'u' || ch === 'U' || ch === 'L')) {
        CPP_RAW_STRING.lastIndex = i
        raw = CPP_RAW_STRING.exec(line)
        if (raw !== null) {
          quote = openQuote({ start: raw[0], end: `)${raw[1]}"`, raw: true }, false)
        }
      } else if (syntax.csharpRawStrings && ch === '"') {
        CSHARP_RAW_STRING.lastIndex = i
        raw = CSHARP_RAW_STRING.exec(line)
        if (raw !== null) quote = openQuote({ start: raw[0], end: raw[0], raw: true }, false)
      }
      if (raw !== null) {
        f.code = true
        f.codeText += raw[0]
        f.structure += '"'
        i += raw[0].length
        continue
      }
      for (const t of openers.get(ch) ?? NO_TOKENS) {
        if (!line.startsWith(t.text, i)) continue
        if (t.kind === 'line') {
          if (syntax.lineCommentsAtWordStart && i > 0 && !WORD_BREAK.test(line[i - 1]!)) continue
          if (!lineCommentOpens(language, t.text, line, i)) continue
          f[startsDocLine(line, i, language.doc.line) ? 'doc' : 'comment'] = true
          addSpaces(f, line, i, line.length)
          break scan
        }
        if (t.kind === 'code') {
          f.code = true
          f.codeText += t.text
          f.structure += t.text
          if (statements !== null) statements.brackets += bracketDelta(t.text)
          i += t.text.length
          continue scan
        }
        if (t.kind === 'block') {
          if (syntax.blockCommentsAtLineStart && line.slice(0, i).trim() !== '') continue
          if (syntax.blockCommentLines && i !== 0) continue
          const doc = startsDocBlock(line, i, language.doc.block)
          block = { open: t.text, close: t.close, depth: 1, doc }
          f[doc ? 'doc' : 'comment'] = true
          if (syntax.blockCommentLines) {
            addSpaces(f, line, i, line.length)
            break scan
          }
        } else {
          const doc =
            t.quote.doc === true &&
            (statements === null
              ? !f.code && docStringAllowed
              : docstringOpensHere(statements, n, f))
          quote = openQuote(t.quote, doc)
          if (doc) {
            f.doc = true
            if (statements !== null && statements.docstring === null) {
              statements.docstring = { line: n, codeBefore: f.codeText.length }
              statements.first = false
            }
          } else {
            f.code = true
            f.codeText += t.text
            f.structure += '"'
          }
        }
        i += t.text.length
        continue scan
      }
      const prefixes = f.code ? undefined : statements?.rule.prefixes
      if (prefixes !== undefined) {
        prefixes.lastIndex = i
        if (prefixes.test(line) && docstringOpensHere(statements!, n, f)) {
          // A prefix, as Python's `u`, is part of the docstring after it; a
          // header's docstring on its line takes none.
          i = prefixes.lastIndex
          continue
        }
      }
      plainRun.lastIndex = i + 1
      plainRun.test(line)
      const run = line.slice(i, plainRun.lastIndex)
      f.code = true
      f.codeText += run
      f.structure += run
      if (statements !== null && BRACKET.test(run)) statements.brackets += bracketDelta(run)
      i += run.length
    }
    if (quote !== null && endsAtLineEnd(language, quote.quote) && !line.endsWith(escape)) {
      quote = null
    }
    if (syntax.lineContinuation && line.endsWith('\\')) {
      f.joinsNext = quote === null && block === null && f.code && f.codeText.endsWith('\\')
    }
    if (statements !== null) {
      endStatementLine(statements, lines, facts, n, f, quote !== null)
    } else if (f.code) docStringAllowed = f.codeText.trimEnd().endsWith(':')
    f.endsInComment = block !== null
    f.bracedComment = f.code && (f.comment || f.doc) && BRACES_ONLY.test(f.structure)
    heredocs = heredocsNext
    heredocsNext = []
    facts.push(f)
  }
  return facts
}

/** A regex or character literal starting at `at`, which no comment or quote may open inside. */
function literalLength(language: Language, line: string, at: number, before: string): number {
  const ch = line[at]
  if (language.syntax.regexLiterals && ch === '/' && line[at + 1] !== '/' && line[at + 1] !== '*') {
    return atExpressionStart(before) ? regexLength(line, at) : 0
  }
  if (language.syntax.charLiterals && ch === "'") {
    CHAR_LITERAL.lastIndex = at
    return CHAR_LITERAL.test(line) ? CHAR_LITERAL.lastIndex - at : 0
  }
  if (language.syntax.questionMarkChars && ch === '?' && atExpressionStart(before)) {
    QUESTION_CHAR.lastIndex = at
    return QUESTION_CHAR.test(line) ? QUESTION_CHAR.lastIndex - at : 0
  }
  return 0
}

/**
 * A literal that may cross lines, opening at `at` where an expression may
 * start: a Ruby percent literal, or a regular expression that does not close
 * on its line, where strings may cross lines.
 */
function openingLiteral(
  language: Language,
  tables: LexTables,
  line: string,
  at: number,
  before: string,
): QuoteSyntax | null {
  const { syntax } = language
  if (line[at] === '/') {
    if (!syntax.regexLiterals || !syntax.multilineStrings || !atExpressionStart(before)) return null
    return tables.regex
  }
  if (!syntax.percentLiterals || !atExpressionStart(before)) return null
  PERCENT_LITERAL.lastIndex = at
  const m = PERCENT_LITERAL.exec(line)
  if (m === null) return null
  const [start, type, delimiter] = m as unknown as [string, string, string]
  const close = CLOSING_BRACKET[delimiter]
  const quote: QuoteSyntax =
    close === undefined ? { start, end: delimiter } : { start, end: close, nests: true }
  return PLAIN_PERCENT.test(type) ? quote : withInterpolation(quote, tables.interpolation)
}

function withInterpolation(quote: QuoteSyntax, interpolation: Brackets | undefined): QuoteSyntax {
  return interpolation === undefined ? quote : { ...quote, interpolation }
}
