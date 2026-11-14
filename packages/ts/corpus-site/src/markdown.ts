/** A record's Markdown body as HTML with its links pointing at their pages, and Markdown as plain text. */
import type { Element, Parent, Root } from 'hast'
import rehypeStringify from 'rehype-stringify'
import {
  createMarkdownProcessor,
  embedMedia,
  embedPlaceholder,
  isMediaKind,
  type LinkResolution,
} from '@osdlc/markdown-render'
import { safeDecode, type Site, type SiteRecord } from './site.ts'

/**
 * Markdown from the file `fromPath` of the corpus with key `corpus`, as sanitized HTML. A link
 * to a record's file becomes a link to the record's page, a link to a schema file a link to the
 * type's index, and a link to a file of a record folder a link to the served file. A link to
 * a `.md` file that is none of these is marked missing, as the renderer marks a wikilink with
 * no note. Any other relative link is left as written.
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
  // Runs after sanitizing. The URLs it writes come from the site, and only elements are touched,
  // so the text of a code sample stays as written.
  const serve = () => (tree: Root) => servePage(site, corpus, fromPath, tree)
  const processor = createMarkdownProcessor({ resolveLink, notePath: fromPath, comments: false })
    .use(serve)
    .use(rehypeStringify, { allowDangerousHtml: false })
  return String(processor.processSync(markdown))
}

/**
 * The renderer resolves links to Markdown files only, and leaves an embed for the host. Point a
 * relative link or image that names another file of the corpus, such as one in a record folder,
 * at the served file, and draw each image, video, audio and PDF embed.
 */
function servePage(site: Site, corpus: string, fromPath: string, tree: Root): void {
  const served = (value: string): string | null => {
    if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) return null
    const [path = '', fragment] = value.split('#')
    const found = site.resolveLink(corpus, fromPath, safeDecode(path))
    if (found === null || found.url === null) return null
    return fragment === undefined ? found.url : `${found.url}#${fragment}`
  }
  const visit = (parent: Parent): void => {
    parent.children = parent.children.map((child) => {
      if (child.type !== 'element') return child
      if (child.tagName === 'markdown-embed') return embedded(child) ?? child
      for (const name of ['href', 'src'] as const) {
        const value = child.properties[name]
        const url = typeof value === 'string' ? served(value) : null
        if (url !== null) child.properties[name] = url
      }
      visit(child)
      return child
    })
  }
  visit(tree)
}

/** The element for a media embed, or null for an embed of a note. */
function embedded(embed: Element): Element | null {
  const { dataEmbedKind: kind, dataEmbedTarget: target, dataEmbedPath: path } = embed.properties
  const display = embed.properties['dataEmbedDisplay']
  if (typeof kind !== 'string' || typeof target !== 'string' || !isMediaKind(kind)) return null
  if (typeof path !== 'string') return embedPlaceholder('missing-attachment', target)
  return embedMedia(kind, path, target, typeof display === 'string' ? display : undefined)
}

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
