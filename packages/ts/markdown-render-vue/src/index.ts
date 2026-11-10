/**
 * `@osdlc/markdown-render-vue` — the Vue 3 integration.
 *
 * Vue is a peer dependency; the core entry (`@osdlc/markdown-render`) never
 * imports it, so SSR and build-time callers pay nothing for this module.
 *
 * Styling comes from `@osdlc/markdown-render/theme.css`, which the host imports.
 * KaTeX users must also import `katex/dist/katex.min.css`.
 */

export { MarkdownRender, defaultComponents } from './MarkdownRender.ts'

export {
  provideNoteSource,
  useNoteSource,
  useHandlers,
  MAX_EMBED_DEPTH,
  MAX_EMBEDS_PER_DOCUMENT,
  type FoldTogglePayload,
  type NoteSource,
  type RenderHandlers,
  type WikilinkTarget,
} from './context.ts'

export {
  renderNode,
  renderChildren,
  matchOverride,
  routeKeys,
  toVueProps,
  hastNodeText,
  attrName,
  classList,
  type ComponentMap,
  type HastNode,
  type RenderContext,
} from './render.ts'

// The chrome contract: what a host walking the rendered DOM must skip to be
// left with the note's own text. See `chrome.ts` for what is in and out.
export { RENDER_CHROME_SELECTOR } from './chrome.ts'

export { Embed } from './components/Embed.ts'
export { WikilinkAnchor, resolutionFromNode } from './components/WikilinkAnchor.ts'
export { TagAnchor } from './components/TagAnchor.ts'
export { Callout } from './components/Callout.ts'
export { TaskCheckbox } from './components/TaskCheckbox.ts'
export { MermaidBlock } from './components/MermaidBlock.ts'
export { CodeBlock } from './components/CodeBlock.ts'
export { TableBlock } from './components/TableBlock.ts'
export { MathBlock, MathInline } from './components/MathBlock.ts'
export { HeadingSectionFold } from './components/HeadingSectionFold.ts'
export { ListItemFold } from './components/ListItemFold.ts'

export {
  groupHeadingSections,
  renderHeadingSections,
  type HeadingSection,
  type HeadingFoldContext,
} from './heading-sections.ts'
