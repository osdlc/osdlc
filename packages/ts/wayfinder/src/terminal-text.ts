/**
 * Repository text made safe to print to a terminal.
 *
 * Task names, script bodies, doc comments, config values and directory names
 * come from the repository. A control character in one of them reaches the
 * terminal as a command: `ESC ] 52` writes the clipboard, `ESC ] 0` sets the
 * window title, and a query sequence makes some terminals type a reply into
 * stdin, which the TUI reads as keys. So every human output replaces control
 * characters before printing. JSON output is not passed through here; it is
 * printed exactly.
 *
 * Each control character becomes one U+FFFD, so the text keeps its length and
 * a match offset into it still points at the same character.
 */

import type { CliIo } from '@osdlc/cli-tool'

/** C0 (tab and newline included), DEL and C1. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g
/** The same, but tab and newline are kept. */
const CONTROL_KEEP_LINES = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g

const REPLACEMENT = '�'

/**
 * `text` with every C0 control character (ESC included), DEL and C1 control
 * character replaced by U+FFFD. With `multiline`, tab and newline are kept,
 * for output that is already more than one line.
 */
export function terminalSafe(text: string, opts: { multiline?: boolean } = {}): string {
  return text.replace(opts.multiline === true ? CONTROL_KEEP_LINES : CONTROL, REPLACEMENT)
}

/**
 * `io` with stderr made terminal-safe. stderr carries only human text:
 * warnings, errors and notes, which can quote config values and file names.
 */
export function safeStderr(io: CliIo): CliIo {
  return { ...io, stderr: (text) => io.stderr(terminalSafe(text, { multiline: true })) }
}
