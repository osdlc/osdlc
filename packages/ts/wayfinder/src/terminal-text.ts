/**
 * Repository text made safe to print to a terminal.
 *
 * Task names, script bodies, doc comments, config values and directory names
 * come from the repository. A control character in one of them reaches the
 * terminal as a command: `ESC ] 52` writes the clipboard, `ESC ] 0` sets the
 * window title, and a query sequence makes some terminals type a reply into
 * stdin, which the TUI reads as keys. Bidi embedding, override and isolate
 * characters make text display in a different order from the one it runs
 * in. So every human output replaces these characters before printing, and
 * the clipboard gets the same text. JSON output keeps every value exact: it
 * escapes these characters as `\u` escapes instead (see {@link jsonText}).
 *
 * Each control character becomes one U+FFFD, so the text keeps its length and
 * a match offset into it still points at the same character.
 *
 * This is wayfinder's one filter for repository text. `stripControls` from
 * `@osdlc/ux` covers the same characters but removes them, and whole escape
 * sequences with them. That changes the length, so the terminal UI's match
 * highlights would point at the wrong characters, and a person would not see
 * that the name held anything. Both filters remove the same set of controls.
 */

import { EXIT, type CliIo } from '@osdlc/cli-tool'

import { BIN } from './app.ts'

/**
 * C0 (tab and newline included), DEL, C1, and the bidi controls: the marks
 * U+061C, U+200E and U+200F, and U+202A-202E and U+2066-2069.
 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g
/** The same, but tab and newline are kept. */
const CONTROL_KEEP_LINES =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g
/** C0 without tab and newline. */
const C0_KEEP_LINES = /[\u0000-\u0008\u000b-\u001f]/g
/** What `JSON.stringify` leaves raw of the above: it escapes C0 itself. */
const JSON_RAW = /[\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

const REPLACEMENT = '�'

/**
 * `text` with every C0 control character (ESC included), DEL, C1 control
 * character and bidi control replaced by U+FFFD. With `multiline`, tab and
 * newline are kept, for output that is already more than one line.
 */
export function terminalSafe(text: string, opts: { multiline?: boolean } = {}): string {
  return text.replace(opts.multiline === true ? CONTROL_KEEP_LINES : CONTROL, REPLACEMENT)
}

/**
 * `JSON.stringify(value, null, indent)` with DEL, C1 and the bidi controls
 * written as `\u` escapes. It parses to the same value, and is safe to print
 * to a terminal.
 */
export function jsonText(value: unknown, indent?: number): string {
  const json: string | undefined = JSON.stringify(value, null, indent)
  return escapeJsonRaw(json ?? '')
}

function escapeJsonRaw(json: string): string {
  return json.replace(JSON_RAW, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/**
 * `io` with stdout made terminal-safe, tab and newline kept. For a command
 * whose stdout is human text that can name repository paths, such as
 * `way dev status`. For JSON output use {@link safeJsonStdout}.
 */
export function safeStdout(io: CliIo): CliIo {
  return { ...io, stdout: (text) => io.stdout(terminalSafe(text, { multiline: true })) }
}

/**
 * `io` with stdout made terminal-safe for JSON output, such as
 * `way dev status --json`. DEL, C1 and the bidi controls are written as `\u`
 * escapes, as {@link jsonText} writes them, so every JSON value stays exact.
 * A raw C0 character other than tab and newline becomes U+FFFD; valid JSON
 * has none, since `JSON.stringify` escapes C0.
 */
export function safeJsonStdout(io: CliIo): CliIo {
  return {
    ...io,
    stdout: (text) => io.stdout(escapeJsonRaw(text.replace(C0_KEEP_LINES, REPLACEMENT))),
  }
}

/**
 * `io` with stderr made terminal-safe. stderr carries only human text:
 * warnings, errors and notes, which can quote config values and file names.
 */
export function safeStderr(io: CliIo): CliIo {
  return { ...io, stderr: (text) => io.stderr(terminalSafe(text, { multiline: true })) }
}

/**
 * Runs `run` and returns its exit code. An error it throws is printed to
 * `stderr` as one terminal-safe line, and the code is `EXIT.error`. For the
 * installed `way`, so an error no command caught cannot reach the terminal
 * raw, as Node's own handler would print it.
 */
export async function guardedExit(
  run: () => number | Promise<number>,
  stderr: (text: string) => void = (text) => process.stderr.write(text),
): Promise<number> {
  try {
    return await run()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    stderr(`${BIN}: ${terminalSafe(message)}\n`)
    return EXIT.error
  }
}
