/**
 * Turning what the terminal sends into keys.
 *
 * One read can hold several keys: a paste, a fast key repeat, or an arrow
 * followed by typed text. Each escape sequence is one key, and every other
 * character is a key of its own.
 */

/**
 * Split one read from a raw-mode terminal into keys.
 *
 * - `ESC [` then parameter bytes, then a final byte from `@` to `~`, is one key
 *   (`ESC [ A`, `ESC [ 1 ; 2 A`, `ESC [ 5 ~`).
 * - `ESC O` and one more character is one key (`ESC O H` from some terminals).
 * - `ESC` followed by another character is that character with Alt, one key.
 * - `ESC` at the end of the read, or before another `ESC`, is the Escape key.
 * - Anything else is one key per code point, so a paste becomes typed text.
 *
 * A sequence cut off at the end of the read is passed on whole, so the rest
 * of it is not typed into the query.
 */
export function splitKeys(chunk: string): string[] {
  const keys: string[] = []
  let i = 0
  while (i < chunk.length) {
    if (chunk[i] !== '\x1b') {
      const ch = String.fromCodePoint(chunk.codePointAt(i)!)
      keys.push(ch)
      i += ch.length
      continue
    }
    const next = chunk[i + 1]
    if (next === undefined || next === '\x1b') {
      keys.push('\x1b')
      i += 1
      continue
    }
    if (next === '[') {
      let j = i + 2
      // Parameter and intermediate bytes, 0x20-0x3f.
      while (j < chunk.length && chunk.charCodeAt(j) >= 0x20 && chunk.charCodeAt(j) <= 0x3f) j++
      const final = chunk.charCodeAt(j)
      const end = final >= 0x40 && final <= 0x7e ? j + 1 : j
      keys.push(chunk.slice(i, end))
      i = end
      continue
    }
    if (next === 'O') {
      const end = Math.min(chunk.length, i + 3)
      keys.push(chunk.slice(i, end))
      i = end
      continue
    }
    const alt = String.fromCodePoint(chunk.codePointAt(i + 1)!)
    keys.push(`\x1b${alt}`)
    i += 1 + alt.length
  }
  return keys
}

/** The names the key handler matches on, for the keys that have several encodings. */
export type NamedKey = 'up' | 'down' | 'pageUp' | 'pageDown' | 'home' | 'end' | 'shiftTab'

const NAMED: Record<string, NamedKey> = {
  '\x1b[A': 'up',
  '\x1bOA': 'up',
  '\x1b[B': 'down',
  '\x1bOB': 'down',
  '\x1b[5~': 'pageUp',
  '\x1b[6~': 'pageDown',
  '\x1b[H': 'home',
  '\x1bOH': 'home',
  '\x1b[1~': 'home',
  '\x1b[7~': 'home',
  '\x1b[F': 'end',
  '\x1bOF': 'end',
  '\x1b[4~': 'end',
  '\x1b[8~': 'end',
  '\x1b[Z': 'shiftTab',
}

/** The name of a key with several encodings, or undefined. */
export function namedKey(key: string): NamedKey | undefined {
  return NAMED[key]
}

/** Whether `key` is typed text: one printable character, not a control or a sequence. */
export function isText(key: string): boolean {
  if (key.length === 0 || key.startsWith('\x1b')) return false
  const code = key.codePointAt(0)!
  return code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f)
}
