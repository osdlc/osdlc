/**
 * `%%comments%%` are stripped.
 *
 * `%%` is a document-level delimiter, not a paragraph-level one. A comment
 * opened in one block runs to the next `%%` wherever that falls, and an
 * unclosed `%%` comments out the rest of the note — that is Obsidian's
 * behaviour, and the only safe reading of it: private content that leaks
 * because the author forgot a closing marker is the failure this pass exists
 * to prevent. Scanning one phrasing parent at a time would miss both forms.
 *
 * So the scan runs over every `text` node in document order, and a matched span
 * removes everything between its two markers: the head of the opening node, the
 * tail of the closing one, and every node of any kind in between — whole
 * paragraphs, list items, images, code blocks.
 *
 * The pass runs before the other dialect plugins so private content is never
 * tokenized: a `[[link]]` inside a comment must not reach the host's
 * `resolveLink`, and an `![[embed]]` inside one must not become a node that
 * loads a note.
 *
 * Fenced and inline code never become `text` nodes, so `%%` inside them is
 * literal and is left alone. An escaped marker is masked at parse time (see
 * `plugins/escapes.ts`), so `\%\%` opens nothing — note that `\%%` escapes
 * only the first `%`, leaving the second one and whatever follows it as
 * ordinary source.
 */

import { visit } from 'unist-util-visit'
import type { MdNode, MdParent } from './util.ts'

const DELIMITER = '%%'

/** Node types that are meaningless once their children are gone. */
const PRUNE_WHEN_EMPTY = new Set(['paragraph', 'emphasis', 'strong', 'delete', 'mark'])

/** A point in the flattened text: which node, and an offset into its value. */
interface Mark {
  node: MdNode
  offset: number
}

/** A comment span. `to === null` means "to the end of the document". */
interface Span {
  from: Mark
  to: Mark | null
}

/**
 * Blank text: ASCII whitespace only. Not `trim()`, which also strips U+00A0 —
 * an `&nbsp;` spacer is content the author typed, not blank.
 */
const BLANK = /^[ \t\r\n]*$/

/**
 * Blank, or holding nothing but blank text and other emptied-out inline
 * wrappers — checked recursively so `%%…%%` inside emphasis prunes the
 * paragraph too. Blank text is {@link BLANK}.
 */
function isEmptyish(node: MdNode): boolean {
  const children = node.children ?? []
  return children.every((child) => {
    if (child.type === 'text') return BLANK.test(String(child.value ?? ''))
    if (PRUNE_WHEN_EMPTY.has(child.type)) return isEmptyish(child)
    return false
  })
}

/** Every `text` node in document order. */
function textNodes(tree: MdNode): MdNode[] {
  const found: MdNode[] = []
  visit(tree as never, 'text', (node: MdNode) => {
    found.push(node)
  })
  return found
}

/** Pair the `%%` markers up across the whole document. */
function findSpans(tree: MdNode): Span[] {
  const spans: Span[] = []
  let open: Mark | null = null

  for (const node of textNodes(tree)) {
    const value = String(node.value ?? '')
    let at = 0
    while (at < value.length) {
      const found = value.indexOf(DELIMITER, at)
      if (found < 0) break
      if (open) {
        spans.push({ from: open, to: { node, offset: found + DELIMITER.length } })
        open = null
      } else {
        open = { node, offset: found }
      }
      at = found + DELIMITER.length
    }
  }

  if (open) spans.push({ from: open, to: null })
  return spans
}

/** The chain of nodes from the root down to `target`, or `null` if absent. */
function pathTo(node: MdNode, target: MdNode): MdNode[] | null {
  if (node === target) return [node]
  for (const child of node.children ?? []) {
    const below = pathTo(child, target)
    if (below) return [node, ...below]
  }
  return null
}

/**
 * Delete every node lying strictly between `from` and `to` in document order.
 * `to === null` deletes everything after `from`. The two endpoints themselves
 * are kept — the caller has already trimmed their text.
 */
function removeBetween(root: MdNode, from: MdNode, to: MdNode | null): void {
  const fromPath = new Set<MdNode>(pathTo(root, from) ?? [])
  const toPath = new Set<MdNode>(to ? (pathTo(root, to) ?? []) : [])
  const spine = new Set<MdNode>([...fromPath, ...toPath])

  let state: 'before' | 'inside' | 'after' = 'before'

  const walk = (parent: MdParent) => {
    const kept: MdNode[] = []
    for (const child of parent.children) {
      if (child === from) {
        state = 'inside'
        kept.push(child)
      } else if (to && child === to) {
        state = 'after'
        kept.push(child)
      } else if (spine.has(child)) {
        // An ancestor of an endpoint: keep the branch, and let the recursion
        // find the endpoint inside it and flip the state there.
        if (Array.isArray(child.children)) walk(child as MdParent)
        // A link that only one marker is inside cannot stay: its destination
        // would publish what the comment hides. Its surviving text stays.
        const half = fromPath.has(child) !== toPath.has(child) || (!to && fromPath.has(child))
        if ((child.type === 'link' || child.type === 'linkReference') && half) {
          kept.push(...((child.children ?? []) as MdNode[]))
        } else kept.push(child)
      } else if (state !== 'inside') {
        kept.push(child)
      }
    }
    parent.children = kept
  }

  if (Array.isArray(root.children)) walk(root as MdParent)
}

/** Remark plugin: delete `%%…%%` spans. */
export function remarkComments() {
  return (tree: MdNode) => {
    // Applied last span first: an earlier span's offsets stay valid that way,
    // including two spans sharing one text node.
    const spans = findSpans(tree)
    // Only an ancestor of a span's endpoint can be left empty: every other
    // node is either kept whole or removed whole.
    const touched = new Set<MdNode>()
    for (const { from, to } of spans) {
      for (const node of pathTo(tree, from.node) ?? []) touched.add(node)
      if (to) for (const node of pathTo(tree, to.node) ?? []) touched.add(node)
    }
    for (let index = spans.length - 1; index >= 0; index--) {
      const { from, to } = spans[index] as Span
      const opening = String(from.node.value ?? '')
      if (to && to.node === from.node) {
        from.node.value = opening.slice(0, from.offset) + opening.slice(to.offset)
        continue
      }
      from.node.value = opening.slice(0, from.offset)
      if (to) to.node.value = String(to.node.value ?? '').slice(to.offset)
      removeBetween(tree, from.node, to?.node ?? null)
    }

    // Drop the nodes the strip emptied out, and no others.
    if (!touched.size) return
    visit(tree as never, (node: MdNode, index: number | undefined, parent: MdParent) => {
      if (index === undefined || !parent) return
      if (!touched.has(node) || !PRUNE_WHEN_EMPTY.has(node.type)) return
      if (!isEmptyish(node)) return
      parent.children.splice(index, 1)
      return index
    })
  }
}
