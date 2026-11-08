/**
 * `![[embed]]` tokenizer.
 *
 * Embeds become a `<markdown-embed>` custom element rather than resolved
 * markup: what an embed *renders* depends on the host (a Vue component that
 * loads the note, an Astro build step that inlines it), so the core pipeline
 * only records the intent. The sanitize schema allows the element through.
 */

import { visit, SKIP } from 'unist-util-visit'
import type { WikilinkResolver } from '../types.ts'
import { defaultResolver, splitFragment } from './wikilinks.ts'
import { tokenizeLinks, type FoundLink } from './link-scan.ts'
import { isAudioPath, isImagePath, isPdfPath, isVideoPath } from '../paths.ts'
import { hastNode, type MdNode, type MdParent } from './util.ts'
import { unmaskEscaped } from './escapes.ts'

export type EmbedKind = 'note' | 'image' | 'video' | 'audio' | 'pdf' | 'heading' | 'block'

/** Kinds that are a file rendered in place rather than a note transcluded. */
const MEDIA_KINDS = new Set<string>(['image', 'video', 'audio', 'pdf'])

/** Is this embed a media file — no load, no nested render, no recursion? */
export function isMediaKind(kind: string): boolean {
  return MEDIA_KINDS.has(kind)
}

/** How deep `![[embeds]]` may nest before the renderer stops. */
export const MAX_EMBED_DEPTH = 5

/**
 * How many transclusions one document may render, across every level.
 *
 * The depth cap alone is not a work cap: N embeds per note, nested D deep, is
 * N^D loads and nested renders, and N=7 at three levels already reaches 399
 * without any guard firing. A budget makes the total cost of a document O(1)
 * in the shape of its embed graph rather than exponential in it.
 *
 * Media embeds are not charged — they neither recurse nor load a note. 128
 * live transclusions is far past any hand-written note, and the ones past the
 * line say so on screen rather than disappearing.
 */
export const MAX_EMBEDS_PER_DOCUMENT = 128

export interface RemarkEmbedsOptions {
  resolveLink?: WikilinkResolver
  notePath?: string
}

/**
 * Classify an embed. A media extension wins: a fragment on a media file is not
 * a section to transclude (`![[doc.pdf#page=3]]` is Obsidian's PDF page
 * syntax), so the file still renders as media. Otherwise a fragment names
 * what is transcluded, and an `attachment` the resolver could not type falls
 * back to `image`.
 */
export function embedKind(
  target: string,
  fragment: { heading?: string; blockId?: string },
  resolvedKind: string,
): EmbedKind {
  if (isVideoPath(target)) return 'video'
  if (isAudioPath(target)) return 'audio'
  if (isPdfPath(target)) return 'pdf'
  if (isImagePath(target)) return 'image'
  if (fragment.blockId) return 'block'
  if (fragment.heading) return 'heading'
  if (resolvedKind === 'attachment') return 'image'
  return 'note'
}

/**
 * The embed a paragraph holds and nothing else (whitespace aside), or
 * `undefined`. Such a paragraph is a block-level transclusion, unwrapped so the
 * host renders it as a block rather than inline in a `<p>`. Exported for
 * `remarkCallouts`, which builds a callout's body paragraph after this plugin's
 * unwrap pass has run.
 */
export function loneEmbed(paragraph: MdNode): MdNode | undefined {
  const meaningful = (paragraph.children ?? []).filter(
    (child) => !(child.type === 'text' && !String(child.value ?? '').trim()),
  )
  const embed = meaningful[0]
  if (meaningful.length !== 1 || !embed || embed.type !== 'wikiEmbed') return undefined
  // Spelt out rather than `??=`: the paragraph's position is itself optional,
  // and under exactOptionalPropertyTypes assigning a possibly undefined value
  // into an optional property is a type error. Only a real position is copied
  // down.
  if (embed.position === undefined && paragraph.position !== undefined) {
    embed.position = paragraph.position
  }
  return embed
}

/** Remark plugin: tokenize `![[embeds]]` into `<markdown-embed>` nodes. */
export function remarkEmbeds(options: RemarkEmbedsOptions = {}) {
  const resolve = options.resolveLink ?? defaultResolver

  /** One embed: what the plugin builds for the text between its brackets. */
  const buildEmbed = ({ inner }: FoundLink): MdNode | null => {
    const pipe = inner.indexOf('|')
    const before = pipe < 0 ? inner : inner.slice(0, pipe)
    const hash = before.indexOf('#')
    const target = (hash < 0 ? before : before.slice(0, hash)).trim()
    const fragment = splitFragment(hash < 0 ? undefined : before.slice(hash + 1))
    // `![[]]` names nothing; embedding the current note would be a
    // self-transclusion. It stays literal. An alias does not change that
    // (`![[|x]]` still names nothing to embed), unlike `[[|x]]`, which is a
    // visible link back to the current note.
    if (!target && !fragment.heading && !fragment.blockId) return null

    const resolved = target
      ? resolve(unmaskEscaped(target), options.notePath)
      : { kind: 'note' as const, path: options.notePath, display: target }
    const kind = embedKind(target, fragment, resolved.kind)

    const props: Record<string, unknown> = {
      dataEmbedTarget: target,
      dataEmbedKind: kind,
      dataResolvedKind: resolved.kind,
    }
    if (resolved.kind !== 'missing' && resolved.path !== undefined) {
      props.dataEmbedPath = resolved.path
    }
    if (fragment.heading) props.dataEmbedHeading = fragment.heading
    if (fragment.blockId) props.dataEmbedBlockId = fragment.blockId
    const display = (pipe < 0 ? '' : inner.slice(pipe + 1)).trim()
    if (display) props.dataEmbedDisplay = display

    return hastNode('wikiEmbed', 'markdown-embed', props)
  }

  return (tree: MdNode, file?: unknown) => {
    tokenizeLinks(tree, file, { kind: 'embed', build: buildEmbed })

    // An embed alone in a paragraph is a block-level transclusion; unwrap it.
    visit(tree as never, 'paragraph', (node: MdNode, i: number | undefined, parent: MdParent) => {
      if (i === undefined || !parent) return
      const embed = loneEmbed(node)
      if (!embed) return
      parent.children.splice(i, 1, embed)
      return [SKIP, i + 1]
    })
  }
}
