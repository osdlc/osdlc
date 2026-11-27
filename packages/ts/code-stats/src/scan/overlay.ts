/**
 * Our additions to scc's language table: what scc does not record (doc
 * comments, import-like boilerplate, what a language's content is, lexing
 * rules it lacks, where layout carries meaning), the rows we correct and the
 * languages it lumps in with another. Keyed by language name.
 */

import type { QuoteSyntax } from './syntax.ts'

/**
 * What a language's content is. Non-comment lines count as `logic` in
 * `programming` and `data` files, `doc` in `prose` files and `boilerplate` in
 * `legal` ones.
 */
export type LanguageCategory = 'programming' | 'data' | 'prose' | 'legal'

/** Doc-comment openers: a line comment or a block comment that starts this way is `doc`. */
export interface DocMarkers {
  line?: readonly string[]
  block?: readonly string[]
}

/** Lexing rules beyond scc's comment and quote table. All default to false. */
export interface SyntaxFlags {
  /**
   * `"` and `'` strings may cross a line end, as in shell, Ruby or Rust; with
   * {@link regexLiterals}, a regular expression may too.
   */
  multilineStrings: boolean
  /** `/…/` regular expressions, inside which no comment or quote opens. */
  regexLiterals: boolean
  /** `'x'` character literals, so `'"'` opens no string and a lifetime `'a` none either. */
  charLiterals: boolean
  /** C++ raw strings, `R"delim(…)delim"`. */
  cppRawStrings: boolean
  /** C# raw strings: three or more `"`, closed by as many. */
  csharpRawStrings: boolean
  /** Fenced code blocks, inside which no comment opens. */
  fencedCode: boolean
  /** A block comment opens only as a line's first text. */
  blockCommentsAtLineStart: boolean
  /**
   * A block comment opens and closes only at a line's very start, and the
   * rest of either line is comment too, as with Ruby's `=begin` and `=end`.
   */
  blockCommentLines: boolean
  /** A line comment opens only where a word may start, as a shell's `#` does: `${#x}` holds none. */
  lineCommentsAtWordStart: boolean
  /**
   * Ruby's percent literals, `%w[…]`, `%r{…}`, `%q(…)`, `%(…)`, where a
   * regular expression could start. A bracket nests inside its own literal.
   */
  percentLiterals: boolean
  /**
   * Ruby's `?x` character literals, so `?'` opens no string and `?#` no
   * comment, where an expression may start; elsewhere `?` is a ternary.
   */
  questionMarkChars: boolean
  /**
   * A backslash that ends a line, outside a string or comment, joins the
   * next line to it, as in Python: a statement goes on past it.
   */
  lineContinuation: boolean
}

/**
 * Where a space or tab outside strings may come and go without changing
 * meaning. `between-tokens`: anywhere but between two words or two
 * operators, which it keeps apart (`a + +b` is not `a++b`), as in C or JSON.
 * `beside-punctuation`: only beside the CSS punctuation in `CSS_LOOSE_BEFORE`
 * and `CSS_LOOSE_AFTER` (diff/categories.ts), and there on the same terms;
 * never between selector parts, where a space is the descendant combinator
 * (`.a .b` is not `.a.b`).
 */
export type InsignificantWhitespace = 'between-tokens' | 'beside-punctuation'

/**
 * Where a string is a docstring, as in Python: the first statement of a
 * module or of an owner's body, when that statement is nothing but strings
 * (written side by side, or joined by line continuations) that may be
 * docstrings ({@link QuoteSyntax.doc}).
 */
export interface DocstringRule {
  /** A statement, tested on its first line trimmed, whose body may open with a docstring. */
  owners: RegExp
  /** Sticky: a prefix, not itself an opener, that keeps the string after it a docstring. */
  prefixes?: RegExp
}

export interface Overlay {
  category?: LanguageCategory
  doc?: DocMarkers
  /** Statement starts, tested on a line's code with comments removed, that make it boilerplate. */
  boilerplate?: readonly RegExp[]
  /** Comment-only lines, tested trimmed, that are boilerplate rather than comments. */
  boilerplateComments?: readonly RegExp[]
  /** Block comments in place of scc's. */
  blockComments?: readonly (readonly [string, string])[]
  /** Quotes in place of scc's. */
  quotes?: readonly QuoteSyntax[]
  /** Quotes added to scc's. */
  extraQuotes?: readonly QuoteSyntax[]
  /**
   * Line-comment markers that open a comment only in column 1, whatever
   * follows: fixed-form FORTRAN's `c`, `C` and `*`, ABAP's `*`.
   */
  columnOneComments?: readonly string[]
  /** By a quote's opener, the code it may hold: see {@link QuoteSyntax.interpolation}. */
  interpolation?: Readonly<Record<string, readonly (readonly [string, string])[]>>
  /**
   * Code that starts like a comment or a quote but opens neither: PHP's `#[`
   * attribute, Ruby's `$'` global, a shell's `\"`. The longest opener wins.
   */
  codeTokens?: readonly string[]
  /**
   * Lines, tested on their code, that belong to the boilerplate statement
   * right after them, as annotations on a Java `package` line do.
   */
  boilerplatePrefixes?: readonly RegExp[]
  extraExtensions?: readonly string[]
  extraShebangs?: readonly string[]
  syntax?: Partial<SyntaxFlags>
  /**
   * A heredoc opener, `^<<…`, tried wherever a `<` is; its last capture that
   * matched is the word that ends the body.
   */
  heredoc?: RegExp
  /**
   * Where a string may be a docstring. Without one, a {@link QuoteSyntax.doc}
   * string is a docstring where it opens a line before any code, or after a
   * line of code ending in `:`.
   */
  docstrings?: DocstringRule
  /**
   * Without it, any whitespace but a line's trailing whitespace may carry
   * meaning, as YAML's `key: v`, a shell's `A=1` and Python's indentation do.
   */
  insignificantWhitespace?: InsignificantWhitespace
  /**
   * Lines, tested as written, whose whitespace reads as though
   * {@link insignificantWhitespace} were unset: C's `#define F (x)` is
   * object-like and `#define F(x)` function-like.
   */
  significantWhitespaceLines?: readonly RegExp[]
  /**
   * A `\r` before a line's end is part of the line, as a Unix shell and make
   * read it (`then\r` is another word), so changing CRLF to LF changes meaning.
   */
  significantLineEndings?: boolean
  /**
   * Extensions whose files may hold JSX markup, where the spaces beside a tag
   * are text (`<b>a</b> b` is not `<b>a</b>b`): whitespace after a `>` that
   * ends no `=>`, or before a `<`, stays put, except at a line's start or end.
   * It applies only to files that show a JSX tag (`</` or `/>`). Other
   * whitespace inside JSX text still follows {@link insignificantWhitespace}.
   */
  markupExtensions?: readonly string[]
}

/**
 * Languages scc's table lumps in with another, the row named `from`: each
 * takes its `extensions` from that row and shares the row's syntax.
 */
export const SPLIT_LANGUAGES: readonly {
  name: string
  from: string
  extensions: readonly string[]
}[] = [
  // scc files braced `.scss` under the indented Sass.
  { name: 'SCSS', from: 'Sass', extensions: ['scss'] },
]

/** The language an ambiguous extension means, where scc lists more than one. */
export const EXTENSION_PREFERENCE: Readonly<Record<string, string>> = {
  h: 'C Header',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  ts: 'TypeScript',
  m: 'Objective C',
  tex: 'LaTeX',
  v: 'Verilog',
  tt: 'TemplateToolkit',
  scl: 'IEC61131-3',
}

/** Lower-cased path patterns for files whose extension does not tell their language. */
export const PATH_LANGUAGES: readonly (readonly [RegExp, string])[] = [
  [/(?:^|\/)(?:licen[cs]e|copying)(?:[-.][^/]*)?\.(?:md|txt|rst)$/, 'License'],
  [/(?:^|\/)(?:ts|js)config(?:\.[^/]*)?\.json$/, 'JSONC'],
  [/(?:^|\/)\.vscode\/[^/]+\.json$/, 'JSONC'],
  [/(?:^|\/)\.?devcontainer(?:\/[^/]+)?\.json$/, 'JSONC'],
  [/(?:^|\/)\.(?:eslintrc|babelrc|swcrc)(?:\.json)?$/, 'JSONC'],
  [/(?:^|\/)dockerfile\.[^/]+$/, 'Dockerfile'],
]

const PROSE = [
  'AsciiDoc',
  'Creole',
  'LaTeX',
  'Org',
  'Plain Text',
  'ReStructuredText',
  'Rich Text Format',
  'TaskPaper',
  'TeX',
  'Textile',
  'Typst',
]

const DATA = [
  'Avro',
  'Bitbucket Pipeline',
  'CSV',
  'CloudFormation (JSON)',
  'CloudFormation (YAML)',
  'Docker ignore',
  'Document Type Definition',
  'Emacs Dev Env',
  'Game Maker Project',
  'Godot Scene',
  'HEX',
  'INI',
  'Intel HEX',
  'JSON5',
  'JSONL',
  'Jupyter',
  'MSBuild',
  'Patch',
  'Properties File',
  'Report Definition Language',
  'SVG',
  'TOON',
  'Ur/Web Project',
  'Verilog Args File',
  'Web Services Description Language',
  'XML',
  'XML Schema',
  'Xcode Config',
  'YAML',
  'gitignore',
  'ignore',
  'nuspec',
]

const LEGAL = ['License', 'SPDX']

const JS_DOC: DocMarkers = { block: ['/**'] }
const C_DOC: DocMarkers = { line: ['///', '//!'], block: ['/**', '/*!'] }
const SLASH_DOC: DocMarkers = { line: ['///'], block: ['/**'] }

const JS_BOILERPLATE = [
  /^import\b\s*(?:type\s+)?(?:[\w$*{]|['"])/,
  /^export\s+(?:type\s+)?(?:\*|\{)/,
  /^(?:const|let|var)\s+[\w${}\s,:]+=\s*require\s*\(\s*['"][^'"]*['"]\s*\)\s*;?$/,
  /^['"]use (?:strict|client|server)['"];?$/,
]
const TRIPLE_SLASH_DIRECTIVES = [/^\/\/\/\s*<(?:reference|amd-module|amd-dependency)\b/]
const C_BOILERPLATE = [/^#\s*include\b/, /^#\s*import\b/, /^#\s*pragma\s+once\b/]
const JVM_BOILERPLATE = [/^package\s+[\w.]+\s*;?$/, /^import\s/]
/** Annotations, one to a line, as on a `package` line in `package-info.java` or Kotlin's `@file:`. */
const JVM_ANNOTATIONS = [/^@[\w.:]+(?:\s*\(.*\))?$/]

const SCRIPT_QUOTES: readonly QuoteSyntax[] = [
  { start: "'", end: "'" },
  { start: '`', end: '`' },
]
const JS = {
  doc: JS_DOC,
  boilerplate: JS_BOILERPLATE,
  boilerplateComments: TRIPLE_SLASH_DIRECTIVES,
  interpolation: { '`': [['${', '}']] },
  syntax: { regexLiterals: true },
} satisfies Overlay

const C_FAMILY = {
  doc: C_DOC,
  boilerplate: C_BOILERPLATE,
  syntax: { charLiterals: true },
} satisfies Overlay
const CSS_FAMILY = {
  boilerplate: [/^@(?:import|use|forward)\b/],
  extraQuotes: [{ start: "'", end: "'" }],
} satisfies Overlay
const CPP_FAMILY = {
  ...C_FAMILY,
  syntax: { ...C_FAMILY.syntax, cppRawStrings: true },
} satisfies Overlay
/** C's whitespace rule, except on `#define` lines (see `significantWhitespaceLines`). */
const C_LAYOUT = {
  insignificantWhitespace: 'between-tokens',
  significantWhitespaceLines: [/^\s*#\s*define\b/],
} satisfies Overlay

/** Kotlin and Scala alike: raw `"""` strings, and backticks around an identifier. */
const KOTLIN_SCALA = {
  doc: JS_DOC,
  boilerplate: JVM_BOILERPLATE,
  boilerplatePrefixes: JVM_ANNOTATIONS,
  quotes: [
    { start: '"""', end: '"""', raw: true },
    { start: '"', end: '"' },
    { start: '`', end: '`', raw: true, singleLine: true },
  ],
  syntax: { charLiterals: true },
} satisfies Overlay

const RUBY_INTERPOLATION = [['#{', '}']] as const
const SOURCE = [/^(?:source|\.)\s+\S/]

function family(names: readonly string[], overlay: Overlay): [string, Overlay][] {
  return names.map((n) => [n, overlay])
}

const OVERLAYS = new Map<string, Overlay>([
  ['FORTRAN Legacy', { columnOneComments: ['c', 'C', '*'] }],
  ['ABAP', { columnOneComments: ['*'] }],
  ...family(PROSE, { category: 'prose' }),
  ...family(DATA, { category: 'data' }),
  ...family(LEGAL, { category: 'legal' }),
  ...family(['Markdown', 'MDX'], {
    category: 'prose',
    blockComments: [['<!--', '-->']],
    syntax: { fencedCode: true, blockCommentsAtLineStart: true },
  }),
  [
    'JSON',
    {
      category: 'data',
      quotes: [{ start: '"', end: '"' }],
      insignificantWhitespace: 'between-tokens',
    },
  ],
  ['JSONC', { category: 'data' }],
  [
    'TOML',
    {
      category: 'data',
      quotes: [
        { start: '"""', end: '"""' },
        { start: "'''", end: "'''", raw: true },
        { start: '"', end: '"' },
        { start: "'", end: "'", raw: true },
      ],
    },
  ],
  [
    'JavaScript',
    {
      ...JS,
      insignificantWhitespace: 'between-tokens',
      markupExtensions: ['js'],
      extraShebangs: ['nodejs', 'zx'],
    },
  ],
  [
    'TypeScript',
    {
      ...JS,
      insignificantWhitespace: 'between-tokens',
      markupExtensions: ['tsx'],
      extraShebangs: ['bun', 'deno', 'tsx', 'ts-node'],
    },
  ],
  [
    'TypeScript Typings',
    { ...JS, insignificantWhitespace: 'between-tokens', extraExtensions: ['d.mts', 'd.cts'] },
  ],
  [
    'JSX',
    {
      ...JS,
      insignificantWhitespace: 'between-tokens',
      markupExtensions: ['jsx'],
      extraQuotes: SCRIPT_QUOTES,
    },
  ],
  ...family(['Vue', 'Svelte', 'Astro'], { ...JS, extraQuotes: SCRIPT_QUOTES }),
  ...family(['C', 'C Header'], { ...C_FAMILY, ...C_LAYOUT }),
  ...family(['Objective C', 'Cuda'], C_FAMILY),
  ...family(['C++', 'C++ Header'], { ...CPP_FAMILY, ...C_LAYOUT }),
  ['Objective C++', CPP_FAMILY],
  [
    'Rust',
    {
      doc: C_DOC,
      boilerplate: [
        /^(?:pub(?:\([^)]*\))?\s+)?use\s/,
        /^(?:pub(?:\([^)]*\))?\s+)?mod\s+\w+\s*;/,
        /^extern\s+crate\s/,
      ],
      syntax: { multilineStrings: true, charLiterals: true },
      insignificantWhitespace: 'between-tokens',
    },
  ],
  ['Go', { boilerplate: [/^package\s/, /^import\b/], insignificantWhitespace: 'between-tokens' }],
  [
    'Java',
    {
      insignificantWhitespace: 'between-tokens',
      doc: JS_DOC,
      boilerplate: JVM_BOILERPLATE,
      boilerplatePrefixes: JVM_ANNOTATIONS,
      extraQuotes: [{ start: '"""', end: '"""' }],
    },
  ],
  [
    'Kotlin',
    {
      ...KOTLIN_SCALA,
      interpolation: { '"': [['${', '}']], '"""': [['${', '}']] },
      insignificantWhitespace: 'between-tokens',
    },
  ],
  ['Scala', KOTLIN_SCALA],
  ...family(['Groovy', 'Gradle'], { doc: JS_DOC, boilerplate: JVM_BOILERPLATE }),
  [
    'C#',
    {
      insignificantWhitespace: 'between-tokens',
      doc: SLASH_DOC,
      boilerplate: [
        /^(?:global\s+)?using\s+(?:static\s+)?[\w.]+(?:\s*=\s*[\w.<>, ]+)?\s*;/,
        /^namespace\s+[\w.]+\s*;/,
      ],
      quotes: [
        { start: '@"', end: '"', raw: true, doubledEnd: true },
        { start: '@$"', end: '"', raw: true, doubledEnd: true },
        { start: '"', end: '"' },
        { start: "'", end: "'" },
      ],
      syntax: { csharpRawStrings: true },
    },
  ],
  [
    'Swift',
    {
      insignificantWhitespace: 'between-tokens',
      doc: SLASH_DOC,
      boilerplate: [/^import\s/],
      extraQuotes: [{ start: '"""', end: '"""' }],
    },
  ],
  ['Dart', { doc: SLASH_DOC, boilerplate: [/^(?:import|export|part(?:\s+of)?|library)\s/] }],
  [
    'Zig',
    { doc: { line: ['///', '//!'] }, boilerplate: [/^(?:pub\s+)?const\s+\w+\s*=\s*@import\(/] },
  ],
  ['Solidity', { doc: SLASH_DOC, boilerplate: [/^import\s/, /^pragma\s/] }],
  ['F#', { doc: { line: ['///'] }, boilerplate: [/^open\s/] }],
  ['OCaml', { boilerplate: [/^open\s/] }],
  [
    'Python',
    {
      // `from . x import y`, and `from x \` with `import y` on the line after.
      boilerplate: [/^import\s/, /^from\s+[\w.][\w.\s]*?(?:\s+import\b|\s*\\$)/],
      extraShebangs: ['uv'],
      // Any string literal may be a docstring but a bytes literal; tree-sitter
      // reads an f-string as one too, so the table does. A backslash keeps a
      // quote from ending even a raw string: `r'\''` is one string.
      quotes: [
        { start: '"', end: '"', doc: true },
        { start: "'", end: "'", doc: true },
        { start: "r'", end: "'", doc: true },
        { start: 'r"', end: '"', doc: true },
        { start: '"""', end: '"""', doc: true },
        { start: "'''", end: "'''", doc: true },
        { start: 'r"""', end: '"""', doc: true },
        { start: "r'''", end: "'''", doc: true },
        { start: 'f"""', end: '"""', doc: true },
        { start: "f'''", end: "'''", doc: true },
      ],
      docstrings: {
        owners: /^(?:async\s+)?(?:def|class)\b/,
        // `u'…'`, `R'…'`, `f'…'`, `Rf'…'`; a quote's own opener, as `r'`, wins.
        prefixes: /(?:[uU]|[rR]?[fF]|[fF]?[rR])(?=["'])/y,
      },
      syntax: { lineContinuation: true },
    },
  ],
  ['Cython', { boilerplate: [/^c?import\s/, /^from\s+[\w.]+\s+c?import\b/] }],
  [
    'Ruby',
    {
      boilerplate: [/^require(?:_relative)?\b/],
      interpolation: { '"': RUBY_INTERPOLATION, '`': RUBY_INTERPOLATION },
      codeTokens: [
        // Globals: the text after, around and before the last match.
        "$'",
        '$"',
        '$`',
        // Operator symbols, as in `inject(:/)`, that would open a regex or percent literal.
        ':/',
        ':%',
      ],
      syntax: {
        multilineStrings: true,
        regexLiterals: true,
        percentLiterals: true,
        questionMarkChars: true,
        blockCommentLines: true,
      },
      // A quoted word may hold any text; `x<<y` right after a value is a shift.
      heredoc: /^(?<![\w)\]}<])<<([-~]?)(?:(['"`])(.+?)\2|([A-Za-z_]\w*))/,
    },
  ],
  [
    'PHP',
    {
      doc: JS_DOC,
      boilerplate: [
        /^<\?php\s*$/,
        /^use\s/,
        /^namespace\s+[\w\\]+\s*;/,
        /^(?:require|include)(?:_once)?\b/,
      ],
      // PHP 8's `#[Attribute]` is code; only a `#` before anything else opens a comment.
      codeTokens: ['#['],
      syntax: { multilineStrings: true },
      heredoc: /^<<<\s*(['"]?)([A-Za-z_]\w*)\1/,
    },
  ],
  ...family(['CSS', 'SCSS', 'LESS'], {
    ...CSS_FAMILY,
    insignificantWhitespace: 'beside-punctuation',
  }),
  ['Sass', CSS_FAMILY],
  ['Stylus', CSS_FAMILY],
  ['Haskell', { boilerplate: [/^import\s/, /^module\s/], extraQuotes: [{ start: '"', end: '"' }] }],
  [
    'Elixir',
    { boilerplate: [/^(?:alias|import|require|use)\s/], syntax: { multilineStrings: true } },
  ],
  ['Lua', { boilerplate: [/^local\s+\w+\s*=\s*require\b/] }],
  [
    'Perl',
    {
      boilerplate: [/^use\s/, /^require\s/, /^package\s+[\w:]+\s*;/],
      syntax: { multilineStrings: true },
      heredoc: /^<<(~?)(['"]?)([A-Za-z_]\w*)\2/,
    },
  ],
  ['Nix', { syntax: { multilineStrings: true } }],
  ['R', { boilerplate: [/^(?:library|require)\(/] }],
  ['Julia', { boilerplate: [/^(?:using|import)\s/] }],
  ['Powershell', { extraShebangs: ['pwsh'] }],
  ...family(['Shell', 'BASH', 'Zsh', 'Korn Shell'], {
    significantLineEndings: true,
    boilerplate: SOURCE,
    // Single quotes hold no escapes, `$'…'` does; a double-quoted string holds commands and parameters.
    quotes: [
      { start: '"', end: '"' },
      { start: "$'", end: "'" },
      { start: "'", end: "'", raw: true },
    ],
    interpolation: {
      '"': [
        ['$(', ')'],
        ['${', '}'],
      ],
    },
    // Outside quotes a backslash escapes the next character.
    codeTokens: ['\\\\', "\\'", '\\"', '\\#', '\\$'],
    syntax: { multilineStrings: true, lineCommentsAtWordStart: true },
    // `<<-` strips tabs, `<<\EOF` and `<<'EOF'` quote the word; `<<<` is a here-string.
    heredoc: /^(?<!<)<<(-?)\s*(?:(['"])(.+?)\2|\\?([A-Za-z_]\w*))/,
  }),
  [
    'Fish',
    {
      significantLineEndings: true,
      boilerplate: SOURCE,
      syntax: { multilineStrings: true },
      heredoc: /^<<(-?)\s*(['"]?)([A-Za-z_]\w*)\2/,
    },
  ],
  ...family(['C Shell', 'Makefile'], { significantLineEndings: true }),
])

export function overlayFor(language: string): Overlay {
  return OVERLAYS.get(language) ?? {}
}
