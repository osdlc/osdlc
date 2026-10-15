/**
 * POSIX shell quoting, for a command line printed for a person to paste or
 * passed to `sh -c`. The argv runners never need it: they pass argv straight
 * to the binary.
 */

/** Characters no POSIX shell treats specially. Same set as Python's `shlex.quote`. */
const INERT = /^[A-Za-z0-9_@%+=:,./-]+$/

/**
 * `word` as one shell word: unquoted when it holds only characters no POSIX
 * shell treats specially (letters, digits and `_@%+=:,./-`), single-quoted
 * otherwise.
 */
export function shellQuote(word: string): string {
  if (INERT.test(word)) return word
  return quoted(word)
}

/**
 * `argv` as one shell command line. A first word containing `=` is always
 * quoted: bare, the shell would read it as a variable assignment, not a
 * command.
 */
export function shellJoin(argv: readonly string[]): string {
  return argv.map((w, i) => (i === 0 && w.includes('=') ? quoted(w) : shellQuote(w))).join(' ')
}

function quoted(word: string): string {
  return `'${word.replaceAll("'", `'\\''`)}'`
}
