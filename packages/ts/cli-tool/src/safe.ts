/**
 * Text from outside the tool (a file's keys, a path, a message) made safe to
 * print on a terminal.
 */

import { stripControls } from '@osdlc/ux'

/**
 * `text` with every terminal control removed except line feeds and tabs, so
 * printing it cannot move the cursor, recolor the terminal or set its title.
 */
export function safe(text: string): string {
  return stripControls(text, { newline: true, tab: true })
}

/**
 * {@link safe} for text that must stay on one line (a list entry, a value in
 * brackets): line feeds and tabs show as `\n` and `\t` instead of breaking
 * the line, and every other terminal control is removed.
 */
export function safeLine(text: string): string {
  return stripControls(text.replaceAll('\n', '\\n').replaceAll('\t', '\\t'))
}
