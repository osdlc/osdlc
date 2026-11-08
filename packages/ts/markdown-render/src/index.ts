/**
 * `@osdlc/markdown-render` — an Obsidian-dialect markdown renderer built on
 * unified/remark.
 *
 * Framework-free: this entry never imports Vue. The Vue 3 integration lives at
 * `@osdlc/markdown-render/vue`.
 *
 * The source passed in is a note *body* — frontmatter is framing, split off by
 * the caller, so the renderer never reads it.
 */

export {
  createMarkdownProcessor,
  renderToHast,
  renderToHtml,
  renderToHtmlSync,
} from './processor.ts'
export { loadKatex, renderMath, type KatexModule } from './math.ts'
export {
  createMermaidRenderer,
  renderMermaid,
  type MermaidLike,
  type MermaidTheme,
} from './mermaid.ts'
export { extractOutline, hastText } from './outline.ts'
export {
  sliceByHeading,
  sliceByBlockId,
  sliceEmbed,
  sourceHeadings,
  type SourceHeading,
} from './slice.ts'
export { markdownSchema } from './sanitize.ts'
export { isSafeLinkPath, isSafeAssetUrl, urlScheme } from './url.ts'
export {
  ATTACHMENT_EXTENSIONS,
  EMBEDDABLE_EXTENSIONS,
  isAudioPath,
  isBasePath,
  isCanvasPath,
  isDelimitedPath,
  isImagePath,
  isMarkdownPath,
  isPdfPath,
  isTextualPath,
  isVideoPath,
  noteBasename,
  noteExtension,
  noteFolder,
  noteStem,
  stripMarkdownExt,
} from './paths.ts'

export type {
  HighlightPass,
  LinkResolution,
  LoadedNote,
  MarkdownRenderOptions,
  OutlineEntry,
  WikilinkResolver,
} from './types.ts'

// Dialect plugins, individually usable in a host's own pipeline.
export {
  remarkWikilinks,
  defaultResolver,
  defaultDisplay,
  splitFragment,
  wikilinkNode,
  wikilinkProps,
  type RemarkWikilinksOptions,
} from './plugins/wikilinks.ts'
export {
  remarkEmbeds,
  embedKind,
  isMediaKind,
  MAX_EMBED_DEPTH,
  MAX_EMBEDS_PER_DOCUMENT,
  type EmbedKind,
  type RemarkEmbedsOptions,
} from './plugins/embeds.ts'
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
} from './plugins/embed-render.ts'
export {
  remarkCallouts,
  defaultTitle,
  type CalloutFold,
  type CalloutInfo,
} from './plugins/callouts.ts'
export {
  remarkMarkdownLinks,
  splitMarkdownLink,
  type RemarkMarkdownLinksOptions,
} from './plugins/markdown-links.ts'
export {
  remarkMarkdownImages,
  splitMarkdownImage,
  type RemarkMarkdownImagesOptions,
} from './plugins/markdown-images.ts'
export { remarkTags, type RemarkTagsOptions } from './plugins/tags.ts'
export { remarkMark } from './plugins/mark.ts'
export { remarkBlockIds, BLOCK_ID_RE } from './plugins/block-ids.ts'
export { remarkComments } from './plugins/comments.ts'
// A host assembling its own pipeline needs both halves, and needs them to
// bracket the tokenizers — without them escaped syntax activates.
export { remarkEscapes, remarkUnescape } from './plugins/escapes.ts'
export { remarkHeadingIds, nodeText } from './plugins/heading-ids.ts'
export { remarkDataLine } from './plugins/data-line.ts'
export { rehypeCodeMeta } from './plugins/code-meta.ts'
export { fenceLang } from './plugins/fence-lang.ts'
// Shiki lives at `@osdlc/markdown-render/shiki`; this entry never reaches it.

export { setHProps, hastNode, type MdNode, type MdParent } from './plugins/util.ts'

// What routes an element to a component, and what a note's own markup loses.
// Exported for a host that builds its own hast and has to draw the same line.
export {
  carriesRoutingSignal,
  isRoutingClass,
  stripRoutingSignals,
  CLASS_ROUTES,
  FENCE_LANG_PROP,
  STRIPPED_CLASSES,
  type ClassRoute,
} from './routing-signals.ts'
