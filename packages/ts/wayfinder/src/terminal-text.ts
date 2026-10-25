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
 */

import type { CliIo } from '@osdlc/cli-tool'

/** C0 (tab and newline included), DEL, C1, and bidi U+202A-202E and U+2066-2069. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g
/** The same, but tab and newline are kept. */
const CONTROL_KEEP_LINES = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g
/** What `JSON.stringify` leaves raw of the above: it escapes C0 itself. */
const JSON_RAW = /[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g

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
  return (json ?? '').replace(
    JSON_RAW,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
}

/**
 * `io` with stdout made terminal-safe, tab and newline kept. For a command
 * whose stdout is human text that can name repository paths, such as
 * `way dev status`. Its `--json` output stays valid JSON: C0 is escaped
 * there already, and a DEL, C1 or bidi character in a path becomes U+FFFD.
 */
export function safeStdout(io: CliIo): CliIo {
  return { ...io, stdout: (text) => io.stdout(terminalSafe(text, { multiline: true })) }
}

/**
 * `io` with stderr made terminal-safe. stderr carries only human text:
 * warnings, errors and notes, which can quote config values and file names.
 */
export function safeStderr(io: CliIo): CliIo {
  return { ...io, stderr: (text) => io.stderr(terminalSafe(text, { multiline: true })) }
}
