/** A record's Markdown body as HTML, with its links to records pointing at their pages. */
import { renderToHtmlSync, type LinkResolution } from '@osdlc/markdown-render'
import { safeDecode, type Site, type SiteRecord } from './site.ts'

/**
 * Markdown from the file `fromPath` of the corpus with key `corpus`, as sanitized HTML. A link
 * to a record's file becomes a link to the record's page, a link to a schema file a link to the
 * type's index, and a link to a file of a record folder a link to the served file. A relative
 * link to anything else is marked missing, as the renderer marks a wikilink with no note.
 */
export function renderMarkdown(
  site: Site,
  markdown: string,
  fromPath: string,
  corpus = '',
): string {
  const resolveLink = (target: string): LinkResolution => {
    const display = target.split('/').pop()?.replace(/\.md$/i, '') ?? target
    const found = site.resolveLink(corpus, fromPath, target)
    if (found === null || found.url === null)
      return { kind: 'missing', display: found?.title ?? display }
    return { kind: 'note', path: found.url, display: found.title }
  }
  const html = renderToHtmlSync(markdown, { resolveLink, notePath: fromPath, comments: false })
  // The renderer resolves links to Markdown files only. A relative link or image that names
  // another file of the corpus, such as one in a record folder, is pointed at the served file.
  return html.replace(/ (href|src)="([^"]+)"/g, (whole, attribute: string, value: string) => {
    if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) return whole
    const [path = '', fragment] = unescapeAttribute(value).split('#')
    const found = site.resolveLink(corpus, fromPath, safeDecode(path))
    if (found === null || found.url === null) return whole
    const url = fragment === undefined ? found.url : `${found.url}#${fragment}`
    return ` ${attribute}="${url.replace(/&/g, '&#x26;').replace(/"/g, '&#x22;')}"`
  })
}

const unescapeAttribute = (value: string): string =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')

/** The HTML of a record's body, or null for a record with none. */
export function renderBody(site: Site, record: SiteRecord): string | null {
  const body = record.record.body
  if (body === null || body.trim() === '') return null
  return renderMarkdown(site, body, record.record.path, record.corpus)
}

/**
 * Markdown as plain text, for the search index: no code fences, link targets, emphasis marks,
 * heading marks or HTML tags, and white space collapsed.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/^```.*$/gm, ' ')
    .replace(/!?\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^[ \t]*(#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, '')
    .replace(/[*_`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
