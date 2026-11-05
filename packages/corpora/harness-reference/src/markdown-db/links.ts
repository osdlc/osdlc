/**
 * Links in markdown-db files (docs/standards/S-GFFY-markdown-db.md, Links): finding them in text,
 * matching wikilinks by path suffix, and writing the canonical relative Markdown link.
 */
import { extname } from 'node:path'

export interface Link {
  kind: 'markdown' | 'wiki'
  embed: boolean
  /** The link text, or a wikilink's alias ('' when it has none). */
  text: string
  /** The path without its fragment: percent-encoded in a Markdown link, plain in a wikilink. */
  target: string
  /** The part after `#`, or ''. */
  fragment: string
  /** Offsets of the whole link in the scanned text. */
  start: number
  end: number
}

/** Extensions whose files may be named in a wikilink without the extension. */
export const RECORD_EXTENSIONS = ['.md', '.yaml', '.json']

const WIKI = /(!?)\[\[([^[\]\n]+)\]\]/g
// [text](dest "title"): dest is <...> or a run with balanced parentheses, as in CommonMark.
const MARKDOWN =
  /(!?)\[((?:\\.|[^[\]\\\n])*)\]\(\s*(<[^<>\n]*>|(?:\\.|[^\s()\\]|\((?:\\.|[^\s()\\])*\))*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g
const FENCE = /^ {0,3}((`|~)\2{2,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1\2*[ \t]*$|(?![\s\S]))/gm
const CODE_SPAN = /(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g

const blank = (s: string): string => s.replace(/[^\n]/g, ' ')
const unescape = (s: string): string => s.replace(/\\(.)/g, '$1')

/** Split `a#b` into its path and fragment. */
function splitFragment(s: string): [string, string] {
  const hash = s.indexOf('#')
  return hash < 0 ? [s, ''] : [s.slice(0, hash), s.slice(hash + 1)]
}

/**
 * Every Markdown link and wikilink in `text`, in order. With `markdown`, fenced code blocks and code
 * spans are skipped, as in a note's body.
 */
export function extractLinks(text: string, { markdown = false } = {}): Link[] {
  const scanned = markdown ? text.replace(FENCE, blank).replace(CODE_SPAN, blank) : text
  const links: Link[] = []
  for (const m of scanned.matchAll(WIKI)) {
    const inner = (m[2] ?? '').replace(/\\\|/g, '|')
    const bar = inner.indexOf('|')
    const [path, fragment] = splitFragment(bar < 0 ? inner : inner.slice(0, bar))
    links.push({
      kind: 'wiki',
      embed: m[1] === '!',
      text: bar < 0 ? '' : inner.slice(bar + 1).trim(),
      target: path.trim(),
      fragment: fragment.trim(),
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  for (const m of scanned.matchAll(MARKDOWN)) {
    const raw = m[3] ?? ''
    const [target, fragment] = splitFragment(unescape(raw.startsWith('<') ? raw.slice(1, -1) : raw))
    links.push({
      kind: 'markdown',
      embed: m[1] === '!',
      text: unescape(m[2] ?? ''),
      target,
      fragment,
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  return links.sort((a, b) => a.start - b.start)
}

/** NFC, then case folding. Upper- then lower-casing stands in for Unicode full case folding. */
export const fold = (s: string): string =>
  s.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC')

/** The files a wikilink target names: those whose path ends with it, compared after folding. */
export function matchWikilink(target: string, files: readonly string[]): string[] {
  const wanted = fold(target.replace(/^\.?\//, ''))
  return files.filter((file) => {
    const ext = extname(file)
    const keys = [fold(file)]
    if (RECORD_EXTENSIONS.includes(ext)) keys.push(fold(file.slice(0, -ext.length)))
    return keys.some((k) => k === wanted || k.endsWith(`/${wanted}`))
  })
}

const percent = (c: string): string =>
  [...new TextEncoder().encode(c)]
    .map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('')

/** A path as a link destination: spaces and the characters that end one are percent-encoded. */
export const encodePath = (path: string): string => path.replace(/[%\s()<>?#]/gu, percent)

/** A relative Markdown link to `path`. */
export function markdownLink(text: string, path: string, fragment = '', embed = false): string {
  const label = text.replace(/[\\[\]]/g, '\\$&')
  const anchor = fragment === '' ? '' : `#${encodePath(fragment)}`
  return `${embed ? '!' : ''}[${label}](${encodePath(path)}${anchor})`
}
