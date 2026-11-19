/**
 * A new GUI terminal window: open one running the command and return at once,
 * leaving the person in a window of their own (the `terminal` host, by
 * contrast, runs in the caller's TTY and blocks). The window is opened by an
 * OPENER: the built-in one drives Terminal.app through `osascript`; a caller
 * supplies another (an iTerm or Ghostty launcher) as a function from the shell
 * command to the argv that opens it.
 *
 * The host keeps no state and cannot find, focus, send to or close the window
 * afterwards, and it cannot wait for the window's process to exit
 * ({@link hostCanWait} is false): it only opens.
 */

import { existsSync } from 'node:fs'

import {
  failureText,
  ran,
  resolveRunner,
  shellJoin,
  shellQuote,
  type CommandRunner,
} from '@osdlc/command-seam'

import { supportsPlatform, type CommandRequest, type Host } from '../contract.ts'
import { sessionViaTerminal } from '../harness.ts'

/** Where Terminal.app lives on macOS. */
export const TERMINAL_APP_PATH = '/System/Applications/Utilities/Terminal.app'

/** How a window is opened: whether it can be here, and the argv that opens one. */
export interface WindowOpener {
  /** Whether the app this opener drives is on this machine. */
  available(): boolean
  /**
   * The argv that opens a new window running `shellCommand` (`cd <cwd> && <command>`, one
   * shell command line), run through the host's runner. The request is given for its title and focus.
   */
  argv(shellCommand: string, req: CommandRequest): string[]
}

/** `text` as the body of an AppleScript string literal. */
function appleScriptString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * The shell command a window runs: change to `req.cwd`, then run `req.argv`.
 * The shell stays open after the command, so the person can read what it printed.
 */
export function windowShellCommand(req: CommandRequest): string {
  return `cd ${shellQuote(req.cwd)} && ${shellJoin(req.argv)}`
}

/**
 * Argv for `osascript` that opens a new Terminal.app window running `shellCommand`: `do script`
 * with no target window always opens a new one. Pure, so a test can pin it. `activate`
 * brings Terminal to the front unless the request sets `focus: false`.
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
 * The window host: opens a new GUI terminal window per command and returns at once.
 * Defaults to Terminal.app on macOS; `opener` swaps in any other app.
 */
export function makeWindowHost(
  opts: {
    runner?: CommandRunner | undefined
    opener?: WindowOpener | undefined
    /** The platforms the host runs on; default macOS only (the built-in opener's). */
    platforms?: readonly NodeJS.Platform[] | undefined
  } = {},
): Host {
  const opener = opts.opener ?? makeTerminalAppOpener()
  const platforms = opts.platforms ?? ['darwin']
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
        cwd: req.cwd,
        timeoutMs: 30_000,
      })
      if (!ran(res)) throw new Error(`opening a window failed: ${failureText(res)}`)
      return 0
    },
    session: sessionViaTerminal,
  }
}

/** The production window host: Terminal.app. */
export const windowHost: Host = makeWindowHost()
