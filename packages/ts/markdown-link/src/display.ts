/**
 * What a reader sees for a link, and typed references. A port of the
 * `markdown-link` crate's `display_text` and `parse_typed_ref`.
 */

import { type WikiLink, isWhitespace, parseInner, splitAlias, trim } from './parse.ts'

/**
 * Replace each wikilink and embed with what a reader sees for it, for
 * snippets and search: its alias, or else its target. An embed's trailing
 * `|300` or `|300x200` is a size, not an alias, so
 * `![[img.png|300]]` shows `img.png`. An empty alias shows the target. Code
 * is not skipped.
 *
 * Every delimiter is ASCII, so the scan can step UTF-16 units: a surrogate
 * never matches one.
 */
export function displayText(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const embed = text[i] === '!' && text.startsWith('[[', i + 1)
    const open = embed ? i + 1 : i
    if (text.startsWith('[[', open)) {
      const close = linkClose(text, open)
      if (close !== null) {
        const link = parseInner(text.slice(open + 2, close), embed)
        if (link !== null) out += shown(link)
        i = close + 2
        continue
      }
    }
    out += text[i]
    i++
  }
  return out
}

/** Where the `]]` closing the `[[` at `open` starts, or `null`. */
function linkClose(text: string, open: number): number | null {
  for (let j = open + 2; j + 1 < text.length; j++) {
    if (text[j] === ']' && text[j + 1] === ']') return j
    if (text[j] === '[' || text[j] === ']') return null
  }
  return null
}

/** What a reader sees for one link. See `displayText`. */
function shown(link: WikiLink): string {
  let alias = link.alias
  if (alias !== null && link.embed) {
    const pipe = alias.lastIndexOf('|')
    const last = pipe === -1 ? alias : alias.slice(pipe + 1)
    if (isSize(trim(last))) alias = pipe === -1 ? '' : trim(alias.slice(0, pipe))
  }
  return alias || link.target
}

/** `300` or `300x200`: an embed's width, or width and height. */
function isSize(s: string): boolean {
  return /^[0-9]+(?:x[0-9]+)?$/.test(s)
}

/**
 * A typed reference, `[[type/slug]]` or `[[type/slug|Alias]]`: a frontmatter
 * value naming one note of a known type, such as `location: "[[location/home]]"`.
 */
export interface TypedRef {
  /** The text before the first `/`, such as `location`. */
  kind: string
  /** The rest of the target, such as `home` or `2026/spring`. */
  slug: string
  /** The text after the first `|`, as written. */
  alias: string | null
}

/**
 * Parse a whole value as a typed reference, or `null`.
 *
 * Shape only: the target is not resolved. The value is exactly `[[...]]`
 * with no `[`, `]` or line break inside. The target ends at the first `|`,
 * minus a `\` that escapes it, as in `parseInner`. Its type and each
 * `/`-separated slug segment are non-empty and hold no whitespace.
 */
export function parseTypedRef(value: string): TypedRef | null {
  if (!value.startsWith('[[') || !value.endsWith(']]')) return null
  const inner = value.slice(2, -2)
  if (/[[\]\n\r]/.test(inner)) return null
  const [target, alias] = splitAlias(inner)
  const slash = target.indexOf('/')
  if (slash === -1) return null
  const kind = target.slice(0, slash)
  const slug = target.slice(slash + 1)
  if (!isWord(kind) || !slug.split('/').every(isWord)) return null
  return { kind, slug, alias }
}

function isWord(s: string): boolean {
  return s !== '' && !Array.from(s).some(isWhitespace)
}
