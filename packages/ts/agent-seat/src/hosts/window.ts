/**
 * A new GUI terminal window: open one running the command and return at once,
 * leaving the person in a window of their own (the `terminal` host, by
 * contrast, runs in the caller's TTY and blocks). The window is opened by an
 * opener ({@link WindowOpener}): the built-in one drives Terminal.app through `osascript`; a caller
 * supplies another (an iTerm or Ghostty launcher) as a function from the shell
 * command to the argv that opens it.
 *
 * The host keeps no state and cannot find, focus, send to or close the window
 * afterwards, and it cannot wait for the window's process to exit
 * ({@link hostCanWait} is false): it only opens.
 */

import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import {
  commandString,
  failureText,
  ran,
  resolveRunner,
  type CommandRunner,
} from '@osdlc/command-seam'

import { supportsPlatform, type CommandRequest, type Host } from '../contract.ts'
import { sessionViaTerminal } from '../harness.ts'

export const TERMINAL_APP_PATH = '/System/Applications/Utilities/Terminal.app'

/** How a window is opened: whether it can be here, and the argv that opens one. */
export interface WindowOpener {
  /** Whether the app this opener drives is on this machine. */
  available(): boolean
  /**
   * The argv that opens a new window running `shellCommand` ({@link windowShellCommand}
   * of the request), run through the host's runner. The request is given for its title and focus.
   */
  argv(shellCommand: string, req: CommandRequest): string[]
}

/** `text` as the body of an AppleScript string literal. */
function appleScriptString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`
}

/**
 * The shell command a window runs: `cd` to `req.cwd` (resolved against the process cwd), then
 * `req.argv`, each word quoted for a POSIX shell.
 */
export function windowShellCommand(req: CommandRequest): string {
  return commandString(req.argv, { shell: 'posix', cwd: resolve(req.cwd) })
}

/**
 * Argv for `osascript` that opens a new Terminal.app window running `shellCommand`: `do script`
 * with no target window always opens a new one, and its interactive shell stays
 * open after the command ends. `focus: false` leaves out `activate`, but `do script` can still
 * bring Terminal forward, or launch it.
 */
export function terminalAppArgv(
  shellCommand: string,
  req?: Pick<CommandRequest, 'focus'>,
): string[] {
  const lines = [
    'tell application "Terminal"',
    ...(req?.focus === false ? [] : ['activate']),
    `do script ${appleScriptString(shellCommand)}`,
    'end tell',
  ]
  return ['osascript', ...lines.flatMap((l) => ['-e', l])]
}

/** The built-in opener: Terminal.app through `osascript` (macOS). */
export function makeTerminalAppOpener(
  opts: { exists?: ((path: string) => boolean) | undefined } = {},
): WindowOpener {
  const exists = opts.exists ?? existsSync
  return {
    available: () => exists(TERMINAL_APP_PATH),
    argv: (shellCommand, req) => terminalAppArgv(shellCommand, req),
  }
}

/**
 * Builds the window host; see the module doc.
 */
export function makeWindowHost(
  opts: {
    runner?: CommandRunner | undefined
    opener?: WindowOpener | undefined
    /** The platforms the host runs on; default macOS for the built-in opener, any for a supplied one. */
    platforms?: readonly NodeJS.Platform[] | 'all' | undefined
  } = {},
): Host {
  const opener = opts.opener ?? makeTerminalAppOpener()
  const platforms = opts.platforms ?? (opts.opener === undefined ? ['darwin'] : 'all')
  return {
    name: 'window',
    platforms,
    available() {
      return supportsPlatform({ platforms }) && opener.available()
    },
    terminal(req) {
      const argv = opener.argv(windowShellCommand(req), req)
      const [bin] = argv
      if (bin === undefined) throw new Error('window opener returned an empty argv')
      const res = resolveRunner(bin, opts.runner).run(argv.slice(1), {
        // Not `req.cwd`: the window does its own `cd`, so a missing directory shows in the window.
        cwd: tmpdir(),
        timeoutMs: 120_000,
      })
      if (!ran(res)) throw new Error(`opening a window failed: ${failureText(res)}`)
      return 0
    },
    session: sessionViaTerminal,
  }
}

/** The production window host: Terminal.app. */
export const windowHost: Host = makeWindowHost()
