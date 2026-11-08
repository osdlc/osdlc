/**
 * Shared mdast helpers for the dialect plugins.
 *
 * Every dialect feature is a remark plugin operating on remark's own parse
 * (D-7VMX): plugins re-tokenize `text` nodes and splice replacements in, which
 * is why fenced/inline code is immune — it never becomes a `text` node.
 */

import { visit, SKIP } from 'unist-util-visit'

/** Loose mdast node shape — dialect plugins add node types remark never sees. */
export interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  data?: {
    hName?: string
    hProperties?: Record<string, unknown>
    hChildren?: unknown[]
    [key: string]: unknown
  }
  position?: {
    start: { line: number; column: number; offset?: number }
    end: { line: number; column: number; offset?: number }
  }
  [key: string]: unknown
}

export interface MdParent extends MdNode {
  children: MdNode[]
}

/**
 * Merge hast properties onto a node, concatenating `className` rather than
 * replacing it — several plugins decorate the same block (a callout that also
 * carries a `data-line` and a block id).
 */
export function setHProps(node: MdNode, props: Record<string, unknown>): void {
  node.data ??= {}
  const existing = (node.data.hProperties ??= {})
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') {
      const prev = toClassList(existing.className)
      const next = toClassList(value)
      existing.className = [...prev, ...next.filter((c) => !prev.includes(c))]
    } else {
      existing[key] = value
    }
  }
}

function toClassList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean)
  return []
}

/**
 * A custom mdast node that mdast-util-to-hast turns into `<hName …>` via its
 * unknown-node handler plus `applyData`.
 */
export function hastNode(
  type: string,
  hName: string,
  hProperties: Record<string, unknown>,
  children: MdNode[] = [],
): MdNode {
  return { type, children, data: { hName, hProperties } }
}

/** `decodeURIComponent` that returns its input rather than throwing on a stray `%`. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Where a `link`/`image` points, or a `linkReference`/`imageReference` through
 * its `definition`. `[label][ref]`, `[label][]` and `[label]` are CommonMark
 * spellings of the same link, so a plugin claiming one destination claims all
 * of them. `undefined` for a reference with no definition, which renders as
 * literal text.
 *
 * Build `definitions` once per tree with {@link definitionUrls}.
 */
export function destination(node: MdNode, definitions: Map<string, string>): string | undefined {
  if (node.type === 'link' || node.type === 'image') return String(node.url ?? '')
  return definitions.get(String(node.identifier ?? ''))
}

/**
 * Every `definition`'s url, keyed by its normalized `identifier` — the same key
 * a reference carries. The first definition of a label wins, as in CommonMark.
 */
export function definitionUrls(tree: MdNode): Map<string, string> {
  const urls = new Map<string, string>()
  visit(tree as never, 'definition', (node: MdNode) => {
    const id = String(node.identifier ?? '')
    if (!urls.has(id)) urls.set(id, String(node.url ?? ''))
  })
  return urls
}

/** Drop the fields a link or image node carries, once it has become something else. */
export function clearLinkFields(node: MdNode): void {
  delete node.url
  delete node.title
  delete node.identifier
  delete node.label
  delete node.referenceType
}

/** Text node factory. */
export function text(value: string): MdNode {
  return { type: 'text', value }
}

/** Is this a node that becomes a block-level hast element? */
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'list',
  'listItem',
  'code',
  'table',
  'tableRow',
  'thematicBreak',
  'html',
  'definition',
  'footnoteDefinition',
  'math',
  'callout',
  'calloutContent',
])

export function isBlockType(type: string): boolean {
  return BLOCK_TYPES.has(type)
}

/**
 * Scan a parent's phrasing children for a paired delimiter that may open in one
 * text node and close in a later one, so `==**bold** run==` is handled as a
 * single span rather than per-text-node fragments. `remarkMark` is the only
 * caller; `%%comments%%` have their own document-order scan.
 *
 * `build` receives the nodes between the delimiters (possibly none) and
 * returns the nodes that replace the whole span — `[]` deletes it, a single
 * wrapper node wraps it (highlight).
 *
 * @param openGuard Rejects an opening delimiter given the character that
 *   follows it (Obsidian requires the run to start with a non-space).
 * @param closeGuard Rejects a closing delimiter given the character preceding
 *   it.
 */
export function spliceDelimited(
  parent: MdParent,
  delimiter: string,
  build: (inner: MdNode[]) => MdNode[],
  openGuard: (after: string) => boolean = () => true,
  closeGuard: (before: string) => boolean = () => true,
): boolean {
  const len = delimiter.length
  let changed = false
  let index = 0
  // Where the opener search starts in the current node: past any empty span
  // already passed over in it.
  let from = 0
  const next = (): void => {
    index++
    from = 0
  }

  while (index < parent.children.length) {
    const node = parent.children[index]
    if (!node || node.type !== 'text' || typeof node.value !== 'string') {
      next()
      continue
    }
    const open = findDelimiter(node.value, delimiter, from, openGuard, 'after')
    if (open < 0) {
      next()
      continue
    }

    // Locate the closer: same node first, then later text siblings.
    let closeIndex = index
    let close = findDelimiter(node.value, delimiter, open + len, closeGuard, 'before')
    // `====` closes on itself with nothing between. That run is literal text,
    // not an empty span: skip all of it, so its second half cannot open a
    // span with a later closer either.
    if (close === open + len) {
      from = close + len
      continue
    }
    if (close < 0) {
      closeIndex = -1
      for (let j = index + 1; j < parent.children.length; j++) {
        const sibling = parent.children[j]
        if (!sibling || sibling.type !== 'text' || typeof sibling.value !== 'string') continue
        const found = findDelimiter(sibling.value, delimiter, 0, closeGuard, 'before')
        if (found >= 0) {
          closeIndex = j
          close = found
          break
        }
      }
      if (closeIndex < 0) {
        next()
        continue
      }
    }

    const openValue = node.value
    const closeNode = parent.children[closeIndex]
    if (!closeNode) {
      next()
      continue
    }
    const closeValue = closeNode.value as string

    const before = openValue.slice(0, open)
    const inner: MdNode[] = []
    if (closeIndex === index) {
      const middle = openValue.slice(open + len, close)
      if (middle) inner.push(text(middle))
    } else {
      const head = openValue.slice(open + len)
      if (head) inner.push(text(head))
      inner.push(...parent.children.slice(index + 1, closeIndex))
      const tail = closeValue.slice(0, close)
      if (tail) inner.push(text(tail))
    }
    const after = closeValue.slice(close + len)

    const replacement: MdNode[] = []
    if (before) replacement.push(text(before))
    replacement.push(...build(inner))
    if (after) replacement.push(text(after))

    parent.children.splice(index, closeIndex - index + 1, ...replacement)
    changed = true
    // Resume on the trailing text node — it may open the next span — or just
    // past everything we inserted when there is no trailing text.
    index += replacement.length - (after ? 1 : 0)
    from = 0
  }

  return changed
}

function findDelimiter(
  value: string,
  delimiter: string,
  from: number,
  guard: (char: string) => boolean,
  side: 'before' | 'after',
): number {
  let at = value.indexOf(delimiter, from)
  while (at >= 0) {
    const char = side === 'after' ? (value[at + delimiter.length] ?? '') : (value[at - 1] ?? '')
    if (guard(char)) return at
    at = value.indexOf(delimiter, at + 1)
  }
  return -1
}

/** Every parent that can hold phrasing content. */
export function isPhrasingParent(node: MdNode): node is MdParent {
  return Array.isArray(node.children) && node.type !== 'code' && node.type !== 'inlineCode'
}

/**
 * Visit `text` nodes, never descending into a node whose type is in `skip`.
 *
 * The skip is a whole subtree, not just an immediate parent: a `[[link]]` or a
 * `#tag` anywhere inside a markdown link's text — including nested in emphasis
 * — must stay literal. Tokenizing there produced an anchor inside an anchor,
 * which `rehype-raw` then splits, truncating or emptying the outer link.
 *
 * The handler returns the index to resume at when it replaced the node, or
 * `undefined` when it left the tree alone.
 */
export function visitTextOutside(
  tree: MdNode,
  skip: ReadonlySet<string>,
  handler: (node: MdNode, index: number, parent: MdParent) => number | undefined,
): void {
  visit(tree as never, (node: MdNode, index: number | undefined, parent: MdParent | undefined) => {
    if (skip.has(node.type)) return SKIP
    if (node.type !== 'text' || index === undefined || !parent) return
    const resume = handler(node, index, parent)
    return resume === undefined ? undefined : [SKIP, resume]
  })
}
