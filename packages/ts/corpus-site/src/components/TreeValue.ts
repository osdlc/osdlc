/**
 * A value that is not one scalar: an object as labelled pairs, a list, text, a link, code or a
 * badge. `compact` is for a table cell: the first pairs, cut short, with the whole value behind
 * a `details` that opens without script.
 */
import { defineComponent, h, type PropType, type VNodeChild } from 'vue'
import type { DataTree, DataTreeObject, DataTreeText } from '../data-types.ts'
import { treeText } from '../value-text.ts'

/** The most pairs of an object, and items of a list, a compact value shows. */
export const MAX_PAIRS = 3
/** The longest text a compact value shows before it is cut. */
export const CLIP = 110

type Leaf = string | DataTreeText

const isLeaf = (tree: DataTree): tree is Leaf =>
  typeof tree === 'string' ||
  (tree !== null && !Array.isArray(tree) && !('entries' in tree) && !('group' in tree))

/** A link. One that leaves the site opens in a new tab and carries a mark. */
export function link(url: string, external: boolean, text: string): VNodeChild {
  return external
    ? h(
        'a',
        { href: url, class: 'cs-external', target: '_blank', rel: 'noopener', title: url },
        text,
      )
    : h('a', { href: url }, text)
}

/** A group: its values side by side on one line. */
function group(items: DataTree[], value: (tree: DataTree) => VNodeChild): VNodeChild {
  return h(
    'span',
    { class: 'cs-group' },
    items.map((item) => h('span', { class: 'cs-group-item' }, [value(item)])),
  )
}

const clipped = (text: string, clip: number): string =>
  text.length > clip ? `${text.slice(0, clip - 1).trimEnd()}…` : text

function leaf(node: Leaf, clip = Infinity): VNodeChild {
  if (typeof node === 'string') return clipped(node, clip)
  const text = clipped(node.text, clip)
  if (node.url !== undefined) return link(node.url, node.external === true, text)
  if (node.color !== undefined)
    return h('span', { class: 'cs-badge', 'data-color': node.color }, text)
  return node.code === true ? h('code', text) : text
}

const leafLength = (node: Leaf): number => (typeof node === 'string' ? node : node.text).length

function pairs(object: DataTreeObject, value: (tree: DataTree) => VNodeChild, limit = Infinity) {
  return h(
    'dl',
    { class: 'cs-pairs' },
    object.entries
      .slice(0, limit)
      .flatMap((entry) => [
        h('dt', { title: entry.help }, entry.label),
        h('dd', [value(entry.value)]),
      ]),
  )
}

/** The whole value. */
function full(tree: DataTree): VNodeChild {
  if (tree === null) return h('span', { class: 'cs-empty', 'aria-label': 'none' }, '–')
  if (isLeaf(tree)) return leaf(tree)
  if (Array.isArray(tree)) {
    const inline = tree.every((item) => isLeaf(item) && leafLength(item) <= 40)
    return h(
      'ul',
      { class: 'cs-list', 'data-inline': inline ? '' : undefined },
      tree.map((item) => h('li', [full(item)])),
    )
  }
  if ('group' in tree) return group(tree.group, full)
  return pairs(tree, full)
}

/** The start of a value, and whether anything was left out. */
function preview(tree: DataTree): { node: VNodeChild; cut: boolean } {
  if (tree === null) return { node: full(tree), cut: false }
  if (isLeaf(tree)) return { node: leaf(tree, CLIP), cut: leafLength(tree) > CLIP }
  if ('group' in tree) {
    const parts = tree.group.map(preview)
    return {
      node: h(
        'span',
        { class: 'cs-group' },
        parts.map((part) => h('span', { class: 'cs-group-item' }, [part.node])),
      ),
      cut: parts.some((part) => part.cut),
    }
  }
  if (Array.isArray(tree)) {
    if (tree.every((item) => item !== null && !isLeaf(item) && 'group' in item)) {
      const shown = tree.slice(0, MAX_PAIRS).map(preview)
      const more = tree.length - shown.length
      return {
        node: h('ul', { class: 'cs-list' }, [
          ...shown.map((part) => h('li', [part.node])),
          more > 0 ? h('li', { class: 'cs-more' }, `+${more}`) : null,
        ]),
        cut: more > 0 || shown.some((part) => part.cut),
      }
    }
    if (tree.every(isLeaf)) {
      const shown = tree.slice(0, MAX_PAIRS)
      const more = tree.length - shown.length
      return {
        node: h('span', { class: 'cs-value-list' }, [
          ...shown.map((item) => h('span', { class: 'cs-value-item' }, [leaf(item, CLIP)])),
          more > 0 ? h('span', { class: 'cs-more' }, `+${more}`) : null,
        ]),
        cut: more > 0 || shown.some((item) => leafLength(item) > CLIP),
      }
    }
    const first = preview(tree[0] ?? null)
    return {
      node: [
        first.node,
        tree.length > 1 ? h('span', { class: 'cs-more' }, `+${tree.length - 1}`) : null,
      ],
      cut: first.cut || tree.length > 1,
    }
  }
  let cut = tree.entries.length > MAX_PAIRS
  const node = pairs(
    tree,
    (value) => {
      if (value !== null && isLeaf(value)) {
        if (leafLength(value) > CLIP) cut = true
        return leaf(value, CLIP)
      }
      const text = treeText(value, false)
      if (text.length > CLIP || !Array.isArray(value)) cut = true
      return clipped(text, CLIP)
    },
    MAX_PAIRS,
  )
  return { node, cut }
}

export const TreeValue = defineComponent({
  name: 'CorpusTreeValue',
  props: {
    tree: {
      type: [String, Object, Array] as PropType<DataTree>,
      default: null,
    },
    /** Show the start, with the whole value behind a control that opens it. */
    compact: { type: Boolean, default: false },
  },
  setup(props) {
    return () => {
      if (!props.compact) return h('div', { class: 'cs-tree' }, [full(props.tree)])
      const { node, cut } = preview(props.tree)
      if (!cut) return h('div', { class: 'cs-tree cs-tree-compact' }, [node])
      return h('details', { class: 'cs-tree cs-tree-compact cs-tree-more' }, [
        h('summary', [
          h('span', { class: 'cs-tree-preview' }, [node]),
          h('span', { class: 'cs-tree-toggle' }),
        ]),
        h('div', { class: 'cs-tree-full' }, [full(props.tree)]),
      ])
    }
  },
})
