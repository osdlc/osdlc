/**
 * A list item, with a fold toggle when — and only when — it actually has a
 * nested list (R-02). A plain `<li>` with no sub-list produces exactly the
 * markup `renderNode` would have produced directly: no wrapper, no extra
 * class. The RUNTIME cost is not nothing, though — routing `li` at all makes
 * every list item in the document a Vue component instance (setup, props
 * proxy, effect scope, render effect) instead of a plain element VNode. That
 * is why the route is opt-in: `defaultComponents(foldable)` only adds it when
 * the host asked for folding, so a document that never folds pays none of it.
 *
 * Foldability is a structural question (does this item have a nested `ul`/
 * `ol`, and a source line to key the fold on?) answered from the hast node
 * directly and unconditionally on the fold set — the fold set only decides
 * whether a foldable item currently reads open or closed. Controlled, like
 * `HeadingSectionFold`: `open` comes from the current fold set (read through
 * `FoldStateKey`, since a list item can be routed at any nesting depth with
 * no direct line to the owning `MarkdownRender`), never from local state
 * seeded once.
 *
 * A closed item still BUILDS its nested subtree's VNodes: the children arrive
 * as one already-rendered slot array, and dropping the nested lists from the
 * returned array is the only lever this component has. Nothing is mounted or
 * patched, but the VNode objects are made — unlike a closed
 * `HeadingSectionFold`, which never calls its slot at all and so genuinely
 * skips its whole body. Skipping the work here would mean rendering the
 * item's children from hast instead of from the slot, which needs the
 * `RenderContext` this component is not given.
 *
 * Children keep their DOCUMENT ORDER, all of them: an item is
 * `listItem[paragraph, list, paragraph]` as readily as `[paragraph, list]`,
 * and it may carry more than one sub-list. The toggle is spliced in ahead of
 * the FIRST nested list, and closing drops every nested list where it stands
 * — one item, one source line, one toggle, so all of an item's sub-lists fold
 * together.
 *
 * List items key on SOURCE LINE, not an id — a plain list item has none.
 * `data-line` already sits on the node itself (`remarkDataLine` stamps every
 * markdown `listItem`; a raw-HTML `<li>` has none and gets no toggle), so it
 * needs no threading down `renderNode` the way `TaskCheckbox`'s `line` prop
 * does for an inline checkbox.
 */

import { defineComponent, h, inject, isVNode, type PropType, type VNodeArrayChildren } from 'vue'
import { numericLine, toVueProps, type HastNode } from '../render.ts'
import { useHandlers, FoldStateKey } from '../context.ts'

const LIST_TAGS = new Set(['ul', 'ol'])

/** Whether this list item has a nested list as one of its direct children. */
function hasNestedList(node: HastNode): boolean {
  return (node.children ?? []).some(
    (child) =>
      child.type === 'element' && child.tagName !== undefined && LIST_TAGS.has(child.tagName),
  )
}

/** A rendered slot child that is itself a `<ul>`/`<ol>` VNode. */
function isNestedListVNode(child: VNodeArrayChildren[number]): boolean {
  return isVNode(child) && typeof child.type === 'string' && LIST_TAGS.has(child.type)
}

export const ListItemFold = defineComponent({
  name: 'ListItemFold',
  props: {
    node: { type: Object as PropType<HastNode>, required: true },
  },
  setup(props, { slots }) {
    const handlers = useHandlers()
    const fold = inject(FoldStateKey, null)

    return () => {
      const children = slots.default?.() ?? []
      const attrs = toVueProps(props.node.properties)
      // An item with no source line (a raw-HTML `<li>`: `remarkDataLine`
      // stamps mdast blocks only) has no fold key, so a toggle there could
      // never report — no affordance rather than a dead one, the same rule
      // `heading-sections.ts` applies to a heading with no id.
      const line = numericLine(props.node)
      if (!hasNestedList(props.node) || line === undefined) {
        return h('li', attrs, children)
      }

      const open = !(fold?.value.lists.has(line) ?? false)
      const classes = [attrs.class, 'markdown-list-foldable', open ? 'is-open' : 'is-collapsed']
        .filter(Boolean)
        .join(' ')

      // After the item's own leading content, before the sub-list it opens.
      // `-1` only when a host has routed `ul`/`ol` to a component of its own,
      // and then the toggle trails the item rather than moving anything.
      const first = children.findIndex(isNestedListVNode)
      const head = first === -1 ? children : children.slice(0, first)
      const tail = first === -1 ? [] : children.slice(first)

      return h('li', { ...attrs, class: classes }, [
        ...head,
        h('button', {
          type: 'button',
          class: 'markdown-list-fold-toggle',
          'aria-expanded': String(open),
          'aria-label': open ? 'Collapse list' : 'Expand list',
          onClick: () => handlers.foldToggle({ kind: 'list', line, folded: open }),
        }),
        ...(open ? tail : tail.filter((child) => !isNestedListVNode(child))),
      ])
    }
  },
})
