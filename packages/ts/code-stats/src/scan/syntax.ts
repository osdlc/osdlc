/** A string literal's delimiters. */
export interface QuoteSyntax {
  start: string
  end: string
  /** Backslash escapes are not processed inside (a raw string). */
  raw?: boolean
  /** The string may be a docstring, as Python's are: see Overlay.docstrings in overlay.ts. */
  doc?: boolean
  /**
   * Openers of code inside the string, each with the bracket that closes it:
   * a template's `${…}`, Ruby's `#{…}`, a shell's `$(…)`. The code may hold
   * strings of its own.
   */
  interpolation?: readonly (readonly [string, string])[]
  /** The opening bracket nests inside the string, as in Ruby's `%w[a [b] c]`. */
  nests?: boolean
  /** A doubled `end` is an escaped one, as in C#'s verbatim `@"say ""hi"""`. */
  doubledEnd?: boolean
  /** The string ends with its line, whatever the language allows: a Kotlin `` `name` ``. */
  singleLine?: boolean
}

/** The comment and string syntax of one language, as scc's table records it. */
export interface LanguageSyntax {
  name: string
  /** Lower-cased. An entry may hold dots (`d.ts`) or be a whole file name (`makefile`). */
  extensions: readonly string[]
  /** Lower-cased whole file names. */
  filenames: readonly string[]
  /** Interpreter names a `#!` line can name. */
  shebangs: readonly string[]
  lineComments: readonly string[]
  blockComments: readonly (readonly [string, string])[]
  nestedBlocks: boolean
  quotes: readonly QuoteSyntax[]
  /** The escape character inside strings when it is not a backslash. */
  escape?: string
}
