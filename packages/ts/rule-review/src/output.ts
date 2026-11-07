/**
 * What the commands print. Reports quote the agent's findings, git's errors
 * and check scripts' output, none of which this package controls, so every
 * line goes through `stripControls`: text can never move the cursor, recolor
 * the terminal or set its title.
 */
import { stripControls } from '@osdlc/ux'

import { errorText } from './changeset.ts'

/** Write `text` to stderr, terminal controls removed (line feeds and tabs stay). */
export function say(text: string): void {
  process.stderr.write(stripControls(text, { newline: true, tab: true }))
}

/** Write `text` to stdout, terminal controls removed (line feeds and tabs stay). */
export function print(text: string): void {
  process.stdout.write(stripControls(text, { newline: true, tab: true }))
}

/** Print an error line, `rule-review: <message>`, on stderr. */
export function sayError(err: unknown): void {
  say(`rule-review: ${errorText(err)}\n`)
}
