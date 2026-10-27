/**
 * `parse(markdown)`: one remark parse (`remark-parse`, `remark-gfm`, `remark-frontmatter`)
 * turned into the `DocTree` every other part reads.
 *
 * - Headings become a tree of `SectionNode`s: H1 is the document title, H2s are the top-level
 *   sections, deeper headings nest by depth.
 * - Blocks become `BlockNode`s with flattened text and a source position.
 * - The frontmatter keeps the source line of each key (`lineForPath`).
 * - `^anchor` ids bind to their block or section. `[[wikilinks]]` and `![[embeds]]` stay as text.
 *
 * Invariants, each covered in `tests/core/projection.test.ts`:
 * - A heading, anchor or table line inside a fenced code block is just code.
 * - A skipped heading level (H2 then H4) keeps its true depth under the nearest parent. Nothing is
 *   inserted, and this module reports no finding for it.
 * - Only blocks at the document's top level become `section.blocks`. A block inside a quote or
 *   list item is never lifted out.
 */
import type {
  Code,
  List as MdList,
  ListItem as MdListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  Yaml,
} from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { isMap, isSeq, parseDocument } from 'yaml'
import { extractTrailingAnchor, isStandaloneAnchor } from './dialect/index.js'
import { bodyAfterFrontmatter } from './frontmatter.js'
import type {
  BlockNode,
  DocTree,
  InlineSpan,
  ListItem,
  MicromarkExtension,
  ParseOptions,
  SectionNode,
  SourcePos,
} from './types.js'

// ── mdast → SourcePos ───────────────────────────────────────────────────────────

/** The `SourcePos` (line and col) of an mdast node's `position.start`. */
function posOf(node: {
  position?: { start: { line: number; column: number } } | undefined
}): SourcePos {
  const start = node.position?.start
  return start ? { line: start.line, col: start.column } : { line: 0 }
}

// ── Inline flattening (cells, paragraphs, list-item text) ────────────────────────

/**
 * Flattens inline content to plain text. `text` and `inlineCode` give their `value`. Emphasis,
 * strong, links and other containers give their children's text. A hard `break` becomes a
 * space.
 */
function flattenInline(nodes: readonly PhrasingContent[]): string {
  let out = ''
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
      case 'inlineCode':
        out += n.value
        break
      case 'break':
        out += ' '
        break
      default:
        if ('children' in n && Array.isArray(n.children)) {
          out += flattenInline(n.children as PhrasingContent[])
        } else if ('value' in n && typeof n.value === 'string') {
          out += n.value
        }
    }
  }
  return out
}

// ── Inline-code spans ──────────────

/**
 * A unist point as `{ line, col }`, without its `offset`, so it deep-equals the positions tests
 * expect. `column` is 1-based, as in unist.
 */
function pointPos(point: { line: number; column: number }): SourcePos {
  return { line: point.line, col: point.column }
}

/**
 * Adds an `InlineSpan` to `out` for every `inlineCode` node in the inline content, in document
 * order. The span uses the node's own `position`: start on the opening backtick, end one column
 * past the closing backtick (unist's end-exclusive range). `raw` is the exact source between the
 * node's offsets, backticks included. It descends into emphasis, links and other containers, so
 * inline code nested in them is found. It does not change the text `flattenInline` returns.
 */
function collectInlineSpans(
  nodes: readonly PhrasingContent[],
  source: string,
  out: InlineSpan[],
): void {
  for (const n of nodes) {
    if (n.type === 'inlineCode') {
      const p = n.position
      if (p) {
        out.push({
          start: pointPos(p.start),
          end: pointPos(p.end),
          raw: inlineRaw(source, p, n.value),
        })
      }
    } else if ('children' in n && Array.isArray(n.children)) {
      collectInlineSpans(n.children as PhrasingContent[], source, out)
    }
  }
}

/** The inline code spans of inline content, or `[]` when there are none. */
function inlineSpansOf(nodes: readonly PhrasingContent[], source: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  collectInlineSpans(nodes, source, spans)
  return spans
}

/**
 * The exact source of an inline code node, backticks included: the slice between the node's
 * character offsets. When the offsets are missing it rebuilds the text with single backticks.
 * remark always sets offsets, so that fallback should not run.
 */
function inlineRaw(
  source: string,
  position: { start: { offset?: number | undefined }; end: { offset?: number | undefined } },
  value: string,
): string {
  const from = position.start.offset
  const to = position.end.offset
  if (typeof from === 'number' && typeof to === 'number') return source.slice(from, to)
  return `\`${value}\``
}

/**
 * Where a cell's content starts (with `col`): the start of the cell's first inline child, or the
 * cell's own start when it is empty. GFM leaves the surrounding whitespace out of the child
 * positions, so this is the first content column. For a `` `path` `` cell it is the opening
 * backtick.
 */
function cellContentPos(cell: TableCell): SourcePos {
  const first = cell.children[0]
  if (first?.position) return pointPos(first.position.start)
  return posOf(cell)
}

/**
 * A list item's text: its paragraphs, flattened and joined by spaces. Nested lists and other
 * blocks in the item are left out.
 */
function flattenListItem(item: MdListItem): string {
  const parts: string[] = []
  for (const child of item.children) {
    if (child.type === 'paragraph') {
      parts.push(flattenInline(child.children))
    }
  }
  return parts.join(' ').trim()
}

/**
 * The paragraph blocks and list items whose inline content ends in a plain `text` node. Only
 * these can carry a `^block-id`: flattening drops the backticks and link brackets, so a `^id` at
 * the end of inline code (`` `git log ^main` ``) or link text would otherwise read as an anchor
 * and be cut from the text.
 */
const anchorable = new WeakSet<object>()

/** True when the last node of the inline content is plain text. */
function endsInText(nodes: readonly PhrasingContent[]): boolean {
  return nodes[nodes.length - 1]?.type === 'text'
}

/** True when the list item's last paragraph ends in plain text (see `anchorable`). */
function listItemEndsInText(item: MdListItem): boolean {
  const paragraphs = item.children.filter((c): c is Paragraph => c.type === 'paragraph')
  const last = paragraphs[paragraphs.length - 1]
  return last !== undefined && endsInText(last.children)
}

// ── Blocks (a top-level mdast node to a BlockNode or null) ───────────────

/** A `paragraph` BlockNode for a `paragraph` node. The caller strips any anchor. */
function projectParagraph(
  node: Paragraph,
  source: string,
): Extract<BlockNode, { kind: 'paragraph' }> {
  // The spans are computed once and returned by a function, so they are not serialized with
  // the block.
  const spans = inlineSpansOf(node.children, source)
  const block: Extract<BlockNode, { kind: 'paragraph' }> = {
    kind: 'paragraph',
    text: flattenInline(node.children).trim(),
    pos: posOf(node),
    inlineSpans: () => spans,
  }
  if (endsInText(node.children)) anchorable.add(block)
  return block
}

/** The code blocks `parse()` built from indented code, which has no fence line. */
const indentedCode = new WeakSet<object>()

/**
 * The line a code block's `value` starts on: the line after the opening fence, or `pos.line`
 * for an indented block.
 */
export function codeTextLine(block: Extract<BlockNode, { kind: 'code' }>): number {
  return indentedCode.has(block) ? block.pos.line : block.pos.line + 1
}

/** A `code` BlockNode for a `code` node. `lang` is `null` for a fence with no language. */
function projectCode(node: Code, source: string): Extract<BlockNode, { kind: 'code' }> {
  const block: Extract<BlockNode, { kind: 'code' }> = {
    kind: 'code',
    lang: node.lang ?? null,
    value: node.value,
    pos: posOf(node),
  }
  const start = node.position?.start.offset
  if (start !== undefined && !/^ {0,3}(`{3}|~{3})/.test(source.slice(start))) {
    indentedCode.add(block)
  }
  return block
}

/** A `list` BlockNode for a `list` node. Each task list item keeps its `checked` state. */
function projectList(node: MdList): Extract<BlockNode, { kind: 'list' }> {
  const items: ListItem[] = node.children.map((li) => {
    const item: ListItem = { text: flattenListItem(li), pos: posOf(li) }
    if (li.checked === true || li.checked === false) item.checked = li.checked
    if (listItemEndsInText(li)) anchorable.add(item)
    return item
  })

  return {
    kind: 'list',
    ordered: node.ordered === true,
    items,
    pos: posOf(node),
  }
}

/**
 * A `table` BlockNode for a `table` node. The header cells become `columns` and the body rows
 * become `rows` (`string[][]`), as flattened text. GFM reads an anchor line directly under a
 * table as an extra row. So a last row with a single cell that is only a `^block-id` becomes the
 * table's anchor, not a data row. `rowPos(i)` returns the source line of body row `i`.
 */
function projectTable(
  node: Table,
  source: string,
): {
  block: Extract<BlockNode, { kind: 'table' }>
  /** The id from a last row that held only a `^id`, if any. */
  absorbedAnchor?: string
} {
  const [headerRow, ...bodyRows] = node.children
  const columns = headerRow
    ? headerRow.children.map((cell) => flattenInline(cell.children).trim())
    : []

  let absorbedAnchor: string | undefined
  let dataRows = bodyRows
  const lastRow = bodyRows[bodyRows.length - 1]
  if (lastRow && lastRow.children.length === 1 && lastRow.children[0]) {
    const onlyCellText = flattenInline(lastRow.children[0].children).trim()
    const id = isStandaloneAnchor(onlyCellText)
    if (id) {
      absorbedAnchor = id
      dataRows = bodyRows.slice(0, -1)
    }
  }

  const rows = dataRows.map((row) =>
    row.children.map((cell) => flattenInline(cell.children).trim()),
  )
  const rowLines = dataRows.map((row) => posOf(row))

  // Per-cell data, indexed [bodyRow][col] like `rows`: where each cell's content starts, and
  // its inline code spans. The block's methods return them, so they are not serialized with it.
  const cellPositions: SourcePos[][] = dataRows.map((row) => row.children.map(cellContentPos))
  const cellSpans: InlineSpan[][][] = dataRows.map((row) =>
    row.children.map((cell) => inlineSpansOf(cell.children, source)),
  )

  const block: Extract<BlockNode, { kind: 'table' }> = {
    kind: 'table',
    columns,
    rows,
    rowPos(i: number): SourcePos {
      return rowLines[i] ?? { line: 0 }
    },
    cellPos(row: number, col: number): SourcePos {
      return cellPositions[row]?.[col] ?? { line: 0 }
    },
    inlineSpans(row: number, col: number): InlineSpan[] {
      return cellSpans[row]?.[col] ?? []
    },
    pos: posOf(node),
  }
  return absorbedAnchor !== undefined ? { block, absorbedAnchor } : { block }
}

/**
 * The `BlockNode` for one top-level node, or `null` for a node that is not a block kind
 * (a blockquote, a thematic break, HTML and so on). `buildTree` handles headings.
 */
function projectBlock(node: RootContent, source: string): BlockNode | null {
  switch (node.type) {
    case 'paragraph':
      return projectParagraph(node, source)
    case 'code':
      return projectCode(node, source)
    case 'list':
      return projectList(node)
    case 'table':
      return projectTable(node, source).block
    default:
      return null
  }
}

// ── The section tree (flat headings to nested SectionNodes) ──────────────

function newSection(name: string, depth: number, pos: SourcePos): SectionNode {
  return { name, depth, pos, sections: [], blocks: [], anchors: [] }
}

/**
 * Builds the nested section tree from the flat list of top-level nodes.
 *
 * - The first `# H1` is the document title (`root.name`). It is not a body section. A later H1
 *   nests like any other heading.
 * - H2s are the top-level body sections (`root.sections`).
 * - H3 and deeper nest under the nearest section of smaller depth. A skipped level keeps its
 *   true `depth`. Nothing is inserted.
 * - Other top-level nodes go into the current section's `blocks`.
 * - A `^block-id` binds to the block it ends (`BlockNode.anchor`). A standalone one binds to
 *   the block before it, or to the section (`SectionNode.anchors`) when there is no such block,
 *   that block already has an anchor, or the node before it is not a block kind.
 */
function buildTree(
  root: Root,
  source: string,
): { docRoot: SectionNode; title: string | undefined } {
  // The root has depth 1 (the H1 level). Its `sections` are the H2s.
  const docRoot = newSection('', 1, { line: 0 })
  let title: string | undefined
  let titleSeen = false

  // docRoot plus the open sections, deepest last.
  const stack: SectionNode[] = [docRoot]

  for (const node of root.children) {
    if (node.type === 'yaml') continue // frontmatter handled separately

    if (node.type === 'heading') {
      const name = flattenInline(node.children).trim()
      if (node.depth === 1 && !titleSeen) {
        title = name
        titleSeen = true
        continue
      }
      attachSection(stack, newSection(name, node.depth, posOf(node)))
      continue
    }

    // Any other node becomes a block of the deepest open section.
    attachContentNode(stack[stack.length - 1] as SectionNode, node, source)
  }

  return { docRoot, title }
}

/** Adds `child` under the nearest open section whose depth is less than `child.depth`. */
function attachSection(stack: SectionNode[], child: SectionNode): void {
  while (stack.length > 1 && (stack[stack.length - 1] as SectionNode).depth >= child.depth) {
    stack.pop()
  }
  ;(stack[stack.length - 1] as SectionNode).sections.push(child)
  stack.push(child)
}

/**
 * The sections whose last top-level node was not projected to a block (a blockquote, HTML, a
 * thematic break). A standalone `^id` that follows such a node binds to the section.
 */
const afterUnprojected = new WeakSet<SectionNode>()

/**
 * Turns one top-level node into a block of `sec`. A table's last `^id` row becomes the table's
 * anchor. A paragraph that is only a `^block-id` binds an anchor and adds no block. A trailing
 * `^id` on a paragraph or list item is removed from the text and set as the block's anchor.
 */
function attachContentNode(sec: SectionNode, node: RootContent, source: string): void {
  if (node.type === 'table') {
    const projected = projectTable(node, source)
    if (projected.absorbedAnchor !== undefined) {
      projected.block.anchor = projected.absorbedAnchor
    }
    sec.blocks.push(projected.block)
    afterUnprojected.delete(sec)
    return
  }

  const block = projectBlock(node, source)

  // Standalone `^block-id` paragraph: bind to the preceding block, else to the section.
  if (block && block.kind === 'paragraph' && anchorable.has(block)) {
    const standalone = isStandaloneAnchor(block.text)
    if (standalone !== null) {
      bindAnchor(sec, standalone)
      return // the anchor paragraph itself is not a content block
    }
  }

  if (!block) {
    // Not a block kind, such as a blockquote. A standalone `^id` after it must not reach back
    // to the block before it.
    afterUnprojected.add(sec)
    return
  }

  bindTrailingAnchor(block)
  sec.blocks.push(block)
  afterUnprojected.delete(sec)
}

/**
 * Moves a trailing `^id` from a paragraph or list into the block's anchor. On a paragraph this
 * is an anchor with no blank line before it. On a list the first item that has one wins
 * (Obsidian binds it to the block it sits in).
 */
function bindTrailingAnchor(block: BlockNode): void {
  if (block.kind === 'paragraph') {
    if (!anchorable.has(block)) return
    const trailing = extractTrailingAnchor(block.text)
    if (trailing) {
      block.text = trailing.rest
      block.anchor = trailing.id
    }
    return
  }

  if (block.kind === 'list') {
    for (const item of block.items) {
      if (!anchorable.has(item)) continue
      const trailing = extractTrailingAnchor(item.text)
      if (trailing) {
        item.text = trailing.rest
        block.anchor = trailing.id
        break
      }
    }
  }
}

/**
 * Binds a standalone `^id`. When the node right before it is the section's last block and that
 * block has no anchor, the id goes to that block (`BlockNode.anchor`). Otherwise it goes to the
 * section (`SectionNode.anchors`).
 */
function bindAnchor(sec: SectionNode, id: string): void {
  const lastBlock = afterUnprojected.has(sec) ? undefined : sec.blocks[sec.blocks.length - 1]
  if (lastBlock && lastBlock.anchor === undefined) {
    lastBlock.anchor = id
  } else {
    sec.anchors.push(id)
  }
}

// ── Frontmatter (with `lineForPath` from the `yaml` CST) ─────────────────

/**
 * Builds `DocTree.frontmatter` from the mdast `yaml` node.
 *
 * `lineForPath(path)` maps a key path (a Zod issue path such as `["status"]`, `["prs", 0]` or
 * `["nested", "b"]`) to the source line of that key (for a map) or element (for an array). It
 * uses the node ranges from the `yaml` package.
 *
 * The node's `value` leaves out the `---` fences, so it starts on the line after the opening
 * `---`, which is `pos.line`. Line `L` of the YAML (1-based) is document line `pos.line + L`.
 */
function buildFrontmatter(node: Yaml): NonNullable<DocTree['frontmatter']> {
  const pos = posOf(node)
  const raw = node.value
  const doc = parseDocument(raw)
  const errors: FrontmatterYamlError[] = doc.errors.map((e) => ({
    message: e.message.split('\n')[0]!.replace(/ at line \d+, column \d+:?$/, ''),
    line: pos.line + (e.linePos?.[0].line ?? 1),
  }))
  let data: unknown = null
  try {
    data = doc.toJS()
  } catch (err) {
    // An alias to an anchor that is not defined throws while the value is built.
    errors.push({ message: (err as Error).message, line: pos.line + 1 })
  }

  const blockBaseLine = pos.line

  function lineForPath(path: (string | number)[]): number | undefined {
    if (path.length === 0) return blockBaseLine + 1 // the whole block: its first line
    const localOffset = keyOffset(doc.contents as unknown, path)
    if (localOffset === undefined) return undefined
    return blockBaseLine + offsetToLine(raw, localOffset)
  }

  const frontmatter = { raw, data, pos, lineForPath }
  yamlErrors.set(frontmatter, errors)
  return frontmatter
}

/** A YAML error in a frontmatter block, with the document line it is on. */
export interface FrontmatterYamlError {
  message: string
  line: number
}

/** The YAML errors of each frontmatter block `parse()` built. */
const yamlErrors = new WeakMap<object, FrontmatterYamlError[]>()

/** The YAML errors in a frontmatter block from `parse()`; `[]` for any other object. */
export function frontmatterYamlErrors(
  frontmatter: NonNullable<DocTree['frontmatter']>,
): FrontmatterYamlError[] {
  return yamlErrors.get(frontmatter) ?? []
}

/**
 * Follows `path` through the parsed YAML and returns the character offset of the key (in a map)
 * or element (in a sequence) it names. Returns `undefined` when the path does not resolve.
 */
function keyOffset(contents: unknown, path: (string | number)[]): number | undefined {
  let node: unknown = contents
  let offset: number | undefined
  for (const seg of path) {
    if (isMap(node)) {
      const pair = node.items.find((p) => scalarKey(p.key) === seg)
      if (!pair) return undefined
      offset = rangeStart(pair.key)
      node = pair.value
    } else if (isSeq(node)) {
      if (typeof seg !== 'number') return undefined
      const el: unknown = node.items[seg]
      if (el === undefined) return undefined
      offset = rangeStart(el)
      node = el
    } else {
      return undefined
    }
  }
  return offset
}

/** The value of a map key node, or the key itself when it is already a primitive. */
function scalarKey(key: unknown): unknown {
  if (key && typeof key === 'object' && 'value' in key) {
    return (key as { value: unknown }).value
  }
  return key
}

/** The 0-based start offset of a node's source range, if it has one. */
function rangeStart(node: unknown): number | undefined {
  const range = (node as { range?: readonly number[] } | undefined)?.range
  return range && typeof range[0] === 'number' ? range[0] : undefined
}

/** The 1-based line number of a 0-based character offset in `text`. */
function offsetToLine(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

// ── parse() ─────────────────────────────────────────────

const PROCESSOR = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml'])

/** The processor for one `parse()` call: the shared one, or one with the caller's extensions. */
function processorFor(extensions: MicromarkExtension[] | undefined): {
  parse(markdown: string): Root
} {
  if (extensions === undefined || extensions.length === 0) return PROCESSOR
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(function addExtensions() {
      const data = this.data()
      data.micromarkExtensions = [...(data.micromarkExtensions ?? []), ...extensions]
    })
}

/**
 * Parses a markdown document into a `DocTree`: the frontmatter, the body text, a tree of heading
 * sections holding typed blocks with source positions, and the remark tree.
 *
 * GFM (tables, task lists, strikethrough, autolinks) and YAML frontmatter are on. A `^anchor`
 * at the end of a block, or alone on the line after it, binds that id to the block. One alone
 * before any block binds it to the section. `[[wikilinks]]` and `![[embeds]]` are kept as text.
 *
 * It does not throw on bad frontmatter YAML. `frontmatter.data` is then best-effort (`null` when
 * the value cannot be built), and validating the tree gives a `frontmatter/yaml` finding.
 */
export function parse(markdown: string, opts?: ParseOptions): DocTree {
  const mdast = processorFor(opts?.extensions).parse(markdown) as Root

  const yamlNode = mdast.children.find((c): c is Yaml => c.type === 'yaml')
  const frontmatter = yamlNode ? buildFrontmatter(yamlNode) : null

  const body = bodyAfterFrontmatter(markdown, yamlNode)
  const { docRoot, title } = buildTree(mdast, markdown)
  docRoot.name = title ?? ''

  return { frontmatter, body, root: docRoot, mdast }
}
