/**
 * Grouping a document's flat top-level nodes into heading-bounded sections,
 * so a heading can be folded from — Obsidian's own reading-view affordance.
 *
 * `root.children` is FLAT: `## A` and everything under it are siblings of
 * `## B`, never its parent (see `render.ts`'s header). Folding "from a
 * heading" therefore cannot be a per-node override — an override only ever
 * sees a node's OWN children, not the siblings that follow it — so this is a
 * partition over the sibling list instead, run once by `MarkdownRender`'s
 * render closure in place of a flat `renderChildren(root.children, …)`.
 *
 * `groupHeadingSections` itself is one level: it does not recurse into a
 * DEEPER heading's own body. `## B` found while `# A`'s section is open is
 * absorbed into `# A`'s `body` as a plain node, not split out — the render
 * closure recovers full nesting (every heading independently foldable) by
 * calling this again on a section's `body`, which is what makes closing `# A`
 * take `## B` with it without this function needing to know that.
 */

import { h, type Component, type VNode } from 'vue'
import { nodeKey, renderChildren, renderNode, type RenderContext, type HastNode } from './render.ts'
import { HeadingSectionFold } from './components/HeadingSectionFold.ts'

/**
 * The fold wrapper, widened for the `h()` call in `renderSections` (below),
 * and the props that call passes, named.
 *
 * `h(SomeDefineComponent, …)` makes TypeScript instantiate the component's
 * whole inferred props/emits/slots shape to pick an overload. That budget is
 * PROGRAM-WIDE, so this one call was deep enough to fail with TS2589 ("type
 * instantiation is excessively deep") the moment an unrelated consumer added a
 * component of its own — a break that lands in this file and is caused
 * somewhere else entirely, which is the worst kind to debug.
 *
 * Widening the component to `Component` stops the instantiation. It also
 * removes the structural check of that call, so {@link FoldProps} restates
 * what `HeadingSectionFold` declares and the object literal is checked against
 * THAT. The restatement can drift from the component; it is three props in the
 * same directory, and the alternative is a typecheck that fails for reasons
 * outside this package.
 */
const Fold = HeadingSectionFold as Component

interface FoldProps {
  /** Vue's own; keyed by heading id where there is one — see below. */
  key: string
  heading: VNode
  open: boolean
  onToggle?: () => void
}

/**
 * One partition of the document: a heading and everything until the next
 * heading whose depth is the same or shallower (or end of the list) — or,
 * for the optional leading segment, whatever precedes the first heading.
 */
export interface HeadingSection {
  /** Absent only for the leading segment. */
  heading?: HastNode
  /** 1–6. Absent only for the leading segment. */
  depth?: number
  body: HastNode[]
}

const HEADING_TAG = /^h([1-6])$/

function headingDepth(node: HastNode): number | undefined {
  if (node.type !== 'element' || !node.tagName) return undefined
  const match = HEADING_TAG.exec(node.tagName)
  return match ? Number(match[1]) : undefined
}

/** Whether a heading of `depth` closes `current` and opens its own section. */
function opensSection(depth: number, current: HeadingSection | null): boolean {
  // Nothing open yet, or what is open is the headingless leading segment:
  // the very first heading always starts a section of its own.
  if (!current || current.heading === undefined) return true
  return depth <= (current.depth as number)
}

/**
 * Partition a flat list of top-level hast nodes into heading sections.
 *
 * Pure and unit-testable on its own: no Vue, no DOM, no recursion — see the
 * header for how the render layer builds full nesting out of repeated calls.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export function groupHeadingSections(children: HastNode[]): HeadingSection[] {
  const sections: HeadingSection[] = []
  let current: HeadingSection | null = null
  for (const node of children) {
    const depth = headingDepth(node)
    if (depth !== undefined && opensSection(depth, current)) {
      current = { heading: node, depth, body: [] }
      sections.push(current)
      continue
    }
    if (!current) {
      current = { body: [] }
      sections.push(current)
    }
    current.body.push(node)
  }
  return sections
}

/** Which headings are folded, and where a toggle click should be reported. */
export interface HeadingFoldContext {
  folded: ReadonlySet<string>
  onToggle: (id: string, folded: boolean) => void
}

/**
 * Render a flat top-level node list as heading sections: the document's
 * footnotes split out (see below), and every run around them handed to
 * `renderSections`, which wraps each heading in {@link HeadingSectionFold}
 * and recurses into its body to give every NESTED heading its own
 * independent fold too — see the header for why one non-recursive partition
 * plus that recursion is the whole feature.
 *
 * Only ever called on `root.children` (and `renderSections` only on the
 * `body` slices derived from it) — never on a blockquote's, a callout's, a
 * table cell's or an embed's own children, which is what keeps folding scoped
 * to the top level of the (outermost) document. `MarkdownRender` enforces the
 * embed half of that by only calling this for the outermost instance, and
 * only when its `foldable` prop is on; a callout/blockquote/table cell never
 * reaches it at all, because nothing calls back into this function from
 * inside `renderNode`'s ordinary walk.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export function renderHeadingSections(
  children: HastNode[],
  context: RenderContext,
  fold: HeadingFoldContext,
): Array<VNode | string> {
  // The GFM footnotes `<section data-footnotes>` that remark-rehype appends
  // after all content belongs to the whole document, not to the heading
  // section above it: folding that heading must not take every footnote
  // definition (and the `#footnote-label` each reference points at) with it.
  // Split out here, at the top-level call, wherever it stands (a later plugin
  // may append after it), and rendered between the runs it separates — so
  // the recursion below never sees it and document order holds.
  const out: Array<VNode | string> = []
  let start = 0
  children.forEach((node, index) => {
    if (!isFootnotes(node)) return
    out.push(...renderSections(children.slice(start, index), context, fold))
    out.push(...renderChildren([node], context))
    start = index + 1
  })
  out.push(...renderSections(children.slice(start), context, fold))
  return out
}

/** `key`, or `key~n` for its nth repeat among siblings (as `childKey` does). */
function uniqueKey(used: Map<string, number>, key: string | number): string | number {
  const k = String(key)
  const n = used.get(k) ?? 0
  used.set(k, n + 1)
  return n === 0 ? key : `${k}~${n}`
}

function isFootnotes(node: HastNode): boolean {
  return (
    node.type === 'element' &&
    node.tagName === 'section' &&
    node.properties?.dataFootnotes !== undefined &&
    node.properties.dataFootnotes !== false
  )
}

/**
 * The partition and its recursion: each heading wrapped in a fold, its body
 * passed down as the fold's lazy slot, which calls this again on that body.
 */
function renderSections(
  children: HastNode[],
  context: RenderContext,
  fold: HeadingFoldContext,
): Array<VNode | string> {
  const out: Array<VNode | string> = []
  // Sibling folds need distinct keys; two headings sharing an id (`## A` twice
  // with the slugger off, or raw HTML) would otherwise patch each other.
  const used = new Map<string, number>()
  groupHeadingSections(children).forEach((section, index) => {
    if (!section.heading) {
      out.push(...renderChildren(section.body, context))
      return
    }
    // Keyed by the heading's own identity, not by section position: a section
    // index shifts whenever a heading is added above, and a fold keyed on it
    // would hand its open/closed state to a different section.
    const key = nodeKey(section.heading, index)
    const headingVNode = renderNode(section.heading, context, key)
    if (headingVNode === null || typeof headingVNode === 'string') return
    const id = String(section.heading.properties?.id ?? '')
    // A heading with no id — a bare `##` slugs to the empty string — has
    // nothing to key a fold on. It renders as an always-open section with no
    // toggle: a toggle here could only report `''`, which the host would
    // persist as a fold that never folds anything.
    const open = !id || !fold.folded.has(id)
    const props: FoldProps = {
      key: uniqueKey(used, id || key),
      heading: headingVNode,
      open,
      // Toggling always flips `open`, so the state the click PRODUCES —
      // "folded" — is exactly the current `open` value: open now means
      // closed next.
      ...(id ? { onToggle: () => fold.onToggle(id, open) } : {}),
    }
    out.push(
      h(Fold, props, {
        default: () => renderSections(section.body, context, fold),
      }),
    )
  })
  return out
}
