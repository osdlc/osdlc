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

/** Every node's parent, built in one pass so no endpoint searches the tree from the root. */
function parentsOf(tree: MdNode): Map<MdNode, MdNode> {
  const parents = new Map<MdNode, MdNode>()
  const stack: MdNode[] = [tree]
  while (stack.length) {
    const node = stack.pop() as MdNode
    for (const child of node.children ?? []) {
      parents.set(child, node)
      stack.push(child)
    }
  }
  return parents
}

/** Add `node` and its ancestors to `into`, stopping at the first one already there. */
function addAncestry(parents: Map<MdNode, MdNode>, node: MdNode, into: Set<MdNode>): void {
  for (let at: MdNode | undefined = node; at && !into.has(at); at = parents.get(at)) into.add(at)
}

/**
 * Delete every node lying strictly between the endpoints of each cross-node
 * span, in one walk of the tree. The endpoints themselves are kept — the
 * caller has already trimmed their text. A span with `to === null` deletes
 * everything after its `from`.
 */
function removeSpans(root: MdNode, spans: Span[], parents: Map<MdNode, MdNode>): void {
  const opens = new Set<MdNode>()
  const closes = new Set<MdNode>()
  const spine = new Set<MdNode>()
  for (const { from, to } of spans) {
    if (to && to.node === from.node) continue
    opens.add(from.node)
    addAncestry(parents, from.node, spine)
    if (to) {
      closes.add(to.node)
      addAncestry(parents, to.node, spine)
    }
  }
  if (!opens.size) return

  let inside = false

  const walk = (parent: MdParent) => {
    const kept: MdNode[] = []
    for (const child of parent.children) {
      if (opens.has(child) || closes.has(child)) {
        // A node can close one span and open the next.
        if (closes.has(child)) inside = false
        if (opens.has(child)) inside = true
        kept.push(child)
      } else if (spine.has(child)) {
        // An ancestor of an endpoint: keep the branch, and let the recursion
        // find the endpoint inside it and flip the state there.
        const before = inside
        if (Array.isArray(child.children)) walk(child as MdParent)
        // A link with only one marker inside it cannot stay: its destination
        // would publish what the comment hides. Its surviving text stays.
        const half = before || inside
        if ((child.type === 'link' || child.type === 'linkReference') && half) {
          kept.push(...((child.children ?? []) as MdNode[]))
        } else kept.push(child)
      } else if (!inside) {
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
    const parents = parentsOf(tree)
    const touched = new Set<MdNode>()
    for (const { from, to } of spans) {
      addAncestry(parents, from.node, touched)
      if (to) addAncestry(parents, to.node, touched)
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
    }
    removeSpans(tree, spans, parents)

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
