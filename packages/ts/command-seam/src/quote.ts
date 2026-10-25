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

/**
 * Options for {@link commandString}.
 *
 * @experimental
 */
export interface CommandStringOptions {
  /**
   * The platform the line is for. Default `process.platform`. It picks the
   * default `shell`: `'powershell'` on `'win32'`, `'posix'` elsewhere.
   */
  platform?: NodeJS.Platform | undefined
  /** The shell that will read the line. Overrides the one `platform` picks. */
  shell?: 'posix' | 'powershell' | 'cmd' | undefined
  /** A folder to change to first. The command runs only if the change works, except in PowerShell. */
  cwd?: string | undefined
}

/**
 * `argv` as one command line for a person to paste into a shell, quoted for
 * that shell.
 *
 * - `'posix'`: {@link shellJoin}. With `cwd`: `cd <dir> && <line>`.
 * - `'powershell'`: `& <words>`. The call operator `&` is always emitted, so
 *   a quoted program path runs. A word is bare when it starts with a letter
 *   or one of `_-./\` and holds only letters, digits and `_-./\:=`;
 *   otherwise it is single-quoted, with each single quote (including the
 *   typographic ones PowerShell also accepts) doubled. With `cwd`:
 *   `Set-Location -LiteralPath <dir>; <line>`, which runs the command even
 *   when the change fails. Windows PowerShell 5.1 and PowerShell before 7.3
 *   drop an empty argument and mangle one with a `"` when calling a program.
 * - `'cmd'`: a word of only letters, digits and `_@+:./\-` is bare. Any
 *   other argument is quoted by the C runtime rules and then each `cmd.exe`
 *   special character gets a `^` (see the README's Platforms section). The
 *   program and `cwd` get the `^` escapes without quotes. With `cwd`:
 *   `cd /d <dir> && <line>`.
 *
 * @param argv - The program, then its arguments. Must not be empty.
 * @param opts - `platform`, `shell` and `cwd`.
 * @returns The command line.
 * @throws `RangeError` for an empty `argv`, or for `'cmd'` when a word or
 * `cwd` holds a line break, which `cmd.exe` cannot quote.
 * @experimental
 *
 * @example
 * ```ts
 * commandString(['git', 'commit', '-m', "it's done"], { platform: 'linux', cwd: '/repo' })
 * // cd /repo && git commit -m 'it'\''s done'
 * commandString(['git', 'commit', '-m', "it's done"], { platform: 'win32' })
 * // & git commit -m 'it''s done'
 * ```
 */
export function commandString(argv: readonly string[], opts: CommandStringOptions = {}): string {
  if (argv.length === 0) throw new RangeError('argv must not be empty')
  const platform = opts.platform ?? process.platform
  const shell = opts.shell ?? (platform === 'win32' ? 'powershell' : 'posix')
  const { cwd } = opts
  switch (shell) {
    case 'posix': {
      const line = shellJoin(argv)
      if (cwd === undefined) return line
      return `cd ${cwd.startsWith('-') ? '-- ' : ''}${shellQuote(cwd)} && ${line}`
    }
    case 'powershell': {
      const line = `& ${argv.map(psWord).join(' ')}`
      return cwd === undefined ? line : `Set-Location -LiteralPath ${psWord(cwd)}; ${line}`
    }
    case 'cmd': {
      const unsafe = [...argv, ...(cwd === undefined ? [] : [cwd])].find((w) => /[\r\n]/.test(w))
      if (unsafe !== undefined) {
        throw new RangeError(`cmd.exe cannot quote a line break: ${JSON.stringify(unsafe)}`)
      }
      const line = argv.map((w, i) => (CMD_INERT.test(w) ? w : i === 0 ? cmdCommand(w) : cmdArg(w)))
      return cwd === undefined ? line.join(' ') : `cd /d ${cmdCommand(cwd)} && ${line.join(' ')}`
    }
    default:
      throw new RangeError(`unknown shell ${JSON.stringify(shell)}`)
  }
}

const PS_INERT = /^[A-Za-z_\-./\\][A-Za-z0-9_\-./\\:=]*$/

/** `word` for PowerShell: bare when inert, else single-quoted. */
function psWord(word: string): string {
  if (PS_INERT.test(word)) return word
  return `'${word.replace(/['‘’‚‛]/g, '$&$&')}'`
}

/** Words `cmd.exe` and the programs it starts read as typed. */
const CMD_INERT = /^[A-Za-z0-9_@+:./\\-]+$/

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
