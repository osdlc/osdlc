/**
 * The Vue-side injection contract: where a note's content comes from, and
 * where interaction events go.
 *
 * `NoteSource` is the seam between this renderer and the host app's vault —
 * the renderer never touches a filesystem, an index, or a router.
 */

import { inject, provide, type Component, type ComputedRef, type InjectionKey } from 'vue'
import type {
  LinkResolution,
  LoadedNote,
  MarkdownRenderOptions,
  WikilinkResolver,
} from '@osdlc/markdown-render'
import type { ComponentMap } from './render.ts'

/** Everything the Vue layer needs from the host's vault. */
export interface NoteSource {
  /** Resolve a `[[wikilink]]` / `![[embed]]` target. */
  resolveLink: WikilinkResolver
  /**
   * Load a note for transclusion. `null` when it does not exist.
   *
   * The `path` originates in note text — it is this host's own `resolveLink`
   * answer to a target somebody typed — so an implementation must treat it as
   * untrusted input and check it against its own store rather than
   * concatenating it onto a root. The renderer rejects URL schemes it will not
   * act on and refuses to hand this method anything but its own pipeline's
   * output, but it has no idea what a traversal means to your backing store.
   */
  loadNote(path: string): Promise<LoadedNote | null>
  /**
   * URL for an attachment, or `null` when it cannot be served. The renderer
   * only paints the result when it is `http:`, `https:`, `blob:`, or
   * same-origin.
   */
  assetUrl(target: string, fromPath?: string): string | null
}

export const NoteSourceKey: InjectionKey<NoteSource> = Symbol('markdown-render:note-source')

/** Install the vault seam for a subtree. */
export function provideNoteSource(source: NoteSource): void {
  provide(NoteSourceKey, source)
}

/**
 * Read the vault seam. Returns `undefined` when no host installed one — the
 * renderer still works, it just cannot resolve links or load embeds.
 */
export function useNoteSource(): NoteSource | undefined {
  return inject(NoteSourceKey, undefined)
}

/** A wikilink resolution plus the target as it was written. */
export interface WikilinkTarget extends LinkResolution {
  target: string
}

/**
 * A fold toggle, identified the way each kind is keyed (R-02): a heading
 * section by its id (the slug `remarkHeadingIds` stamps), a list item by its
 * source line — there is no id for a plain list item. `folded` is the state
 * the click just produced, not the one it left.
 */
export type FoldTogglePayload =
  { kind: 'heading'; id: string; folded: boolean } | { kind: 'list'; line: number; folded: boolean }

/** Events the rendered tree routes back up to `MarkdownRender`. */
export interface RenderHandlers {
  linkClick(resolution: WikilinkTarget, event: MouseEvent): void
  linkHover(payload: { resolution: WikilinkTarget; el: HTMLElement } | null): void
  /**
   * The event is optional because not every caller has one: a tag clicked
   * inside a transclusion reaches the host through `Embed`'s bridge,
   * and `MarkdownRender`'s `tag-click` emit carries only the tag.
   */
  tagClick(tag: string, event?: MouseEvent): void
  taskToggle(line: number, checked: boolean): void
  foldToggle(payload: FoldTogglePayload): void
}

const NOOP_HANDLERS: RenderHandlers = {
  linkClick() {},
  linkHover() {},
  tagClick() {},
  taskToggle() {},
  foldToggle() {},
}

export const HandlersKey: InjectionKey<RenderHandlers> = Symbol('markdown-render:handlers')

export function useHandlers(): RenderHandlers {
  return inject(HandlersKey, NOOP_HANDLERS)
}

/**
 * Paths of the notes an embed is nested inside, outermost first. Used for
 * cycle detection and the depth cap — an embed that would re-enter a note
 * already on this chain renders a placeholder instead of recursing forever.
 *
 * Every entry is a path *as the resolver spells it*, because that is what an
 * embed has to compare against: `data-embed-path` is resolver output. A nested
 * note's `notePath` already arrives that way; the outermost one comes from the
 * host's `notePath` prop, so `MarkdownRender` runs it through the resolver
 * too — which is what catches a note embedding itself on the first hop rather
 * than after one full extra copy.
 *
 * Exactly one entry per note: `Embed` reads the chain's length as the
 * nesting depth, so a second spelling of any note would spend a level of the
 * depth cap.
 *
 * Reactive: `notePath` is a live prop, and a host that swaps the note in place
 * has to re-base the whole chain under it.
 */
export const EmbedAncestorsKey: InjectionKey<readonly string[]> = Symbol(
  'markdown-render:embed-ancestors',
)

// The limits live with the embed plugin, which has no Vue in its graph, so a
// host that renders embeds without Vue (the Astro build) applies the same ones.
export { MAX_EMBED_DEPTH, MAX_EMBEDS_PER_DOCUMENT } from '@osdlc/markdown-render'

/**
 * The document-wide transclusion budget. Shared by the whole render tree.
 *
 * `spent` is a live count, not a running total.
 * `MarkdownRender` makes the object reactive before providing it, so an embed
 * that mounted over budget can claim a charge a later unmount releases.
 */
export interface EmbedBudget {
  /** Transclusions currently mounted: each takes a charge and gives it back. */
  spent: number
  /** Ceiling, defaulting to {@link MAX_EMBEDS_PER_DOCUMENT}. */
  limit: number
}

export const EmbedBudgetKey: InjectionKey<EmbedBudget> = Symbol('markdown-render:embed-budget')

/**
 * `MarkdownRender` provides itself here so `Embed` can recurse
 * without a circular module import.
 */
export const MarkdownComponentKey: InjectionKey<Component> = Symbol(
  'markdown-render:markdown-component',
)

/**
 * The host `<MarkdownRender>`'s `options` prop, so a transclusion runs the
 * same pipeline as the note around it: the host's sanitize schema, `math`,
 * `highlight`, and any `resolveLink` override. Without it a stricter host
 * schema would stop at the embed boundary.
 *
 * The prop, not the merged options `MarkdownRender` computes: `notePath` is
 * per-note, and `Embed` strips it before passing this down.
 */
export const HostOptionsKey: InjectionKey<ComputedRef<Partial<MarkdownRenderOptions> | undefined>> =
  Symbol('markdown-render:host-options')

/**
 * The host `<MarkdownRender>`'s `components` prop, so a host's overrides
 * apply inside a transclusion too.
 *
 * The prop, not the merged route table: the nested instance builds its own
 * defaults, and the outer instance's merged map carries a `foldable` `li`
 * route that must never reach a transclusion (folding is outermost-only).
 */
export const HostComponentsKey: InjectionKey<ComputedRef<ComponentMap | undefined>> = Symbol(
  'markdown-render:host-components',
)

/**
 * Which list items (by source line) are currently folded (R-02).
 *
 * A `li` can appear at any nesting depth, routed generically like any other
 * override — unlike a heading section, which `MarkdownRender`'s own render
 * closure builds directly and can hand `open`/`onToggle` as plain props.
 * `ListItemFold` has no such direct line to its owning `MarkdownRender`, so
 * the current fold set travels down through injection instead, the same way
 * `HandlersKey` carries the way back up. A `ComputedRef` rather than a plain
 * value: `MarkdownRender` provides one bound to its own `foldedLists` prop,
 * so a list item re-reads it reactively rather than freezing whatever was
 * true when it first mounted.
 */
export const FoldStateKey: InjectionKey<ComputedRef<{ lists: ReadonlySet<number> }>> = Symbol(
  'markdown-render:fold-state',
)

/**
 * Whether a task checkbox here is live. Unprovided means live; `Embed`
 * provides `false` for everything below it, because it keeps `task-toggle`
 * from crossing the embed boundary (its line belongs to the embedded note), so
 * a checkbox in a transclusion could only be a control that does nothing — it
 * keeps GFM's `disabled` instead. A renderer a host mounts inside another one
 * outside any embed is a host of its own, and stays live.
 */
export const TasksLiveKey: InjectionKey<boolean> = Symbol('markdown-render:tasks-live')
