/**
 * `@osdlc/markdown-render/plugins` — the remark/rehype dialect plugins with no
 * Vue and no Shiki in the module graph, for hosts (Astro, static builds) that
 * assemble their own pipeline. The root entry re-exports the same list plus
 * the Shiki pieces; the two lists are kept in step by hand.
 */

export {
  remarkWikilinks,
  defaultResolver,
  defaultDisplay,
  splitFragment,
  wikilinkNode,
  wikilinkProps,
  type RemarkWikilinksOptions,
} from './wikilinks.ts'
export {
  remarkEmbeds,
  embedKind,
  isMediaKind,
  MAX_EMBED_DEPTH,
  MAX_EMBEDS_PER_DOCUMENT,
  type EmbedKind,
  type RemarkEmbedsOptions,
} from './embeds.ts'
export {
  embedAlt,
  embedBlocker,
  embedMedia,
  embedNoteProperties,
  embedPlaceholder,
  embedSize,
  type EmbedBlocker,
  type EmbedMediaOptions,
  type EmbedPlaceholder,
} from './embed-render.ts'
// Partial transclusion slices the source, so a host that loads embedded notes
// itself needs it as much as the plugins.
export { sliceEmbed } from '../slice.ts'
export { remarkCallouts, defaultTitle, type CalloutFold, type CalloutInfo } from './callouts.ts'
export {
  remarkMarkdownLinks,
  splitMarkdownLink,
  type RemarkMarkdownLinksOptions,
} from './markdown-links.ts'
export {
  remarkMarkdownImages,
  splitMarkdownImage,
  type RemarkMarkdownImagesOptions,
} from './markdown-images.ts'
export { remarkTags, type RemarkTagsOptions } from './tags.ts'
export { remarkMark } from './mark.ts'
export { remarkBlockIds, BLOCK_ID_RE } from './block-ids.ts'
export { remarkComments } from './comments.ts'
// The escape pair brackets the tokenizers: without it, escaped syntax
// (`\[\[Note]]`, `\#tag`) activates as if the author had not escaped it.
export { remarkEscapes, remarkUnescape } from './escapes.ts'
export { remarkHeadingIds, nodeText } from './heading-ids.ts'
export { remarkDataLine } from './data-line.ts'

// Fence metadata. `fenceLang` lives in its own shiki-free module, so the pass
// a self-assembling host needs for `data-line`/`data-lang` on the `<pre>` is
// in the graph while Shiki stays out. `RESERVED_FENCE_LANGS` deliberately does NOT follow: it
// configures the highlight pass and lives with it at `/shiki`.
export { rehypeCodeMeta } from './code-meta.ts'
export { fenceLang } from './fence-lang.ts'

export { setHProps, hastNode, type MdNode, type MdParent } from './util.ts'

export type { LinkResolution, WikilinkResolver } from '../types.ts'
