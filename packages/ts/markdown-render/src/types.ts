/**
 * Public types for the Obsidian-dialect renderer.
 *
 * The renderer never resolves links itself — it delegates to an injected
 * {@link WikilinkResolver} so the same pipeline serves a live vault (the notes
 * app), a build-time content collection (Astro), and a test fixture.
 */

import type { Root as HastRoot } from 'hast'
import type { TagDialect } from '@osdlc/markdown-tags'
import type { Options as Schema } from 'rehype-sanitize'

export type { Root as HastRoot } from 'hast'

/**
 * A syntax-highlighting pass: a rehype transformer run last, after sanitize.
 *
 * The renderer ships none. Opt in with `rehypeShiki()` from
 * `@osdlc/markdown-render/shiki`; a build that never imports that subpath holds
 * no Shiki code. `<MarkdownRender>` compares this function's identity to
 * decide whether to reuse its processor, so hold one instance rather than
 * creating one per render.
 */
export type HighlightPass = (tree: HastRoot) => void | Promise<void>

/** What a `[[target]]` or `![[target]]` resolved to. */
export interface LinkResolution {
  /**
   * `note` — an existing note; `attachment` — an existing non-markdown file
   * (image, pdf, …); `missing` — nothing in the vault matches; `external` —
   * an off-vault URL.
   */
  kind: 'note' | 'attachment' | 'missing' | 'external'
  /**
   * Resolved location. Used verbatim as the anchor `href` for every kind
   * except `missing`, and surfaced as `data-path` for the host app. Absent
   * for `missing`.
   */
  path?: string
  /** Visible label. Defaults to the alias, else the target's last segment. */
  display: string
  /** `#heading` fragment, if the link carried one. */
  heading?: string
  /** `#^block-id` fragment, if the link carried one. */
  blockId?: string
}

/**
 * Resolves a wikilink target against whatever backing store the host has.
 *
 * @param target The raw target as written, minus alias and fragment.
 * @param fromPath Path of the note containing the link, for relative
 *   resolution. Absent when the caller did not supply `notePath`.
 */
export type WikilinkResolver = (target: string, fromPath?: string) => LinkResolution

/**
 * A loaded note, split into body and raw frontmatter by the host.
 * Core, not Vue-side: the editor's framework-free entry needs it for its provider's loadNote.
 */
export interface LoadedNote {
  /** Markdown body, frontmatter already removed. */
  body: string
  /** The raw YAML text between the fences, if the note had any. */
  frontmatterYaml?: string
  /**
   * What the host calls this note — `skill`, `command`, a vault's own note
   * type. Surfaced by a transclusion's fold header, so a reader can see the
   * kind of what an embed pulled in. Absent in a vault with no such notion.
   *
   * The loader answers it because the loader already knows: it read the note
   * to get the body. A widget looking the kind up a second time would ask a
   * different source and could disagree with the content beside it.
   */
  kind?: string
  /** Icon token for {@link kind} (e.g. `'i-lucide-file-text'`), for hosts that render one. */
  icon?: string
}

/** Options for {@link createMarkdownProcessor} and friends. */
export interface MarkdownRenderOptions {
  /** Wikilink/embed resolver. Defaults to {@link defaultResolver}. */
  resolveLink?: WikilinkResolver
  /** Path of the note being rendered, forwarded to the resolver. */
  notePath?: string
  /** Highlighting pass, see {@link HighlightPass}. Off unless given. */
  highlight?: HighlightPass
  /** Parse `$math$` / `$$math$$`. Default `false`. */
  math?: boolean
  /**
   * Honour `%%comment%%` as an Obsidian comment, deleting the span it wraps.
   * Default `true`.
   *
   * Set `false` for text that is not a vault note. The syntax is a vault
   * authoring convention, and applying it to text written elsewhere deletes
   * author content: a doubled percent — printf, LaTeX, a SQL or Python format
   * string — reads as a marker, and an unmatched one swallows the rest of the
   * document. The loss is silent, so a reader with no access to the source
   * cannot tell it happened.
   */
  comments?: boolean
  /**
   * Which inline `#tag` rule to apply: `obsidian` (the default), `unicode` or
   * `ascii`, as `@osdlc/markdown-tags` defines them.
   */
  tagDialect?: TagDialect
  /**
   * Sanitize schema. Defaults to {@link markdownSchema}. `false` disables
   * sanitization entirely — only ever safe for content you authored.
   */
  sanitize?: Schema | false
}

/** One entry of a document outline, from {@link extractOutline}. */
export interface OutlineEntry {
  /** 1–6, matching `h1`–`h6`. */
  depth: number
  /** Flattened heading text. */
  text: string
  /** Slug id, matching the rendered element's `id`; empty when the heading has no slug (`# !!!`) and so no anchor. */
  id: string
}
