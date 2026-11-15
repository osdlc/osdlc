/**
 * Build-time `![[embed]]` rendering: the Astro build as an embed host, beside
 * markdown-render's `Embed` component.
 *
 * markdown-render's `remarkEmbeds` finds each embed and classifies it with
 * `embedKind`, leaving a `<markdown-embed>` node for the host to render.
 * This module is that host. The size and alt rules, the element per media
 * kind, the placeholders and the guard order come from markdown-render's shared
 * embed rules, which the app's component calls too:
 *
 *   - image / video / audio / pdf: an `<img>`, `<video>`, `<audio>` or a link,
 *     pointing at the copy in the public asset dir
 *   - note / heading / block: the embedded note (or its slice), read from its
 *     content file and parsed into the page, inside `div.markdown-embed-note`
 *   - anything that cannot render: a placeholder `div` saying why
 *
 * Embedded text is parsed by the host's own processor, so the site's syntax
 * extensions apply to it, and it is spliced into the page's tree, so every
 * later remark and rehype pass (wikilink resolution, code highlighting) runs
 * over it too.
 */

import { readFileSync } from 'node:fs'
import { split as splitNote } from '@osdlc/frontmatter-lossless'
import {
  embedBlocker,
  embedKind,
  embedMedia,
  embedNoteProperties,
  embedPlaceholder,
  isMediaKind,
  MAX_EMBEDS_PER_DOCUMENT,
  remarkEmbeds,
  sliceEmbed,
  type EmbedPlaceholder,
  type LinkResolution,
  type MdNode,
  type WikilinkResolver,
} from '@osdlc/markdown-render/plugins'

/** Where embed targets resolve to. Both lookups answer `null` on a miss. */
export interface EmbedLookups {
  /** A note target to the absolute path of its content file. */
  notePath(target: string): string | null
  /** A media target to its public URL. */
  mediaUrl(target: string): string | null
  /**
   * The host processor's parser, for transcluded text. Without one (the
   * plugin run outside a processor) a note embed renders the app's inert
   * placeholder, as the app does with no nested renderer.
   */
  parse?: (markdown: string) => MdNode
}

/** State shared by every nesting level of one page. */
interface PageState {
  /** Transclusions charged against {@link MAX_EMBEDS_PER_DOCUMENT}. */
  spent: number
  /** Transclusions spliced in so far, for unique reference prefixes. */
  spliced: number
}

/**
 * Resolve an embed target the way markdown-render's resolver types it: a media
 * extension is an attachment, anything else a note, and a target that names
 * no note but does name a published file is an attachment `embedKind` then
 * reads as an image.
 */
function embedResolver(lookups: EmbedLookups): WikilinkResolver {
  return (target) => {
    const missing: LinkResolution = { kind: 'missing', display: target }
    if (isMediaKind(embedKind(target, {}, 'note'))) {
      const url = lookups.mediaUrl(target)
      return url ? { kind: 'attachment', path: url, display: target } : missing
    }
    const note = lookups.notePath(target)
    if (note) return { kind: 'note', path: note, display: target }
    const url = lookups.mediaUrl(target)
    return url ? { kind: 'attachment', path: url, display: target } : missing
  }
}

/**
 * Render every `![[embed]]` in `tree`. `notePath` is the absolute path of the
 * page's own file, when the host knows it. It seeds the cycle guard, so a
 * same-note embed (`![[#Heading]]`) renders the cycle placeholder, as in the
 * app.
 */
export function renderEmbeds(
  tree: MdNode,
  notePath: string | undefined,
  lookups: EmbedLookups,
  file?: unknown,
) {
  const resolveLink = embedResolver(lookups)
  const page: PageState = { spent: 0, spliced: 0 }
  renderTree(tree, notePath, notePath ? [notePath] : [], page, lookups, resolveLink, file)
}

function renderTree(
  tree: MdNode,
  notePath: string | undefined,
  ancestors: readonly string[],
  page: PageState,
  lookups: EmbedLookups,
  resolveLink: WikilinkResolver,
  file?: unknown,
): void {
  // The scanner reads the source text, not the tree: `file` holds it as `{ value }`.
  remarkEmbeds({ resolveLink, ...(notePath !== undefined ? { notePath } : {}) })(tree, file)
  const walk = (parent: MdNode): void => {
    const children = parent.children
    if (!children) return
    for (const [i, child] of children.entries()) {
      if (child.type === 'wikiEmbed' && child.data?.hName === 'markdown-embed') {
        children[i] = renderEmbed(child, ancestors, page, lookups, resolveLink)
      } else {
        walk(child)
      }
    }
  }
  walk(tree)
}

function renderEmbed(
  node: MdNode,
  ancestors: readonly string[],
  page: PageState,
  lookups: EmbedLookups,
  resolveLink: WikilinkResolver,
): MdNode {
  const props = node.data?.hProperties ?? {}
  const target = String(props.dataEmbedTarget ?? '')
  const kind = String(props.dataEmbedKind ?? 'note')
  const path = typeof props.dataEmbedPath === 'string' ? props.dataEmbedPath : undefined
  const display = typeof props.dataEmbedDisplay === 'string' ? props.dataEmbedDisplay : undefined
  const heading = typeof props.dataEmbedHeading === 'string' ? props.dataEmbedHeading : undefined

  if (isMediaKind(kind)) {
    if (!path) return placeholder('missing-attachment', target)
    return fromHast(embedMedia(kind, path, target, display, { fragment: heading }))
  }

  // Charged before the guards, as the app charges every transclusion it
  // mounts, whatever it then renders.
  const funded = page.spent < MAX_EMBEDS_PER_DOCUMENT
  if (funded) page.spent++
  const blocker = embedBlocker(path, ancestors, funded)
  if (blocker || !path) return placeholder(blocker ?? 'missing', target)
  if (!lookups.parse) return placeholder('inert', target)

  let body: string
  try {
    body = splitNote(readFileSync(path, 'utf8')).body
  } catch {
    return placeholder('missing', target)
  }
  const blockId = typeof props.dataEmbedBlockId === 'string' ? props.dataEmbedBlockId : undefined
  const slice = sliceEmbed(body, {
    ...(heading !== undefined ? { heading } : {}),
    ...(blockId !== undefined ? { blockId } : {}),
  })
  if (slice === null) return placeholder('missing', target)

  const nested = lookups.parse(slice)
  stripPositions(nested)
  scopeReferences(nested, `embed-${++page.spliced}-`)
  renderTree(nested, path, [...ancestors, path], page, lookups, resolveLink, { value: slice })
  return {
    type: 'wikiEmbed',
    children: nested.children ?? [],
    data: { hName: 'div', hProperties: embedNoteProperties(target) },
  }
}

function placeholder(state: EmbedPlaceholder, target: string): MdNode {
  return fromHast(embedPlaceholder(state, target))
}

/** A shared hast builder's element as an mdast node remark-rehype turns back into it. */
function fromHast(el: ReturnType<typeof embedMedia>): MdNode {
  return {
    type: 'wikiEmbed',
    children: [],
    data: { hName: el.tagName, hProperties: el.properties, hChildren: el.children },
  }
}

/** Embedded nodes carry positions in another file; drop them rather than mislead. */
function stripPositions(node: MdNode): void {
  delete node.position
  for (const child of node.children ?? []) stripPositions(child)
}

/** Node types whose `identifier` / `label` share one namespace per document. */
const REFERENCE_TYPES = new Set([
  'definition',
  'linkReference',
  'imageReference',
  'footnoteDefinition',
  'footnoteReference',
])

/**
 * Prefix every link-definition and footnote identifier in an embedded tree.
 * Spliced into the page as-is, an embedded `[ref]` or `[^1]` would share the
 * page's namespace: the page's own reference would resolve to the embedded
 * note's definition, or the reverse.
 */
function scopeReferences(node: MdNode, prefix: string): void {
  if (REFERENCE_TYPES.has(node.type)) {
    if (typeof node.identifier === 'string') node.identifier = prefix + node.identifier
    if (typeof node.label === 'string') node.label = prefix + node.label
  }
  for (const child of node.children ?? []) scopeReferences(child, prefix)
}
