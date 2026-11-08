/**
 * A callout. The `-`/`+` fold marker makes it interactive: `-` starts
 * collapsed, `+` starts expanded, no marker means not foldable at all.
 *
 * The open state is local to the instance and re-seeded from the marker
 * whenever the callout's own source changes (its type, marker, line, span
 * or text, title and body alike), so an edit always wins over a reader's
 * toggle — the source is what says how the callout starts. A re-run that
 * leaves the callout as it was (a host redraw on a new `options` object,
 * which builds a fresh hast tree from the same source) keeps the toggle.
 * The text is source text: a link's label is its alias or target as written,
 * never something the resolver supplies, so a resolution change that only
 * re-points or re-kinds a link keeps the toggle too.
 */

import { computed, defineComponent, h, ref, watch, type PropType } from 'vue'
import { classList, nodeText, toVueProps, type HastNode } from '../render.ts'

export const Callout = defineComponent({
  name: 'Callout',
  props: {
    node: { type: Object as PropType<HastNode>, required: true },
  },
  setup(props, { slots }) {
    const fold = computed(() => props.node.properties?.dataFold as string | undefined)
    const foldable = computed(() => fold.value === '-' || fold.value === '+')
    const open = ref(fold.value !== '-')
    // `renderNode` keys routed components by source identity (falling back to
    // tag and position), so an edit that keeps a callout's key patches this
    // instance instead of remounting it, even when the node's content changed.
    // Re-seed on what identifies the callout's source, not on the marker alone:
    // `[!note]-` swapped for `[!warning]-` shares a marker and still has to
    // start from its own fold state. Not on node identity either: every
    // pipeline run builds a new tree, including one with the source unchanged.
    const sourceKey = computed(() => {
      const p = props.node.properties
      const position = props.node.position
      return JSON.stringify([
        p?.dataCallout,
        p?.dataFold,
        p?.dataLine,
        position?.start.offset,
        position?.end.offset,
        nodeText(props.node),
      ])
    })
    watch(sourceKey, () => {
      open.value = fold.value !== '-'
    })

    return () => {
      const children = slots.default?.() ?? []
      // The title is the first child div; the content follows it.
      const [title, ...rest] = children
      const props_ = toVueProps(props.node.properties)
      const classes = [...classList(props.node)]
      if (foldable.value) classes.push('is-foldable', open.value ? 'is-open' : 'is-collapsed')
      props_.class = classes.join(' ')

      return h('div', props_, [
        foldable.value
          ? h(
              'button',
              {
                type: 'button',
                class: 'callout-fold-toggle',
                'aria-expanded': String(open.value),
                onClick: () => {
                  open.value = !open.value
                },
              },
              [title],
            )
          : title,
        ...(open.value ? rest : []),
      ])
    }
  },
})
