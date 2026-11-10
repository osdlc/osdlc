/**
 * `<MarkdownRender>` — render a note body as Vue.
 *
 * Rendering is asynchronous (the pipeline is, and Shiki doubly so), so the
 * component keeps the previous VNode tree on screen until the next one is
 * ready, and a monotonic render id drops results that arrive out of order.
 * Nothing ever flashes empty between edits.
 */

import {
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  provide,
  reactive,
  shallowRef,
  watch,
  watchEffect,
  type Component,
  type PropType,
} from 'vue'
import type { Root } from 'hast'

import {
  createMarkdownProcessor,
  extractOutline,
  type MarkdownProcessor,
  type MarkdownRenderOptions,
} from '@osdlc/markdown-render'
import { renderChildren, type ComponentMap } from './render.ts'
import { renderHeadingSections } from './heading-sections.ts'
import {
  EmbedAncestorsKey,
  EmbedBudgetKey,
  FoldStateKey,
  HandlersKey,
  HostComponentsKey,
  HostOptionsKey,
  MarkdownComponentKey,
  MAX_EMBEDS_PER_DOCUMENT,
  useNoteSource,
  type EmbedBudget,
  type FoldTogglePayload,
  type RenderHandlers,
  type WikilinkTarget,
} from './context.ts'
import { Embed } from './components/Embed.ts'
import { WikilinkAnchor } from './components/WikilinkAnchor.ts'
import { TagAnchor } from './components/TagAnchor.ts'
import { Callout } from './components/Callout.ts'
import { TaskCheckbox } from './components/TaskCheckbox.ts'
import { MermaidBlock } from './components/MermaidBlock.ts'
import { CodeBlock } from './components/CodeBlock.ts'
import { TableBlock } from './components/TableBlock.ts'
import { MathBlock, MathInline } from './components/MathBlock.ts'
import { ListItemFold } from './components/ListItemFold.ts'

/**
 * The options `createMarkdownProcessor` reads; a change to any of them rebuilds
 * the processor. The `satisfies` check fails to compile when
 * `MarkdownRenderOptions` gains a key that is not listed here.
 */
const PROCESSOR_FIELDS = Object.keys({
  resolveLink: true,
  notePath: true,
  math: true,
  sanitize: true,
  highlight: true,
  tagDialect: true,
  comments: true,
} satisfies Record<keyof MarkdownRenderOptions, true>) as (keyof MarkdownRenderOptions)[]

/** No fold is ever mutated in place — one shared instance for every default. */
const NO_FOLDED_HEADINGS: ReadonlySet<string> = new Set()
const NO_FOLDED_LISTS: ReadonlySet<number> = new Set()

/**
 * Built-in route table. The `components` prop merges over this, so a host can
 * replace any of them — or claim a new fence language with a `lang:` key.
 *
 * `foldable` adds the one route that is opt-in — `li` → {@link ListItemFold} —
 * and defaults to off, because fold chrome a host has not wired up is a
 * control that does nothing. See `MarkdownRender`'s `foldable` prop.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export function defaultComponents(foldable = false): ComponentMap {
  return {
    'markdown-embed': Embed,
    'a.wikilink': WikilinkAnchor,
    'a.tag': TagAnchor,
    'div.callout': Callout,
    'input.checkbox': TaskCheckbox,
    'lang:mermaid': MermaidBlock,
    'lang:math': MathBlock,
    'math-inline': MathInline,
    // Least specific of the fence routes: `routeKeys` tries `lang:<language>`
    // first, so a claimed language never reaches the code-block chrome.
    pre: CodeBlock,
    // Built in rather than left to the host, so every table gets the same
    // chrome without the host registering anything — inside a
    // `![[transclusion]]` as much as outside one.
    table: TableBlock,
    // Fold-from-a-bullet (R-02). Routing this key turns EVERY `<li>` in the
    // document into a component instance, so it is only ever added when the
    // host asked for folding — see `ListItemFold`'s header.
    ...(foldable ? { li: ListItemFold } : {}),
  }
}

export const MarkdownRender = defineComponent({
  name: 'MarkdownRender',
  props: {
    /** Note body. Frontmatter is the caller's to strip. */
    source: { type: String, required: true },
    /** Path of this note, used for relative link resolution and cycle detection. */
    notePath: { type: String, default: undefined },
    /** Component overrides, merged over {@link defaultComponents}. */
    components: { type: Object as PropType<ComponentMap>, default: undefined },
    /** Pipeline options, merged over the ones derived from `NoteSource`. */
    options: {
      type: Object as PropType<Partial<MarkdownRenderOptions>>,
      default: undefined,
    },
    /**
     * Opt in to fold chrome (R-02): heading sections and list-item toggles,
     * both of which also require this to be the OUTERMOST instance.
     *
     * Off by default. A toggle is a visible, keyboard-focusable control, and
     * a host that has not wired `@fold-toggle` and the `folded-*` props back
     * around renders one that does nothing when pressed. Unlike `pre`
     * or `table` chrome, a heading section is not routed through
     * `components`, so a host cannot decline it there either.
     *
     * The GFM footnotes `<section data-footnotes>` is never inside a heading
     * section: it renders as a top-level sibling after them, so no fold can
     * hide the document's footnotes.
     */
    foldable: { type: Boolean, default: false },
    /**
     * Heading ids (R-02) currently folded — reading view only, a host's
     * concern entirely: this prop changes what renders, never what the
     * pipeline produces. Empty by default, and an empty set costs one
     * `.has()` per heading, nothing more — see `renderHeadingSections`.
     * Read only when `foldable` is on.
     */
    foldedHeadings: {
      type: Object as PropType<ReadonlySet<string>>,
      default: () => NO_FOLDED_HEADINGS,
    },
    /** Source lines (R-02) of list items currently folded. Same contract. */
    foldedLists: {
      type: Object as PropType<ReadonlySet<number>>,
      default: () => NO_FOLDED_LISTS,
    },
  },
  emits: {
    'link-click': (_payload: { resolution: WikilinkTarget; event: MouseEvent }) => true,
    'link-hover': (_payload: { resolution: WikilinkTarget; el: HTMLElement } | null) => true,
    'tag-click': (_tag: string) => true,
    'task-toggle': (_payload: { line: number; checked: boolean }) => true,
    'fold-toggle': (_payload: FoldTogglePayload) => true,
    rendered: (_payload: { tree: Root; outline: ReturnType<typeof extractOutline> }) => true,
  },
  setup(props, { emit }) {
    const noteSource = useNoteSource()

    // Bound, because a class-based `NoteSource` reads `this` — handing the bare
    // method to the pipeline throws on the first link. Bound ONCE, because the
    // processor memo below compares `resolveLink` by identity: a fresh wrapper
    // per evaluation would rebuild the whole plugin chain on every render.
    // `noteSource` is injected and never changes for this instance's life.
    const resolveLink = noteSource ? noteSource.resolveLink.bind(noteSource) : undefined

    const tree = shallowRef<Root | null>(null)
    const error = shallowRef<Error | null>(null)
    let renderId = 0

    // Extend the embed chain with this note, so a nested embed can detect a
    // cycle back into any ancestor rather than only its immediate parent.
    //
    // An embed compares against `data-embed-path`, which is resolver output.
    // Every nested `notePath` already is one — `Embed` passes the
    // resolution down — but the outermost one is whatever the host calls this
    // note, and a host has every reason to pass its own vault path (it is what
    // `resolveLink(target, fromPath)` needs). Running that through the resolver
    // is what makes a note embedding itself stop on the first hop instead of
    // after a full extra copy.
    const ancestors = inject(EmbedAncestorsKey, [] as readonly string[])
    const isOutermost = ancestors.length === 0
    // One array, whose CONTENTS are rewritten — because `notePath` is a live
    // prop here exactly as it is for `run()` below. A chain built once in
    // `setup()` would keep naming the note the host had navigated away from,
    // and an embed of that former note would report a false cycle.
    // Reactive rather than recomputed per read so a nested renderer's own chain
    // follows its parent's.
    const chain = reactive<string[]>([])
    watchEffect(() => {
      chain.splice(0, chain.length, ...ancestors, ...selfIdentity(isOutermost))
    })
    provide(EmbedAncestorsKey, chain)

    // Folding is opt-in AND outermost-only, for lists as much as for headings:
    // a transclusion's list lines are its own note's, and would collide with
    // the host note's `foldedLists` keys.
    const foldable = computed(() => props.foldable && isOutermost)

    const components = computed<ComponentMap>(() => ({
      ...defaultComponents(foldable.value),
      ...(props.components ?? {}),
    }))

    const renderOptions = computed<MarkdownRenderOptions>(() => ({
      ...(resolveLink !== undefined ? { resolveLink } : {}),
      ...(props.notePath !== undefined ? { notePath: props.notePath } : {}),
      // Last, so a host-supplied option still wins over both above.
      ...(props.options ?? {}),
    }))

    // Both props travel down to `Embed`, which passes them to the
    // nested renderer so a transclusion runs under the same pipeline and route
    // table as the note around it. See the keys' headers for why these are the
    // raw props rather than the merged values above.
    provide(
      HostOptionsKey,
      computed(() => props.options),
    )
    provide(
      HostComponentsKey,
      computed(() => props.components),
    )

    // The outermost renderer owns the transclusion budget; nested ones inherit
    // it and only spend. It counts LIVE transclusions — each embed holds its
    // charge for as long as it is mounted — so there is nothing to clear per
    // render. Reactive, because an embed that was over budget when it mounted
    // watches for a charge to be released and claims it.
    const inheritedBudget = inject(EmbedBudgetKey, null)
    const budget: EmbedBudget = reactive(
      inheritedBudget ?? { spent: 0, limit: MAX_EMBEDS_PER_DOCUMENT },
    )
    provide(EmbedBudgetKey, budget)

    // One processor per instance, rebuilt only when a field the plugin chain
    // captured actually changes. Building the ~18-plugin chain per render was
    // a measurable slice of every keystroke and every re-render; a changed
    // options IDENTITY alone (the common re-render trigger) reuses it, since
    // `resolveLink` is a live closure the plugins call at run time.
    let processor: MarkdownProcessor | null = null
    let processorFor: MarkdownRenderOptions | null = null
    const run = async () => {
      const id = ++renderId
      try {
        const options = renderOptions.value
        if (
          !processor ||
          !processorFor ||
          PROCESSOR_FIELDS.some((key) => options[key] !== processorFor![key])
        ) {
          processor = createMarkdownProcessor(options)
          processorFor = options
        }
        const next = (await processor.run(processor.parse(props.source), {
          value: props.source,
        })) as unknown as Root
        // A slower earlier render must never overwrite a newer one.
        if (id !== renderId) return
        tree.value = next
        error.value = null
        await nextTick()
        if (id !== renderId) return
        emit('rendered', { tree: next, outline: extractOutline(next) })
      } catch (cause) {
        if (id !== renderId) return
        error.value = cause instanceof Error ? cause : new Error(String(cause))
      }
    }

    watch(() => [props.source, props.notePath, props.options], run, { immediate: true })

    const handlers: RenderHandlers = {
      linkClick: (resolution, event) => emit('link-click', { resolution, event }),
      linkHover: (payload) => emit('link-hover', payload),
      tagClick: (tag) => emit('tag-click', tag),
      taskToggle: (line, checked) => emit('task-toggle', { line, checked }),
      foldToggle: (payload) => emit('fold-toggle', payload),
    }
    provide(HandlersKey, handlers)
    provide(MarkdownComponentKey, MarkdownRender as Component)

    // Why a list item reads its fold state through injection, and why as a
    // `computed`: see `FoldStateKey`.
    provide(
      FoldStateKey,
      computed(() => ({ lists: props.foldedLists })),
    )

    /**
     * This note's entry in the ancestor chain — the resolver's spelling of it
     * where there is one, the host's otherwise.
     *
     * Exactly one entry, never two: `Embed` counts the chain to enforce the
     * depth cap, so a second entry for the outermost note would cost every
     * document one level of nesting whenever the host's `notePath` resolves to
     * a different spelling. The host's own spelling adds nothing a
     * cycle check can use — `data-embed-path` is resolver output, so the
     * resolved form is the only one an embed can ever match.
     */
    function selfIdentity(isOutermost: boolean): string[] {
      const notePath = props.notePath
      if (!notePath) return []
      if (!isOutermost || !noteSource) return [notePath]
      let resolved: string | undefined
      try {
        resolved = noteSource.resolveLink(notePath, notePath).path
      } catch {
        resolved = undefined
      }
      return [resolved ?? notePath]
    }

    return () => {
      if (error.value) {
        return h('div', { class: 'markdown-render markdown-render-error' }, [
          h('p', `Could not render this note: ${error.value.message}`),
        ])
      }
      const root = tree.value
      if (!root) return h('div', { class: 'markdown-render' }, [])
      const context = { components: components.value }
      // Without `foldable`, headings render flat: unwrapped, no affordance.
      // What folding is scoped to when it IS on — see `renderHeadingSections`.
      const body = foldable.value
        ? renderHeadingSections(root.children as never, context, {
            folded: props.foldedHeadings,
            onToggle: (id, folded) => emit('fold-toggle', { kind: 'heading', id, folded }),
          })
        : renderChildren(root.children as never, context)
      return h('div', { class: 'markdown-render' }, body)
    }
  },
})
