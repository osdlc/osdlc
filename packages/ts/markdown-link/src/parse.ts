/**
 * One wikilink body, and one markdown link URL. A port of the `wikilink`
 * crate's `parse_inner`, `target_range`, `is_vault_link_url` and
 * `md_link_target`.
 */

/** A parsed `[[target#heading|alias]]`. */
export interface WikiLink {
  target: string
  heading: string | null
  alias: string | null
  embed: boolean
}

/** A half-open range of UTF-16 offsets, `[start, end)`. */
export interface TextRange {
  start: number
  end: number
}

/**
 * Parse a single wikilink body (the text between the brackets).
 *
 * A `\` right before the first `|` is the escape a GFM table cell needs
 * (`[[Note\|alias]]`) and is dropped from the target or heading.
 *
 * @returns `null` when the target is empty: a blank body, or one holding only
 * a `#heading` or an `|alias`.
 */
export function parseInner(inner: string, embed: boolean): WikiLink | null {
  const target = targetRange(inner)
  if (target === null) return null
  const [beforeAlias, alias] = splitAlias(inner)
  const hash = beforeAlias.indexOf('#')
  return {
    target: inner.slice(target.start, target.end),
    heading: hash === -1 ? null : trim(beforeAlias.slice(hash + 1)),
    alias: alias === null ? null : trim(alias),
    embed,
  }
}

/**
 * The range of `parseInner`'s target within `inner`, for a caller that
 * rewrites the target in place and must leave the rest of the link as written.
 * UTF-16 offsets, where the Rust crate returns byte offsets.
 */
export function targetRange(inner: string): TextRange | null {
  const [beforeAlias] = splitAlias(inner)
  const hash = beforeAlias.indexOf('#')
  const raw = hash === -1 ? beforeAlias : beforeAlias.slice(0, hash)
  const target = trim(raw)
  if (target === '') return null
  const lead = raw.length - trimStart(raw).length
  return { start: lead, end: lead + target.length }
}

/** `inner` split at the first `|`, minus the `\` that escapes it. */
export function splitAlias(inner: string): [string, string | null] {
  const pipe = inner.indexOf('|')
  if (pipe === -1) return [inner, null]
  const before = inner.slice(0, pipe)
  return [before.endsWith('\\') ? before.slice(0, -1) : before, inner.slice(pipe + 1)]
}

/**
 * Whether a UTF-16 unit is Unicode White_Space, as Rust's `char::is_whitespace`
 * reads it. Every White_Space character is in the BMP. JavaScript's `trim` and
 * `\s` differ: they treat U+FEFF as space and U+0085 as not.
 */
function isSpaceUnit(unit: number): boolean {
  return (
    (unit >= 0x09 && unit <= 0x0d) ||
    unit === 0x20 ||
    unit === 0x85 ||
    unit === 0xa0 ||
    unit === 0x1680 ||
    (unit >= 0x2000 && unit <= 0x200a) ||
    unit === 0x2028 ||
    unit === 0x2029 ||
    unit === 0x202f ||
    unit === 0x205f ||
    unit === 0x3000
  )
}

function trimStart(s: string): string {
  let start = 0
  while (start < s.length && isSpaceUnit(s.charCodeAt(start))) start++
  return s.slice(start)
}

export function trim(s: string): string {
  const rest = trimStart(s)
  let end = rest.length
  while (end > 0 && isSpaceUnit(rest.charCodeAt(end - 1))) end--
  return rest.slice(0, end)
}

/** Whether a single code point is Unicode White_Space. */
export function isWhitespace(c: string): boolean {
  return c.length === 1 && isSpaceUnit(c.charCodeAt(0))
}

/**
 * Every non-markdown extension that counts as a vault attachment (lowercase,
 * no dot). Matched case-insensitively, unlike the `.md` rule.
 *
 * This answers "is this file an attachment", not "can it be displayed".
 * `tiff` and `heic` are real attachments a photo library produces that no
 * browser reliably paints: they belong in a graph and a search index, not in
 * an `<img>`.
 *
 * The Rust `markdown-link` crate's `ATTACHMENT_EXTENSIONS` is the same list;
 * `tests/attachment-extensions.test.ts` fails if they disagree.
 */
export const ATTACHMENT_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'avif',
  'bmp',
  'ico',
  'tiff',
  'heic',
  'mp4',
  'webm',
  'ogv',
  'mov',
  'mkv',
  'mp3',
  'wav',
  'm4a',
  '3gp',
  'flac',
  'ogg',
  'oga',
  'opus',
  'pdf',
  'base',
  'canvas',
]

/**
 * Whether a markdown link's URL is one this dialect harvests: a note, or a
 * vault attachment.
 *
 * The `.md` test is case-sensitive (`x.MD` is not a link) and needs at least
 * one character before the extension (`.md` is not either).
 */
export function isVaultLinkUrl(url: string): boolean {
  if (url.length > 3 && url.endsWith('.md')) return true
  const last = url.slice(url.lastIndexOf('/') + 1)
  const dot = last.lastIndexOf('.')
  // A leading dot is a hidden file, not an extension, and a trailing dot is no
  // extension at all.
  if (dot <= 0) return false
  return ATTACHMENT_EXTENSIONS.includes(last.slice(dot + 1).toLowerCase())
}

/**
 * The resolution target of a markdown link's URL: percent-decoded, minus its
 * trailing `.md`.
 *
 * `.md` and then `.MD` are stripped **repeatedly**, so `a.md.md` targets `a`.
 * Only when neither strips anything does a single case-insensitive `.md` come
 * off.
 */
export function mdLinkTarget(url: string): string {
  const decoded = percentDecode(url)
  let trimmed = decoded
  while (trimmed.endsWith('.md')) trimmed = trimmed.slice(0, -3)
  while (trimmed.endsWith('.MD')) trimmed = trimmed.slice(0, -3)
  return trimmed.length === decoded.length ? stripMdExt(decoded) : trimmed
}

/** Drop a trailing `.md`, ignoring ASCII case. */
function stripMdExt(s: string): string {
  return /\.[mM][dD]$/.test(s) ? s.slice(0, -3) : s
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/**
 * Percent-decode a string over its UTF-8 bytes, as the Rust crate's
 * `percent_decode` does. Each valid `%XX` decodes on its own, so a stray `%`
 * (`100%`) stays as written. Bytes that do not decode to UTF-8 leave the whole
 * string as written, rather than becoming U+FFFD.
 */
export function percentDecode(s: string): string {
  if (!s.includes('%')) return s
  const bytes = new TextEncoder().encode(s)
  const out: number[] = []
  let i = 0
  while (i < bytes.length) {
    if (bytes[i] === 0x25 && i + 2 < bytes.length) {
      const value = hexByte(bytes[i + 1]!, bytes[i + 2]!)
      if (value !== null) {
        out.push(value)
        i += 3
        continue
      }
    }
    out.push(bytes[i]!)
    i++
  }
  try {
    return utf8Decoder.decode(Uint8Array.from(out))
  } catch {
    return s
  }
}

/**
 * Two bytes read as Rust's `u8::from_str_radix(_, 16)` reads them: two hex
 * digits, or a `+` sign and one hex digit.
 */
function hexByte(a: number, b: number): number | null {
  const low = hexDigit(b)
  if (low === null) return null
  if (a === 0x2b) return low
  const high = hexDigit(a)
  return high === null ? null : high * 16 + low
}

function hexDigit(byte: number): number | null {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x37
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x57
  return null
}
