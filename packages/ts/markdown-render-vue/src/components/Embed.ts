/**
 * `![[transclusion]]`.
 *
 * An embed loads its target through `NoteSource` and renders it with a nested
 * `<MarkdownRender>`. Three guards keep that from running away: the ancestor
 * path chain (a note that embeds itself, directly or through a loop, stops), a
 * hard depth cap, and a document-wide budget — depth alone bounds nothing,
 * because N embeds nested D deep is N^D loads and every one of them is inside
 * the cap. All three render a placeholder rather than throwing: a bad embed
 * must not take the document down with it.
 *
 * The nested renderer is injected rather than imported, so the two components
 * do not form a module cycle. It is also the boundary the host's own
 * configuration has to be carried across by hand: options, component
 * overrides, and the way back up for events. See `nestedProps` below.
 */

import {
  computed,
  defineComponent,
  h,
  inject,
  onUnmounted,
  provide,
  ref,
  watch,
  type PropType,
} from 'vue'
import type { Element } from 'hast'
import { toVueProps, type HastNode, type ToVuePropsOptions } from '../render.ts'
import {
  EmbedAncestorsKey,
  EmbedBudgetKey,
  HostComponentsKey,
  HostOptionsKey,
  MarkdownComponentKey,
  TasksLiveKey,
  useHandlers,
  useNoteSource,
  type WikilinkTarget,
} from '../context.ts'
import {
  embedBlocker,
  embedMedia,
  embedNoteProperties,
  embedPlaceholder,
  type EmbedPlaceholder,
  isMediaKind,
  isSafeAssetUrl,
  isSafeLinkPath,
  sliceEmbed,
} from '@osdlc/markdown-render'

type EmbedState = 'idle' | 'loading' | 'ready' | 'missing' | 'cycle' | 'too-deep' | 'over-budget'

export const Embed = defineComponent({
  name: 'Embed',
  props: {
    node: { type: Object as PropType<HastNode>, required: true },
  },
  setup(props) {
    const noteSource = useNoteSource()
    const ancestors = inject(EmbedAncestorsKey, [] as readonly string[])
    const markdownComponent = inject(MarkdownComponentKey, null)
    const hostOptions = inject(HostOptionsKey, null)
    const hostComponents = inject(HostComponentsKey, null)

    // The HOST's handlers: this embed is a descendant of the host instance, so
    // injection reaches past the nested `<MarkdownRender>` that has not been
    // created yet. That nested instance provides its OWN handlers, shadowing
    // these for everything below it, so its emits stop there unless bridged —
    // which is what `nestedProps` does.
    const handlers = useHandlers()
    // `task-toggle` is the one event `nestedProps` does NOT bridge (its line
    // is the embedded note's), so every checkbox below this embed keeps GFM's
    // `disabled` rather than being a control that does nothing.
    provide(TasksLiveKey, false)

    const attrs = computed(() => props.node.properties ?? {})
    const target = computed(() => String(attrs.value.dataEmbedTarget ?? ''))
    const kind = computed(() => String(attrs.value.dataEmbedKind ?? 'note'))
    // `data-embed-path` is the resolver's answer — `plugins/provenance.ts` is
    // what makes that true, by dropping any `<markdown-embed>` a note wrote
    // itself. The scheme check is the backstop for a host that assembles hast
    // some other way (its own pipeline, `sanitize: false`, a hand-built tree):
    // whatever else this path is, it is not a URL scheme we will act on.
    const path = computed(() =>
      typeof attrs.value.dataEmbedPath === 'string' && isSafeLinkPath(attrs.value.dataEmbedPath)
        ? attrs.value.dataEmbedPath
        : undefined,
    )
    const heading = computed(() =>
      typeof attrs.value.dataEmbedHeading === 'string' ? attrs.value.dataEmbedHeading : undefined,
    )
    const blockId = computed(() =>
      typeof attrs.value.dataEmbedBlockId === 'string' ? attrs.value.dataEmbedBlockId : undefined,
    )

    const state = ref<EmbedState>('idle')
    const body = ref('')
    let loadId = 0

    // Held while this transclusion is mounted and released when it goes — the
    // depth cap bounds how *deep* the graph goes, this bounds how *wide*, and
    // `spent` counts what is LIVE rather than what has ever existed. Without the
    // release, a section folded and unfolded enough times spends a document out
    // of budget with nothing on screen to show for it.
    //
    // An unfunded embed keeps watching for a released charge because a
    // structural re-render mounts the incoming subtree BEFORE unmounting the
    // outgoing one: the count overshoots for one patch, and the placeholders
    // that overshoot produced have to be able to take the charges the old
    // subtree hands back. Media costs nothing: no load, no nested render, no
    // recursion.
    //
    // The charge follows `kind`, not the first node: an edit on the same line
    // patches this instance in place, so an image can become a transclusion
    // (which must claim) and a transclusion an image (which must give back).
    const budget = inject(EmbedBudgetKey, null)
    const funded = ref(!budget)
    if (budget) {
      let holding = false
      let stopWaiting: (() => void) | undefined
      const claim = () => {
        if (budget.spent >= budget.limit) return false
        budget.spent++
        holding = true
        funded.value = true
        return true
      }
      const release = () => {
        stopWaiting?.()
        stopWaiting = undefined
        if (holding) budget.spent--
        holding = false
      }
      watch(
        () => isMediaKind(kind.value),
        (media) => {
          if (media) {
            release()
            funded.value = true
            return
          }
          if (holding || stopWaiting) return
          funded.value = false
          if (claim()) return
          stopWaiting = watch(
            () => budget.spent,
            () => {
              if (!claim()) return
              stopWaiting?.()
              stopWaiting = undefined
            },
          )
        },
        { immediate: true },
      )
      onUnmounted(release)
    }

    const load = async () => {
      const id = ++loadId
      const resolved = path.value
      if (isMediaKind(kind.value)) {
        state.value = 'ready'
        return
      }
      // The shared guard order — see `plugins/embed-render.ts`.
      const blocker = embedBlocker(noteSource ? resolved : undefined, ancestors, funded.value)
      if (blocker || !resolved || !noteSource) {
        state.value = blocker ?? 'missing'
        return
      }
      state.value = 'loading'
      let note: Awaited<ReturnType<typeof noteSource.loadNote>> = null
      try {
        note = await noteSource.loadNote(resolved)
      } catch {
        note = null
      }
      if (id !== loadId) return
      if (!note) {
        state.value = 'missing'
        return
      }
      const slice = sliceEmbed(note.body, {
        ...(heading.value !== undefined ? { heading: heading.value } : {}),
        ...(blockId.value !== undefined ? { blockId: blockId.value } : {}),
      })
      if (slice === null) {
        state.value = 'missing'
        return
      }
      body.value = slice
      state.value = 'ready'
    }

    // `funded` joins the sources: an embed that claims a released charge has to
    // drop its over-budget placeholder and actually load. So does the ancestor
    // chain, which `MarkdownRender` rewrites when its `notePath` changes: a
    // chain that moved changes the cycle and depth verdicts for an embed whose
    // own attributes are untouched.
    const chainKey = () => ancestors.join('\u0000')
    watch([target, path, heading, blockId, kind, funded, chainKey], load, { immediate: true })

    /** A shared hast builder's element as a VNode. */
    const vnode = (el: Element, options?: ToVuePropsOptions) => {
      const text = el.children.map((child) => (child.type === 'text' ? child.value : ''))
      return text.length
        ? h(el.tagName, toVueProps(el.properties, options), text.join(''))
        : h(el.tagName, toVueProps(el.properties, options))
    }

    /**
     * The `<markdown-embed>` attributes the rendered element keeps: its source
     * line, and the block id `remarkBlockIds` gave it so `#^id` links land.
     */
    const carried = () => ({
      dataLine: attrs.value.dataLine,
      id: attrs.value.id,
      dataBlockId: attrs.value.dataBlockId,
    })

    const placeholder = (state: EmbedPlaceholder) => {
      const el = embedPlaceholder(state, target.value)
      return vnode({
        ...el,
        properties: { ...el.properties, ...carried() } as Element['properties'],
      })
    }

    const display = computed(() =>
      typeof attrs.value.dataEmbedDisplay === 'string' ? attrs.value.dataEmbedDisplay : undefined,
    )

    /**
     * The URL for a media embed, or `undefined` when there is nothing safe to
     * point at. The last ancestor is the note this embed sits in (the parent
     * `<MarkdownRender>` appends its own `notePath` to the chain), and it is
     * the `fromPath` the source needs to scope the asset lookup — a host
     * indexing more than one vault resolves the target inside the embedding
     * note's own vault. Both halves are then checked, not just the fallback:
     * `assetUrl` is host code answering a note-chosen target, and a media
     * `src` is a network request the reader never asked for. `http`/`https`/
     * `blob` (what a host hands back for a fetched attachment) or a
     * same-origin path.
     */
    const mediaSrc = (): string | undefined => {
      // A host that is PRESENT and answers `null` has answered: it cannot serve
      // this attachment. Do not fall back to `path.value` there: that is
      // `data-embed-path`, a ROUTE URL like `/apps/notes/<vault>/cat.png`, and
      // `isSafeAssetUrl` admits a same-origin path, so a missing attachment
      // would paint an `<img>` at an app page — a permanently broken image
      // instead of a missing-attachment placeholder.
      //
      // The fallback survives only for hosts with no `NoteSource` at all, such
      // as the string renderer, where `data-embed-path` is the only URL in
      // play. The Astro build renders embeds itself and never reaches here.
      const src = noteSource
        ? noteSource.assetUrl(target.value, ancestors[ancestors.length - 1])
        : path.value
      return src && isSafeAssetUrl(src) ? src : undefined
    }

    /**
     * The host's pipeline options, minus `notePath`.
     *
     * Forwarding them is what makes a transclusion render like the note around
     * it: the host's sanitize schema, `math`, `highlight`, and a host-supplied
     * `options.resolveLink` override, which the injected `NoteSource` does not
     * carry.
     *
     * `notePath` is dropped because the embedded note has its own, passed as
     * the `notePath` prop below. A host-set one merges over that prop and would
     * make every transcluded note resolve its links and its own embeds from the
     * HOST's path — wrong targets, and resolutions the embed cycle guard then
     * compares against.
     */
    const nestedOptions = computed(() => {
      const options = hostOptions?.value
      if (!options) return undefined
      const { notePath: _hostPath, ...rest } = options
      return rest
    })

    /**
     * The bridge back to the host for the events whose payload means the same
     * thing on both sides of the boundary. Built once, so the nested component
     * is not re-patched with fresh listener identities on every render.
     *
     * NOT `task-toggle`: its `line` is a line of the EMBEDDED note, and of this
     * embed's slice of it, while a host treats the event as a line of the note
     * it is displaying and writes back to that file. Forwarding it would
     * rewrite the wrong file at the wrong line, so it stays contained.
     *
     * NOT `rendered` either — its outline describes the embedded document, not
     * the host's. `fold-toggle` cannot reach here at all: folding is
     * outermost-only.
     */
    const bridge = {
      onLinkClick: (payload: { resolution: WikilinkTarget; event: MouseEvent }) =>
        handlers.linkClick(payload.resolution, payload.event),
      onLinkHover: (payload: { resolution: WikilinkTarget; el: HTMLElement } | null) =>
        handlers.linkHover(payload),
      onTagClick: (tag: string) => handlers.tagClick(tag),
    }

    /** Props for the nested renderer: the host's setup, carried across. */
    const nestedProps = () => ({
      source: body.value,
      notePath: path.value,
      options: nestedOptions.value,
      components: hostComponents?.value,
      ...bridge,
    })

    return () => {
      if (isMediaKind(kind.value)) {
        const src = mediaSrc()
        if (!src) return placeholder('missing-attachment')
        return vnode(
          embedMedia(kind.value, src, target.value, display.value, {
            extra: carried(),
            fragment: heading.value,
          }),
          // A PDF embed's href is `src`, which passed `isSafeAssetUrl` in `mediaSrc`.
          { assetHref: true },
        )
      }

      switch (state.value) {
        case 'cycle':
        case 'too-deep':
        case 'over-budget':
        case 'missing':
          return placeholder(state.value)
        case 'idle':
        case 'loading':
          return placeholder('loading')
        default:
          break
      }

      if (!markdownComponent) return placeholder('inert')
      return h('div', toVueProps(embedNoteProperties(target.value, carried())), [
        h(markdownComponent, nestedProps()),
      ])
    }
  },
})
