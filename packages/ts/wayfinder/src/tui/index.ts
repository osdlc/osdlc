/**
 * The terminal UI: browse every task in a repository, and run one. Enter
 * runs the selected task in this shell and hands it the terminal.
 *
 * No TUI toolkit: raw mode, ANSI, and one frame string per read. A toolkit
 * would weigh more than the code it saves, and this has to keep working from
 * a checkout whose node_modules is what you are trying to repair.
 *
 * `./app.ts` holds the state, the frame and the keys over a host interface.
 * This file is the real host: it controls the terminal through
 * `process.stdout` and `process.stdin`, restores it on every way out, and
 * hands it to a task.
 */

import { constants } from 'node:os'

import { BIN } from '../app.ts'
import { handOff } from '../core/run.ts'
import type { Session } from '../core/session.ts'
import { createTui, type Tui, type TuiHost } from './app.ts'
import { writeClipboard } from './copy.ts'
import { stylesFor } from './style.ts'

export { createTui, refreshNote, SCOPES, type Tui, type TuiHost, type TuiState } from './app.ts'
export { copyText, clipboardCommands, writeClipboard } from './copy.ts'
export { splitKeys } from './keys-input.ts'

const ALT_ON = '\x1b[?1049h'
const ALT_OFF = '\x1b[?1049l'
const HIDE = '\x1b[?25l'
const SHOW = '\x1b[?25h'

/** The signals that end the terminal UI, each with the shell's exit code, 128 + its number. */
export const QUIT_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'] as const

/**
 * Quit on SIGINT, SIGTERM, SIGHUP and SIGQUIT with 128 + the signal's
 * number. Raw mode turns the terminal's Ctrl-C into a key, so these come
 * from another process. `quit` stops the probe and restores the terminal.
 * command-seam's forwarding, installed by the CLI, still kills the probe
 * groups: with a listener here, it signals them and leaves the exit to this
 * one. Returns a function that removes the listeners.
 */
export function installQuitHandlers(
  quit: (code: number) => void,
  target: NodeJS.EventEmitter = process,
): () => void {
  const listeners = QUIT_SIGNALS.map((signal) => {
    const listener = (): void => quit(128 + constants.signals[signal])
    target.on(signal, listener)
    return [signal, listener] as const
  })
  return () => {
    for (const [signal, listener] of listeners) target.off(signal, listener)
  }
}

/**
 * Take over the terminal and run the UI over `session`. Returns 2 without a
 * TTY. Otherwise it never settles: every way out calls `process.exit`.
 */
export async function runTui(session: Session): Promise<number> {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      `${BIN}: the terminal UI needs a TTY; use "serve" for the page, or "list --json" for data.\n`,
    )
    return 2
  }

  let restored = false
  let uninstall = (): void => {}
  const host: TuiHost = {
    write: (text) => void process.stdout.write(text),
    columns: () => process.stdout.columns,
    rows: () => process.stdout.rows,
    platform: process.platform,
    clipboard: (text) =>
      writeClipboard(text, { cwd: session.root, platform: process.platform, env: process.env }),
    release() {
      if (restored) return
      restored = true
      // The task, not this process, handles signals while it has the terminal.
      uninstall()
      process.stdin.removeAllListeners('data')
      process.stdin.pause()
      if (process.stdin.isTTY) process.stdin.setRawMode(false)
      process.stdout.write(SHOW + ALT_OFF)
    },
    handOff,
    exit: (code) => process.exit(code),
  }

  const tui: Tui = createTui({
    session,
    host,
    styles: stylesFor(process.env, process.stdout.isTTY === true),
  })

  process.stdout.write(ALT_ON + HIDE)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  process.on('exit', () => host.release())
  uninstall = installQuitHandlers((code) => tui.quit(code))
  process.stdout.on('resize', () => tui.draw())
  process.stdin.on('data', (chunk: string) => tui.feed(chunk))

  await tui.boot()
  return new Promise<number>(() => {})
}
