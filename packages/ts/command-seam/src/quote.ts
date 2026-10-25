/**
 * Quoting for a command line printed for a person to paste, or passed to a
 * shell. The argv runners never need the POSIX and PowerShell forms: they
 * pass argv straight to the binary. The `cmd.exe` form is also how they
 * start a `.cmd` or `.bat` file on Windows.
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

/** Characters `cmd.exe` treats specially outside quotes, each escaped with `^`. */
const CMD_META = /[()[\]%!^"`<>&|;, *?]/g

/**
 * `arg` as one argument on a `cmd.exe` command line, for a program that
 * splits its command line by the Microsoft C runtime rules. Two steps:
 *
 * 1. C runtime quoting: backslashes before a `"` are doubled and the `"`
 *    becomes `\"`; trailing backslashes are doubled; the result is wrapped
 *    in `"`.
 * 2. `cmd.exe` escaping: each of ``()[]%!^"`<>&|;,*?`` and space gets a `^`.
 *    The quotes are escaped too, so `cmd.exe` never enters a quoted section
 *    and every `^` applies. This is what stops `%VAR%` and `!VAR!` expanding:
 *    `^%VAR^%` names the variable `VAR^`, which is not set, so the text
 *    passes through and the carets are then removed.
 *
 * `doubleEscape` applies step 2 twice, for a batch file that passes its
 * arguments on with `%*`, which `cmd.exe` parses again. The shims npm writes
 * to `node_modules/.bin` do this.
 *
 * A line break cannot be passed: `cmd.exe` ends the command there. Callers
 * refuse one before calling this.
 */
export function cmdArg(arg: string, doubleEscape = false): string {
  const msvcrt = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`
  const once = msvcrt.replace(CMD_META, '^$&')
  return doubleEscape ? once.replace(CMD_META, '^$&') : once
}

/** `command` as the program on a `cmd.exe` line: each special character gets a `^`, with no quotes. */
export function cmdCommand(command: string): string {
  return command.replace(CMD_META, '^$&')
}
