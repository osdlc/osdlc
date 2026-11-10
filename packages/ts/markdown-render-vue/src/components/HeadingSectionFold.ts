/**
 * A heading section (R-02): the heading itself, a fold toggle beside it, and
 * everything until the next same-or-shallower heading, shown or hidden.
 *
 * Controlled, unlike `Callout`'s uncontrolled per-render default: the
 * open/closed state is a PROP, not a local `ref` seeded once. A note that
 * reopens already folded has to render folded on the first frame — a local
 * default would flash open before the host's persisted state ever reaches it.
 * Clicking only reports the click, through `onToggle`; the host decides the
 * next state and hands it back down as a prop, same shape as a controlled
 * `<input>`.
 *
 * `onToggle` is optional, and without it the section renders with no toggle
 * at all: a heading with nothing to key a fold on has no affordance rather
 * than a dead one — see `renderSections` in `heading-sections.ts`.
 *
 * The heading VNode is a plain prop, rendered exactly as `renderNode` built
 * it — this wrapper adds a sibling (the toggle) beside it and never touches
 * its own attributes or children, because `document.getElementById(headingId)`
 * depends on that element existing untouched.
 *
 * The body is a SLOT, not a prop, and that is what makes a closed ancestor
 * cheap: `renderSections` (`heading-sections.ts`) passes the recursive
 * re-grouping of a section's body as a slot FUNCTION, and slot functions are
 * lazy — closed, this component never calls `slots.default()`, so the nested
 * grouping pass and every VNode under it simply never run.
 */

import { defineComponent, h, type PropType, type VNode } from 'vue'

export const HeadingSectionFold = defineComponent({
  name: 'HeadingSectionFold',
  props: {
    heading: { type: Object as PropType<VNode>, required: true },
    open: { type: Boolean, required: true },
    /** Absent for a heading that cannot be folded — then no toggle renders. */
    onToggle: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props, { slots }) {
    return () => {
      const toggle = props.onToggle
      return h(
        'div',
        { class: ['markdown-heading-section', props.open ? 'is-open' : 'is-collapsed'] },
        [
          h('div', { class: 'markdown-heading-section-head' }, [
            props.heading,
            ...(toggle
              ? [
                  h('button', {
                    type: 'button',
                    class: 'markdown-heading-fold-toggle',
                    'aria-expanded': String(props.open),
                    'aria-label': props.open ? 'Collapse section' : 'Expand section',
                    onClick: () => toggle(),
                  }),
                ]
              : []),
          ]),
          ...(props.open ? (slots.default?.() ?? []) : []),
        ],
      )
    }
  },
})
