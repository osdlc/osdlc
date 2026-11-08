/**
 * A rendered table, with the three affordances a reader wants on one: a
 * click-to-sort header, a header that pins while the body scrolls, and a copy
 * button that puts the table on the clipboard as CSV.
 *
 * All three are LENSES. None of them writes: no op is called, no event is
 * emitted, `props.node` is never mutated, and no alternate markdown is ever
 * built. The notes write model replaces a body verbatim, so a feature that
 * quietly reordered rows on disk would be a defect rather than a surprise —
 * which is why sorting permutes already-rendered VNodes and touches no hast at
 * all. Permuting the rendered nodes also keeps a host's own component overrides
 * inside cells: a `[[wikilink]]` or a claimed fence in a cell was rendered by
 * the real context, and re-rendering it from hast here would lose that.
 *
 * Sort state is per-table and ephemeral — not persisted, not a setting, and
 * reset whenever the table's source changes. Not on node identity: every
 * pipeline run builds a fresh hast tree, including a host redraw on a new
 * `options` object with the source unchanged, and that must not throw the
 * reader's sort away.
 *
 * The chrome lives only in the Vue target, never in hast; see `CodeBlock.ts`
 * for why that is a security boundary. A host that wants none of it passes
 * `{ table: undefined }` as `components`.
 */

import {
  defineComponent,
  h,
  isVNode,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
  type VNode,
  type VNodeArrayChildren,
} from 'vue'
import { toCsv } from '@osdlc/gfm-table'
import { nodeText, toVueProps, type HastNode } from '../render.ts'
import { copyButton, copyStatus, useCopyAction } from '../copy-action.ts'
import {
  cellText,
  columnKeys,
  hasSpannedCells,
  rowCells,
  sortRowOrder,
  tableRows,
  tableSections,
  type SortDirection,
} from '../table-data.ts'

interface SortState {
  column: number
  direction: SortDirection
}

const ARIA_SORT: Record<SortDirection, string> = {
  asc: 'ascending',
  desc: 'descending',
}

const ARROW: Record<SortDirection, string> = { asc: '▲', desc: '▼' }

const THEAD = ['thead']
const TBODY = ['tbody']
const ROW = ['tr']
const CELL = ['th', 'td']

/** A vnode for a real element — one whose `type` is a tag name. */
type ElementVNode = VNode & { type: string }

/** An element vnode's children, when it has a list of them. */
function vnodeChildren(vnode: VNode): VNodeArrayChildren {
  return Array.isArray(vnode.children) ? vnode.children : []
}

/**
 * Whether a slot child is one of the elements named.
 *
 * Slot children are not all elements, and this is the whole reason every walk
 * below filters rather than indexes. A GFM table arrives with no whitespace
 * between its tags, but `rehype-raw` keeps the whitespace in a note's
 * hand-written HTML — so a pretty-printed `<tbody>` renders as
 * text, tr, text, tr, text, and a positional index into that list is off by
 * however many text nodes precede it. `rowCells` and `tableRows` filter the
 * hast the same way, which is what keeps one column index meaning one thing on
 * both sides.
 */
function isElement(child: unknown, tags: readonly string[]): child is ElementVNode {
  return isVNode(child) && typeof child.type === 'string' && tags.includes(child.type)
}

/** The element children of a vnode, in order, ignoring everything else. */
function elements(vnode: VNode, tags: readonly string[]): ElementVNode[] {
  return vnodeChildren(vnode).filter((child): child is ElementVNode => isElement(child, tags))
}

/**
 * Rebuild a child list, handing each matching element to `replace` along with
 * its index AMONG THE MATCHES. Everything else is passed through where it
 * stood: whitespace between rows contributes no box to a table, and dropping it
 * would be a silent edit to markup the note actually wrote.
 */
function mapElements(
  children: VNodeArrayChildren,
  tags: readonly string[],
  replace: (element: ElementVNode, index: number) => VNodeArrayChildren[number],
): VNodeArrayChildren {
  let index = 0
  return children.map((child) => (isElement(child, tags) ? replace(child, index++) : child))
}

/**
 * The same element vnode with different children.
 *
 * `cloneVNode` takes extra props but no children, so re-issuing the `h()` call
 * with the vnode's own type and props is what a "clone with these children"
 * actually is. The children are the ones the slot just rendered, reused — never
 * rebuilt.
 */
function withChildren(vnode: ElementVNode, children: VNodeArrayChildren): VNode {
  return h(vnode.type, vnode.props, children)
}

/**
 * Whether a slot child can carry an accessible name.
 *
 * Cheap and conservative: any element counts, and a string counts when it is
 * not pure whitespace. It decides one thing — whether a header cell needs a
 * hidden name of its own — and getting it wrong costs a redundant name, not a
 * missing one.
 */
function carriesText(child: VNodeArrayChildren[number]): boolean {
  if (typeof child === 'string') return child.trim() !== ''
  if (typeof child === 'number') return true
  return isVNode(child)
}

/** What a table's source says, for telling an edit from a redraw of it. */
function tableSignature(node: HastNode): string {
  const position = node.position
  return JSON.stringify([
    node.properties?.dataLine,
    position?.start.offset,
    position?.end.offset,
    nodeText(node),
  ])
}

export const TableBlock = defineComponent({
  name: 'TableBlock',
  props: {
    node: { type: Object as PropType<HastNode>, required: true },
  },
  setup(props, { slots }) {
    const sort = ref<SortState | null>(null)
    /** Whether the table is tall enough to scroll — see the sticky rules. */
    const scrolls = ref(false)
    const table = ref<HTMLElement | null>(null)
    /** Column → its body text, extracted on the first click that needs it. */
    let keys = new Map<number, string[]>()
    /** Whether the table resists sorting, computed once per node — see {@link sortable}. */
    let unsortable: boolean | undefined

    // The cached keys and span check are per node, so they go with every new
    // tree. The sort goes only when the table's own source changed: its line,
    // the span it covers, or its text. Read only while a sort is active, so a
    // table nobody sorted never has its cells walked here.
    watch(
      () => props.node,
      (node, previous) => {
        keys = new Map()
        unsortable = undefined
        if (sort.value && tableSignature(node) !== tableSignature(previous)) sort.value = null
      },
    )

    // Read on click, never at render: a note of forty tables would otherwise
    // walk every cell of every one of them to build keys nobody asked for.
    function columnFor(column: number): string[] {
      let cached = keys.get(column)
      if (!cached) {
        cached = columnKeys(props.node, column)
        keys.set(column, cached)
      }
      return cached
    }

    /**
     * Whether this table can be sorted at all.
     *
     * A `colspan` or `rowspan` breaks the one assumption every sort rests on —
     * that the n-th header names the n-th value of every body row. It does not,
     * and there is no honest repair, so a table carrying one gets no sort
     * controls. Refusing to sort beats sorting one column under another
     * column's name. A table with more than one `<tbody>` is refused too: the
     * sort keys come from the first body only, and one order cannot rank rows
     * across separate groups. Memoised per node: it reads a property per cell
     * and never any text, but it should still happen once rather than once per
     * render.
     */
    function sortable(): boolean {
      if (unsortable === undefined) {
        unsortable = tableSections(props.node, 'tbody').length > 1 || hasSpannedCells(props.node)
      }
      return !unsortable
    }

    /** Row indices in display order, or `undefined` while the source order stands. */
    function displayOrder(): number[] | undefined {
      const state = sort.value
      // A sort kept across a same-length edit that introduced a span no
      // longer applies: the table is not sortable now.
      if (!state || !sortable()) return undefined
      return sortRowOrder(columnFor(state.column), state.direction)
    }

    /** Ascending, then descending, then back to the order the document wrote. */
    function cycle(column: number): void {
      const state = sort.value
      if (!state || state.column !== column) sort.value = { column, direction: 'asc' }
      else sort.value = state.direction === 'asc' ? { column, direction: 'desc' } : null
    }

    /**
     * The table as the reader currently sees it: every `<thead>`, `<tbody>`
     * and `<tfoot>` in the order a table draws them (see `tableSections`), the
     * body's rows in display order. Only a one-body table sorts.
     * A header is omitted rather than invented when the table has none — raw
     * HTML reaches the sanitizer as `<table><tbody>`, with no `<thead>` at all.
     */
    function csvRows(): string[][] {
      const rows: string[][] = []
      const order = displayOrder()
      for (const section of tableSections(props.node)) {
        const source = tableRows(section)
        const indices =
          section.tagName === 'tbody' && order ? order : source.map((_, index) => index)
        for (const index of indices) rows.push(rowCells(source[index]!).map(cellText))
      }
      return rows
    }

    const { copied, copy } = useCopyAction(() => toCsv(csvRows()))

    // A pinned header needs an opaque fill, and an opaque fill on a table that
    // never scrolls is a band of colour nobody asked for — so the sticky rules
    // wait until the table has actually overflowed its cap. Measured rather
    // than assumed: the cap is a viewport fraction, so the same table crosses
    // it on one screen and not another.
    let observer: ResizeObserver | undefined
    onMounted(() => {
      const el = table.value
      if (!el || typeof ResizeObserver === 'undefined') return
      observer = new ResizeObserver(() => {
        scrolls.value = el.scrollHeight > el.clientHeight
      })
      observer.observe(el)
    })
    onBeforeUnmount(() => observer?.disconnect())

    /** Wrap each `<th>`'s rendered content in the control that sorts by it. */
    function withSortControls(thead: ElementVNode): VNode {
      const first = elements(thead, ROW)[0]
      if (!first) return thead

      let anyHeader = false
      const cells = mapElements(vnodeChildren(first), CELL, (cell, column) => {
        // `aria-sort` belongs on a column header and nowhere else, so a header
        // row of `<td>` — which raw HTML can produce — is left as it is. The
        // column index still advances past it, because `rowCells` counts it.
        if (cell.type !== 'th') return cell
        anyHeader = true
        const direction = sort.value?.column === column ? sort.value.direction : undefined
        const content: VNodeArrayChildren = [...vnodeChildren(cell)]
        // The button takes its name from the header text it wraps, and carries
        // no `aria-label`. Name-from-content prefers a descendant's
        // `aria-label` over the text beside it, so labelling the button would
        // rename the `<th>` — and a column header's name is announced with
        // every data cell in that column. `aria-sort` on the `<th>` is what
        // says the column is sortable and which way it currently runs; that is
        // the ARIA sortable-table pattern, and it needs no second voice.
        if (!content.some(carriesText)) {
          content.push(h('span', { class: 'markdown-table-sort-name' }, `Column ${column + 1}`))
        }
        // The indicator appears only once the column is sorted. At rest the
        // header occupies exactly the space it did before this component
        // existed, which is what keeps an untouched table's geometry.
        if (direction) {
          content.push(
            h('span', { class: 'markdown-table-arrow', 'aria-hidden': 'true' }, ARROW[direction]),
          )
        }
        return h('th', { ...cell.props, 'aria-sort': direction ? ARIA_SORT[direction] : 'none' }, [
          h(
            'button',
            {
              type: 'button',
              class: 'markdown-table-sort',
              onClick: (event: MouseEvent) => {
                // A link or tag in the header handles its own click (or leaves
                // a modified one to the browser); it must not sort as well.
                const target = event.target as Element | null
                const control = target?.closest?.('a, button, input, select, textarea')
                if (control && control !== event.currentTarget) return
                cycle(column)
              },
            },
            content,
          ),
        ])
      })

      if (!anyHeader) return thead
      const rows = mapElements(vnodeChildren(thead), ROW, (row, index) =>
        index === 0 ? withChildren(row, cells) : row,
      )
      return withChildren(thead, rows)
    }

    return () => {
      const children = slots.default?.() ?? []
      const order = sortable() ? displayOrder() : undefined

      const rendered = children.map((child) => {
        if (isElement(child, THEAD) && sortable()) return withSortControls(child)
        if (isElement(child, TBODY) && order) {
          // `order` indexes the hast `<tr>`s and `rows` holds their VNodes, one
          // for one: the walker renders every element child, and `tableRows`
          // counts exactly the same `<tr>` elements out of the same hast.
          const rows = elements(child, ROW)
          return withChildren(
            child,
            mapElements(vnodeChildren(child), ROW, (_, index) => rows[order[index]!]!),
          )
        }
        return child
      })

      return h(
        'div',
        { class: ['markdown-table-block', scrolls.value ? 'markdown-table-scrolls' : ''] },
        [
          h('div', { class: 'markdown-table-chrome' }, [
            copyButton({
              class: 'markdown-table-action',
              copiedClass: 'markdown-table-copied',
              label: 'Copy table as CSV',
              copied: copied.value,
              onClick: copy,
            }),
          ]),
          h('table', { ...toVueProps(props.node.properties), ref: table }, rendered),
          copyStatus('markdown-table-status', copied.value),
        ],
      )
    }
  },
})
