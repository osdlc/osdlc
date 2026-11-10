/**
 * How a `<markdown-embed>` renders, as pure functions over hast.
 *
 * `remarkEmbeds` only records an embed; a host renders it. This package's
 * Vue `Embed` component and the Astro build (`@osdlc/markdown-vault-astro`)
 * are two such hosts, and both call these, so the size and alt rules, the
 * element per media kind, the placeholders and the guard order exist once.
 * Each builder returns a hast element: the Astro build splices it into its
 * tree, and the Vue component turns it into a VNode.
 */

import type { Element, ElementContent } from 'hast'
import { MAX_EMBED_DEPTH } from './embeds.ts'

/** A display alias split into its label and a trailing size, if the last `|` part is one. */
function splitSize(display: string | undefined): {
  label: string
  size?: { width: number; height?: number }
} {
  const text = display ?? ''
  const pipe = text.lastIndexOf('|')
  const match = /^(\d+)(?:x(\d+))?$/.exec(text.slice(pipe + 1).trim())
  if (!match) return { label: text.trim() }
  const size = { width: Number(match[1]), ...(match[2] ? { height: Number(match[2]) } : {}) }
  return { label: pipe === -1 ? '' : text.slice(0, pipe).trim(), size }
}

/**
 * `![[image.png|300]]`, `![[image.png|300x200]]` or `![[image.png|Caption|300]]`
 * — Obsidian reads a numeric last `|` part as a size, not as a label.
 */
export function embedSize(
  display: string | undefined,
): { width: number; height?: number } | undefined {
  return splitSize(display).size
}

/**
 * The alt text (or PDF link text): the display alias without any size, else
 * the target.
 */
export function embedAlt(target: string, display: string | undefined): string {
  return splitSize(display).label || target
}

/** The `#page=N` fragment a PDF link keeps, so it opens at that page as in Obsidian. */
const PDF_PAGE = /^page=\d+$/

/** Why a transclusion renders a placeholder rather than its note. */
export type EmbedBlocker = 'missing' | 'cycle' | 'too-deep' | 'over-budget'

/**
 * The guards a note, heading or block embed passes before its note loads, in
 * order: something to load, no cycle, under the depth cap, inside the
 * document's budget.
 *
 * @param path The resolved note path, or `undefined` when there is none (or
 *   nothing to load it with).
 * @param ancestors Paths of the notes this embed sits inside, outermost first.
 * @param funded Whether the embed holds a charge of the document budget.
 */
export function embedBlocker(
  path: string | undefined,
  ancestors: readonly string[],
  funded: boolean,
): EmbedBlocker | null {
  if (!path) return 'missing'
  if (ancestors.includes(path)) return 'cycle'
  if (ancestors.length >= MAX_EMBED_DEPTH) return 'too-deep'
  if (!funded) return 'over-budget'
  return null
}

/** Every placeholder an embed can show. `missing-attachment` is a media file that cannot be served. */
export type EmbedPlaceholder = EmbedBlocker | 'missing-attachment' | 'loading' | 'inert'

/** A placeholder `div` saying why an embed shows nothing else. */
export function embedPlaceholder(state: EmbedPlaceholder, target: string): Element {
  switch (state) {
    case 'missing-attachment':
      return placeholder('missing', target, `Missing attachment: ${target}`)
    case 'missing':
      return placeholder('missing', target, `Missing embed: ${target}`)
    case 'cycle':
      return placeholder('cycle', target, `Circular embed: ${target}`)
    case 'too-deep':
      return placeholder('too-deep', target, `Embed nested deeper than ${MAX_EMBED_DEPTH}`)
    case 'over-budget':
      return placeholder('over-budget', target, `Too many embeds in this note: ${target}`)
    case 'inert':
      return placeholder('inert', target, target)
    case 'loading':
      return element(
        'div',
        { className: ['markdown-embed', 'markdown-embed-loading'] },
        `Loading ${target}…`,
      )
  }
}

function placeholder(modifier: string, target: string, message: string): Element {
  return element(
    'div',
    { className: ['markdown-embed', `markdown-embed-${modifier}`], dataEmbedTarget: target },
    message,
  )
}

/** Options for {@link embedMedia}. */
export interface EmbedMediaOptions {
  /** Host properties, such as `dataLine`, set on the element. */
  extra?: Record<string, unknown>
  /** The embed's `#` fragment. A PDF link keeps a `page=N` one. */
  fragment?: string | undefined
}

/**
 * The element for a media embed: `<video>`, `<audio>`, a link for a PDF, or
 * an `<img>`. See {@link EmbedMediaOptions} for the options.
 *
 * A PDF gets no frame: a PDF viewer is a host decision (and an `<iframe>` from
 * note content is a much bigger door than this needs to open). An honest link
 * is the affordance the dialect can offer on its own.
 */
export function embedMedia(
  kind: string,
  src: string,
  target: string,
  display: string | undefined,
  { extra = {}, fragment }: EmbedMediaOptions = {},
): Element {
  const size = embedSize(display)
  const shared = { src, ...extra, dataEmbedTarget: target }
  switch (kind) {
    case 'video':
      return element('video', {
        ...shared,
        className: ['markdown-embed', 'markdown-embed-video'],
        controls: true,
        ...size,
      })
    case 'audio':
      return element('audio', {
        ...shared,
        className: ['markdown-embed', 'markdown-embed-audio'],
        controls: true,
      })
    case 'pdf':
      return element(
        'a',
        {
          className: ['markdown-embed', 'markdown-embed-pdf'],
          href: fragment && PDF_PAGE.test(fragment) ? `${src}#${fragment}` : src,
          target: '_blank',
          rel: ['noopener', 'noreferrer'],
          ...extra,
          dataEmbedTarget: target,
        },
        embedAlt(target, display),
      )
    default:
      return element('img', {
        ...shared,
        className: ['markdown-embed', 'markdown-embed-image'],
        alt: embedAlt(target, display),
        ...size,
      })
  }
}

/** Properties of the `div` a transcluded note renders inside. */
export function embedNoteProperties(
  target: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { className: ['markdown-embed', 'markdown-embed-note'], dataEmbedTarget: target, ...extra }
}

function element(tagName: string, properties: Record<string, unknown>, label?: string): Element {
  const children: ElementContent[] = label === undefined ? [] : [{ type: 'text', value: label }]
  return { type: 'element', tagName, properties: properties as Element['properties'], children }
}
