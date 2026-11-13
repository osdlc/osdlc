/**
 * What the commands print. Reports quote the agent's findings, git's errors
 * and check scripts' output, none of which this package controls, so every
 * line goes through `stripControls`: text can never move the cursor, recolor
 * the terminal or set its title.
 */
import { stripControls } from '@osdlc/ux'

/** Write `text` to stderr, terminal controls removed (line feeds and tabs stay). */
export function say(text: string): void {
  process.stderr.write(stripControls(text, { newline: true, tab: true }))
}

/** Write `text` to stdout, terminal controls removed (line feeds and tabs stay). */
export function print(text: string): void {
  process.stdout.write(stripControls(text, { newline: true, tab: true }))
}

/**
 * Print `value` as one JSON document on stdout, `indent` spaces deep. Every
 * string in it has terminal controls removed before it is serialized:
 * stripping the finished JSON instead would let an 8-bit string opener (such
 * as U+009D) swallow the rest of the document, and `JSON.stringify` writes
 * ESC as the text `\u001b`, which a parser would turn back into ESC.
 */
export function printJson(value: unknown, indent?: number): void {
  const clean = (_key: string, v: unknown) =>
    typeof v === 'string' ? stripControls(v, { newline: true, tab: true }) : v
  process.stdout.write(JSON.stringify(value, clean, indent) + '\n')
}
