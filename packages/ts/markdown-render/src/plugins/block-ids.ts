/**
 * Trailing `^block-id` markers.
 *
 * Obsidian only registers a block reference when the `^anchor` is
 * line-terminal; mid-line anchors are ordinary text. Two placements are
 * supported, matching Obsidian:
 *
 *   Some paragraph. ^abc123          (marker ends the block's last line, or
 *   Some paragraph.                   is that line on its own)
 *   ^abc123
 *
 *   > a quote
 *
 *   ^abc123                          (marker on its own, after the block)
 *
 * The marker text is removed and the owning element gains `id` and
 * `data-block-id`. A marker with nothing to own stays ordinary text instead:
 * first inside its container, the whole content of one, or after a block that
 * renders no element to carry the id (raw HTML, a definition, a footnote
 * definition).
 *
 * An element holds one id, so a paragraph ending in several marker lines
 * (`para\n^abc\n^def`) is anchored by the last; the others stay text, and
 * `sliceByBlockId` resolves only the last.
 */

import { visit } from 'unist-util-visit'
import { isBlockType, setHProps, type MdNode, type MdParent } from './util.ts'

/**
 * Line-terminal `^anchor` at the end of one line. The inline pass applies it to
 * the last line of a block's last text run, which can span several lines.
 */
export const BLOCK_ID_RE = /(?:^|[ \t])\^([A-Za-z0-9][A-Za-z0-9-]*)[ \t]*$/
/** A paragraph that is nothing but `^anchor`. */
export const STANDALONE_BLOCK_ID_RE = /^[ \t]*\^([A-Za-z0-9][A-Za-z0-9-]*)[ \t]*$/

/**
 * The text node a block's `^anchor` could sit in: the last child, following
 * nested BLOCK containers down (a blockquote's paragraph, a list item's) but
 * stopping at inline markup and at a nested `list`. A list's items own their
 * own markers, so `- a\n  - b ^id` marks item `b`, not item `a`.
 *
 * It also stops at a nested list, whose items own their own markers. The
 * inline pass visits outer blocks first, so following a list down let
 * `- a\n  - b ^id` hand item b's marker to item a. Other nested blocks (a quote
 * or heading inside an item) are followed, so the item keeps the marker, which
 * matches the lines `sliceByBlockId` takes for it.
 *
 * Stopping matters. `text **bold ^id**` and `[label ^id](url)` both end in a
 * phrasing container, so their `^id` is followed by `**` or `](url)` and is not
 * line-terminal — Obsidian reads that as ordinary text. Taking the deepest last
 * text node instead would delete the author's words and mint an id from them.
 */
function trailingTextNode(node: MdNode): MdNode | undefined {
  let current = node
  for (;;) {
    const children = current.children
    const last = children?.[children.length - 1]
    if (!last) return undefined
    if (last.type === 'text') return last
    if (!isBlockType(last.type) || last.type === 'list') return undefined
    current = last
  }
}

function attach(node: MdNode, id: string): void {
  setHProps(node, { id, dataBlockId: id })
}

/** The `^anchor` of a paragraph whose sole child is that marker's text. */
function standaloneId(node: MdNode): string | undefined {
  if (node.type !== 'paragraph') return undefined
  const children = node.children ?? []
  const only = children[0]
  if (children.length !== 1 || !only || only.type !== 'text') return undefined
  return STANDALONE_BLOCK_ID_RE.exec(String(only.value ?? ''))?.[1]
}

/**
 * Blocks whose `hProperties` never reach an element: raw HTML becomes a `raw`
 * node, a definition renders nothing, and footnote definitions are rebuilt in
 * the footer. A standalone marker after one has nothing to own.
 */
const CANNOT_CARRY_ID = new Set(['html', 'definition', 'footnoteDefinition'])

/** Block containers a standalone marker paragraph can be the sole content of. */
const WRAPS_ONE_BLOCK = new Set(['blockquote', 'listItem', 'callout', 'calloutContent'])

/**
 * The `^anchor` of a block whose entire content is a standalone marker
 * paragraph — the paragraph itself, or a container holding nothing else
 * (`> ^abc`, `- ^abc`, a callout whose body is only the marker).
 *
 * A callout's title is chrome the marker cannot attach to (it is not a block,
 * and an untitled callout's is generated), so only the content div counts.
 */
function markerOnlyId(node: MdNode): string | undefined {
  const standalone = standaloneId(node)
  if (standalone !== undefined) return standalone
  if (!WRAPS_ONE_BLOCK.has(node.type)) return undefined
  const children =
    node.type === 'callout'
      ? (node.children ?? []).filter((child) => child.type !== 'calloutTitle')
      : (node.children ?? [])
  const only = children[0]
  if (children.length !== 1 || !only) return undefined
  return markerOnlyId(only)
}

/**
 * The title of a callout with no body, whose title line is therefore the
 * callout's last line: `> [!note] Title ^abc` anchors the callout the same way
 * `> quote ^abc` anchors a blockquote.
 */
function bodylessCalloutTitle(node: MdNode): MdNode | undefined {
  if (node.type !== 'callout') return undefined
  const children = node.children ?? []
  const content = children.find((child) => child.type === 'calloutContent')
  if (content?.children?.length) return undefined
  return children.find((child) => child.type === 'calloutTitle')
}

/**
 * Every item of a tight list. `remark-rehype` unwraps a tight item's
 * paragraphs into the `<li>`, so an id set on one of them never renders.
 */
function tightItems(tree: MdNode): Set<MdNode> {
  const items = new Set<MdNode>()
  visit(tree as never, 'list', (list: MdNode) => {
    const children = list.children ?? []
    if (list.spread || children.some((item) => item.spread)) return
    for (const item of children) items.add(item)
  })
  return items
}

/** Remark plugin: lift `^block-id` markers onto their block. */
export function remarkBlockIds() {
  return (tree: MdNode) => {
    // An id names one element. The first marker for an id owns it; a repeat
    // stays literal text rather than minting a second element with that id.
    const used = new Set<string>()

    // Standalone `^id` paragraphs attach to the preceding block.
    visit(
      tree as never,
      'paragraph',
      (node: MdNode, index: number | undefined, parent: MdParent) => {
        if (index === undefined || !parent) return
        const id = standaloneId(node)
        if (id === undefined) return
        const previous = parent.children[index - 1]
        // With no block above it — or one that cannot carry an id — the marker
        // owns nothing, so it stays literal text.
        if (!previous || CANNOT_CARRY_ID.has(previous.type) || used.has(id)) return
        // The block already holds an id: a second marker stays text instead of
        // replacing it and vanishing.
        if (previous.data?.hProperties?.id !== undefined) return
        used.add(id)
        attach(previous, id)
        parent.children.splice(index, 1)
        return index
      },
    )

    const tight = tightItems(tree)

    // Inline trailing markers: `text… ^id` at the end of a block.
    visit(tree as never, (node: MdNode, _index: number | undefined, parent: MdNode | undefined) => {
      if (!OWNS_BLOCK_ID.has(node.type)) return
      // A block that is nothing but a standalone marker paragraph has no content
      // to own the reference, so the marker stays literal text rather than
      // emptying the block.
      if (markerOnlyId(node) !== undefined) return
      const title = bodylessCalloutTitle(node)
      const last = title ? trailingTextNode(title) : trailingTextNode(node)
      if (!last || typeof last.value !== 'string') return
      // A text run spans every line of its paragraph; the marker must end the
      // last one, which may hold nothing else (`text\n^abc`), as `slice.ts`
      // reads it.
      const lineStart = last.value.lastIndexOf('\n') + 1
      const match = BLOCK_ID_RE.exec(last.value.slice(lineStart))
      const id = match?.[1]
      if (!match || id === undefined) return
      const rest = last.value.slice(0, lineStart + match.index).replace(/[ \t\r\n]+$/, '')
      // Marker lines with nothing else above them own nothing either.
      if (rest && rest.split(/\r?\n/).every((line) => STANDALONE_BLOCK_ID_RE.test(line))) return
      // A title that is nothing but the marker would be emptied; keep it literal.
      if (title && !rest && title.children?.length === 1) return
      // A tight item's paragraph is unwrapped into the `<li>`, so the item owns
      // the marker. Only a paragraph above a nested list reaches here: an item
      // ending in its paragraph took the marker when it was visited.
      const owner = node.type === 'paragraph' && parent && tight.has(parent) ? parent : node
      if (owner !== node && owner.data?.hProperties?.id !== undefined) return
      if (used.has(id)) return
      used.add(id)
      last.value = rest
      attach(owner, id)
    })
  }
}

/** Block types that can own a block reference. */
const OWNS_BLOCK_ID = new Set([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'callout',
  'table',
])
