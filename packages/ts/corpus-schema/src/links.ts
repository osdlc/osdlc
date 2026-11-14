/**
 * Links in corpus-schema files (the corpus-schema spec's Links section,
 * packages/conformance/corpus-schema/SPEC.md): finding them in text, looking up bare-name
 * wikilinks by path suffix, and writing the canonical relative Markdown link.
 */
import { extname } from 'node:path'
import { bodyLinksSpanned, stripCode } from '@osdlc/markdown-link'

/** Record formats by name, as a root file's `formats` lists them, and their extensions. */
export const FORMATS: Readonly<Record<string, string>> = { md: '.md', yaml: '.yaml', json: '.json' }
/** Extensions whose files may be named in a wikilink without the extension. */
export const RECORD_EXTENSIONS: readonly string[] = Object.values(FORMATS)

export interface Link {
  kind: 'markdown' | 'wiki'
  embed: boolean
  /** The link text, or a wikilink's alias ('' when it has none). */
  text: string
  /** The path without its fragment: percent-encoded in a Markdown link, plain in a wikilink. */
  target: string
  /** The part after `#`, or ''. A wikilink's block reference keeps its `^`. */
  fragment: string
  /** Offsets of the whole link in the scanned text. */
  start: number
  end: number
}

// @osdlc/markdown-link does not find every relative Markdown link (osdlc/osdlc#635), so they are
// found here.
// [text](dest "title"): dest is <...> or a run with balanced parentheses, as in CommonMark.
const MARKDOWN =
  /(!?)\[((?:\\.|[^[\]\\\n])*)\]\(\s*(<[^<>\n]*>|(?:\\.|[^\s()\\]|\((?:\\.|[^\s()\\])*\))*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g

const unescape = (s: string): string => s.replace(/\\(.)/g, '$1')

/** `text` with code blanked to spaces, keeping its UTF-16 length so offsets index `text`. */
function blankCode(text: string): string {
  // stripCode keeps the code point count, not the UTF-16 length.
  const stripped = Array.from(stripCode(text))
  let out = ''
  let i = 0
  for (const ch of text) out += stripped[i++] === ch ? ch : ' '.repeat(ch.length)
  return out
}

/** Every Markdown link and wikilink in `text`, in order. Links in code are skipped. */
export function extractLinks(text: string): Link[] {
  const links: Link[] = []
  for (const l of bodyLinksSpanned(text)) {
    if (l.kind === 'markdown') continue
    links.push({
      kind: 'wiki',
      embed: l.kind === 'embed',
      text: l.alias ?? '',
      target: l.target,
      fragment: l.block !== null ? `^${l.block}` : (l.heading ?? ''),
      start: l.start,
      end: l.end,
    })
  }
  for (const m of blankCode(text).matchAll(MARKDOWN)) {
    const raw = m[3] ?? ''
    const dest = unescape(raw.startsWith('<') ? raw.slice(1, -1) : raw)
    const hash = dest.indexOf('#')
    links.push({
      kind: 'markdown',
      embed: m[1] === '!',
      text: unescape(m[2] ?? ''),
      target: hash < 0 ? dest : dest.slice(0, hash),
      fragment: hash < 0 ? '' : dest.slice(hash + 1),
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  return links.sort((a, b) => a.start - b.start)
}

/**
 * The key two ids or type names are compared by: NFC, then case folding. Upper- then lower-casing
 * stands in for Unicode full case folding.
 */
export const fold = (s: string): string =>
  s.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC')

/** Files by every folded key a wikilink may name them with: each whole-segment path suffix. */
export type WikilinkIndex = Map<string, string[]>

/** Index `files` for `matchWikilink`. A record's keys also leave out its extension. */
export function wikilinkIndex(files: Iterable<string>): WikilinkIndex {
  const index: WikilinkIndex = new Map()
  for (const file of files) {
    const ext = extname(file)
    const paths = [fold(file)]
    if (RECORD_EXTENSIONS.includes(ext)) paths.push(fold(file.slice(0, -ext.length)))
    const keys = new Set<string>()
    for (const p of paths) {
      keys.add(p)
      for (let i = p.indexOf('/'); i >= 0; i = p.indexOf('/', i + 1)) keys.add(p.slice(i + 1))
    }
    for (const k of keys) {
      const list = index.get(k)
      if (list === undefined) index.set(k, [file])
      else list.push(file)
    }
  }
  return index
}

/**
 * The files a bare-name wikilink names: those whose path ends with it, compared after folding. A
 * wikilink that holds a path from its file resolves as a Markdown link does, not through this.
 */
export const matchWikilink = (target: string, index: WikilinkIndex): string[] =>
  index.get(fold(target.replace(/^\.\//, ''))) ?? []

const percent = (c: string): string =>
  [...new TextEncoder().encode(c)]
    .map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('')

/**
 * A path as a Markdown link destination: `%`, whitespace, `(`, `)`, `<`, `>`, `?` and `#` are
 * percent-encoded as UTF-8. `/` is kept.
 */
export const encodePath = (path: string): string => path.replace(/[%\s()<>?#]/gu, percent)

/**
 * A Markdown link to `path`, written the way the validator reads it: `[text](path)` with `\`,
 * `[` and `]` escaped in the text and the path encoded by `encodePath`. `path` is used as given,
 * so pass it relative to the file that will hold the link.
 *
 * @param fragment - The part after `#`, such as a heading, without the `#`. `''` for none.
 * @param embed - Write an embed, `![text](path)`, instead of a link.
 */
export function markdownLink(text: string, path: string, fragment = '', embed = false): string {
  const label = text.replace(/[\\[\]]/g, '\\$&')
  const anchor = fragment === '' ? '' : `#${encodePath(fragment)}`
  return `${embed ? '!' : ''}[${label}](${encodePath(path)}${anchor})`
}
