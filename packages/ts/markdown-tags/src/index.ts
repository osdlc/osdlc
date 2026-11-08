/**
 * Inline `#tag` lexing for Markdown note bodies, in three dialects: the
 * TypeScript twin of the `markdown-tags` crate. Each function gives the same
 * answer as its Rust namesake, and both suites read the crate's
 * `tests/fixtures/conformance.json`.
 */

import { stripCode } from '@osdlc/markdown-link'

/** Every dialect name, default first. */
export const TAG_DIALECTS = ['obsidian', 'unicode', 'ascii'] as const

/**
 * Which inline-tag dialect to scan with: `obsidian` (the renderer's rule),
 * `unicode` or `ascii`. The crate docs, `packages/rust/markdown-tags/src/lib.rs`,
 * state each rule.
 */
export type TagDialect = (typeof TAG_DIALECTS)[number]

export const DEFAULT_TAG_DIALECT: TagDialect = 'obsidian'

/** Whether `value` names a dialect, for checking a setting value. */
export function isTagDialect(value: unknown): value is TagDialect {
  return (TAG_DIALECTS as readonly unknown[]).includes(value)
}

/**
 * Inline `#tag`s in a body, in encounter order.
 *
 * Not deduplicated: callers dedupe at different points, and deduping here
 * would decide which duplicate wins for them.
 */
export function inlineTags(body: string, dialect: TagDialect = DEFAULT_TAG_DIALECT): string[] {
  switch (dialect) {
    case 'obsidian':
      return scan(blankLinkSyntax(stripCode(body)), OBSIDIAN)
    case 'unicode':
      return scan(body, UNICODE)
    case 'ascii':
      return scan(stripCode(body), ASCII)
  }
}

/**
 * The tag whose `#` sits at UTF-16 offset `index` in `text`, or `null`. It
 * applies the dialect's character rule only, with no code or link blanking,
 * for a caller that already holds plain text: the renderer's text node, or
 * the editor's inline parser, which reads code and links itself.
 */
export function tagAt(
  text: string,
  index: number,
  dialect: TagDialect = DEFAULT_TAG_DIALECT,
): string | null {
  return tagWith(text, index, RULES[dialect])
}

/** The `unicode` and `ascii` dialects from one body: `[unicode, ascii]`. */
export function extractBoth(body: string): [string[], string[]] {
  return [inlineTags(body, 'unicode'), inlineTags(body, 'ascii')]
}

/** One dialect's character tests. Each takes one code point. */
interface Rule {
  /** A `#` after this character may open a tag. */
  opensAfter: (c: string) => boolean
  /** The first character of a tag. */
  starts: (c: string) => boolean
  /** Every later character of a tag. */
  continues: (c: string) => boolean
  /** At least one character of the tag must pass this. */
  needsOne: (c: string) => boolean
}

const TAG_CHAR = /^[\p{Alphabetic}\p{N}_/-]$/u
const NOT_A_NUMBER = /^[\p{Alphabetic}_/-]$/u
// Rust's `char::is_whitespace` is the White_Space property. JavaScript's
// `\s` differs from it on U+0085 and U+FEFF, and `obsidian` follows `\s`
// because the renderer's regex does.
const WHITE_SPACE = /^\p{White_Space}$/u
const JS_SPACE = /^\s$/u
const ASCII_START = /^[A-Za-z_]$/
const ASCII_CHAR = /^[A-Za-z0-9_/-]$/

const isTagChar = (c: string) => TAG_CHAR.test(c)

const OBSIDIAN: Rule = {
  opensAfter: (c) => c === '(' || JS_SPACE.test(c),
  starts: isTagChar,
  continues: isTagChar,
  needsOne: (c) => NOT_A_NUMBER.test(c),
}

const UNICODE: Rule = {
  opensAfter: (c) => WHITE_SPACE.test(c),
  starts: isTagChar,
  continues: isTagChar,
  needsOne: () => true,
}

const ASCII: Rule = {
  opensAfter: (c) => c === '(' || WHITE_SPACE.test(c),
  starts: (c) => ASCII_START.test(c),
  continues: (c) => ASCII_CHAR.test(c),
  needsOne: () => true,
}

const RULES: Record<TagDialect, Rule> = { obsidian: OBSIDIAN, unicode: UNICODE, ascii: ASCII }

/**
 * Every tag in `text`. A port of the crate's `scan`. The crate skips past a
 * run that fails `needsOne`; this moves to the next `#`, which is the same
 * place, because a run holds no `#`.
 */
function scan(text: string, rule: Rule): string[] {
  const out: string[] = []
  let i = text.indexOf('#')
  while (i !== -1) {
    const tag = tagWith(text, i, rule)
    if (tag !== null) out.push(tag)
    i = text.indexOf('#', i + 1 + (tag?.length ?? 0))
  }
  return out
}

/**
 * The tag at `index` under `rule`: the longest run of tag characters after
 * the `#`, if the `#` may open a tag and the run passes `needsOne`. Reads
 * whole code points, as the crate reads chars.
 */
function tagWith(text: string, index: number, rule: Rule): string | null {
  if (text[index] !== '#') return null
  if (index > 0 && !rule.opensAfter(codePointBefore(text, index))) return null
  let end = index + 1
  let passes = false
  while (end < text.length) {
    const c = String.fromCodePoint(text.codePointAt(end)!)
    if (!(end === index + 1 ? rule.starts(c) : rule.continues(c))) break
    if (rule.needsOne(c)) passes = true
    end += c.length
  }
  return passes ? text.slice(index + 1, end) : null
}

function codePointBefore(text: string, index: number): string {
  const low = text.charCodeAt(index - 1)
  const high = text.charCodeAt(index - 2)
  const pair = low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff
  return text.slice(pair ? index - 2 : index - 1, index)
}

/**
 * Blank, to spaces, what the renderer never reads as text: the inside of an
 * inline link's or image's `(destination "title")`, and the rest of a link
 * reference definition's line after its `]:`. Newlines and the code point
 * count are kept. The crate's `blank_link_syntax` documents the rules; this
 * follows the same steps.
 */
function blankLinkSyntax(text: string): string {
  const chars = Array.from(text)
  blankDestinations(chars)
  blankDefinitions(chars)
  return chars.join('')
}

function blankDestinations(chars: string[]): void {
  // Most bodies have no inline link; skip pairing parentheses for them.
  if (!chars.some((c, i) => c === ']' && chars[i + 1] === '(')) return
  const closes = parenCloses(chars)
  let open = 0
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (c === '\\') i++
    else if (c === '\n' && endsParagraph(chars, i)) open = 0
    else if (c === '[') open++
    else if (c === ']' && open > 0) {
      open--
      const close = chars[i + 1] === '(' ? closes.get(i + 1) : undefined
      if (close !== undefined) {
        blank(chars, i + 2, close)
        i = close
      }
    }
  }
}

/**
 * For each `(`, the `)` that balances it within its paragraph. One stack
 * pass, so a paragraph of unclosed `(` costs linear time, not quadratic.
 */
function parenCloses(chars: string[]): Map<number, number> {
  const closes = new Map<number, number>()
  const stack: number[] = []
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (c === '\\') i++
    else if (c === '\n' && endsParagraph(chars, i)) stack.length = 0
    else if (c === '(') stack.push(i)
    else if (c === ')') {
      const open = stack.pop()
      if (open !== undefined) closes.set(open, i)
    }
  }
  return closes
}

/** Whether the newline at `i` is followed by a blank line or the end. */
function endsParagraph(chars: string[], i: number): boolean {
  let j = i + 1
  while (chars[j] === ' ' || chars[j] === '\t') j++
  return j >= chars.length || chars[j] === '\n' || chars[j] === '\r'
}

function blankDefinitions(chars: string[]): void {
  let mayStart = true
  let start = 0
  while (start < chars.length) {
    let end = chars.indexOf('\n', start)
    if (end === -1) end = chars.length
    const line = chars.slice(start, end)
    const colon = definitionColon(line)
    if (line.every((c) => WHITE_SPACE.test(c))) mayStart = true
    else if (mayStart && colon !== null) blank(chars, start + colon + 1, end)
    else mayStart = false
    start = end + 1
  }
}

/** The index of the `:` in a `[label]:` line, or `null` when the line is not one. */
function definitionColon(line: string[]): number | null {
  let indent = 0
  while (line[indent] === ' ') indent++
  if (indent > 3 || line[indent] !== '[' || line[indent + 1] === '^') return null
  let j = indent + 1
  let label = false
  for (; j < line.length; j++) {
    const c = line[j]!
    if (c === '\\') j++
    else if (c === '[') return null
    else if (c === ']') break
    else if (!WHITE_SPACE.test(c)) label = true
  }
  return label && line[j] === ']' && line[j + 1] === ':' ? j + 1 : null
}

function blank(chars: string[], from: number, to: number): void {
  for (let k = from; k < to; k++) {
    if (chars[k] !== '\n' && chars[k] !== '\r') chars[k] = ' '
  }
}
