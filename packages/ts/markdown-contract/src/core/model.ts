/**
 * The typed model: builds the `Doc` from a parse tree and a contract. `read()` and
 * `validate().doc` return it, and `docRule` rules receive it. The structure and content checks
 * never read it. Their findings come from the parse tree, the Zod schemas and the grammar.
 *
 * At each level the model reads `def.body` to tell declared sections from undeclared ones (those
 * a `gap()` or `allowUnknown` allows), through the slot resolver the structure and content
 * planes use (`slots.ts`), so all three bind the same section to the same slot. A declared
 * section that fills its slot gets two keys on the `SectionGroup`: its exact heading text and its
 * lowerCamelCase form. `.section(name)` also
 * finds it. Undeclared sections go in `unknown`, in document order (`[]` when none). A declared
 * section that is absent has no key, so it reads as `undefined`.
 *
 *   - `doc.frontmatter`: the frontmatter schema's output, or the parsed YAML when there is no
 *     schema output.
 *   - `doc.body`: the `SectionGroup` for `tree.root.sections`, with each declared section's
 *     `children` grammar applied below it.
 *   - `SectionView`: `name`, `pos`, `anchors`, `text(scope?)`, `tables` and `table`, `lists`,
 *     `byAnchor(id)` and the nested `sections`.
 *   - `doc.byAnchor(id)`: finds an anchor anywhere in the document and returns its `BlockView`.
 *
 * A table row is keyed by column name. A cell with a `cells` schema reads back as the schema's
 * output, from the `ParsedValues` of the validation pass. Other cells stay strings. `Infer`
 * gives the static types. The rows in the parse tree stay strings.
 */
import { toCamelKey } from './camel.js'
import { createParsedValues, type ParsedValues } from './parsed-values.js'
import { bindSlots, isLeafSpec, pickBlock, type Slot, slotsOf } from './slots.js'
import type {
  BlockNode,
  BlockView,
  CodeView,
  ContractDef,
  Doc,
  DocTree,
  InlineSpan,
  ListItem,
  ListView,
  ParagraphView,
  SectionGroup,
  SectionNode,
  SectionOpts,
  SectionSeq,
  SectionView,
  TableView,
  ValidateCtx,
} from './types.js'

/** A table `BlockNode`. */
type TableBlock = Extract<BlockNode, { kind: 'table' }>

// ── BlockNode to BlockView ──────────

/**
 * The table block and body row index of each row object a `TableView` hands out, so
 * `Doc.inlineSpans` finds a row by identity. Matching by content would send a row whose cells a
 * schema transformed nowhere, and a repeated row to the first equal one.
 */
const rowOrigin = new WeakMap<object, { node: TableBlock; ri: number }>()

/**
 * A `TableView` for a table block. Each row is keyed by column name. A cell reads back as the
 * output of its `cells` schema when one ran (`values.cell`, set by the content plane), else as
 * the cell string. So a transforming cell (such as `Location` → `{ path, symbol? }`) reads back
 * as an object, and a column with no schema stays a string. `node.rows` keeps the strings.
 * `Infer` types the rows as `TableView<Row>`. At run time each row is `Record<string, unknown>`.
 */
function tableView(node: Extract<BlockNode, { kind: 'table' }>, values: ParsedValues): TableView {
  const rows: Record<string, unknown>[] = node.rows.map((cells, r) => {
    const row: Record<string, unknown> = {}
    node.columns.forEach((col, i) => {
      const typed = values.cell(node, r, col)
      row[col] = typed !== undefined ? typed : (cells[i] ?? '')
    })
    rowOrigin.set(row, { node, ri: r })
    return row
  })
  const view: TableView = {
    kind: 'table',
    columns: node.columns,
    rows: rows as Record<string, string>[],
    rowCount: rows.length,
    pos: node.pos,
    column(name) {
      return rows.map((r) => r[name as string]) as never
    },
    find(p) {
      return rows.find((r, i) => p(r as never, i)) as never
    },
    rowPos(i) {
      return node.rowPos(i)
    },
    cellPos(row, name) {
      // Find the row object in `rows` and the column by name, then ask the table block.
      // `{ line: 0 }` when either is not found.
      const ri = rows.indexOf(row as Record<string, string>)
      const ci = node.columns.indexOf(name)
      if (ri < 0 || ci < 0) return { line: 0 }
      return node.cellPos(ri, ci)
    },
    [Symbol.iterator](): Iterator<Record<string, string>> {
      return rows[Symbol.iterator]() as Iterator<Record<string, string>>
    },
  }
  return view
}

/**
 * A `ListView` for a list block. Each item reads back as the output of the `everyItem` schema
 * when one ran (`values.item`, set by the content plane), else as the `ListItem`. So a
 * transforming list (such as `AC-1: …` → `{ ref, text }`) reads back the parsed values, and a
 * plain or `"checkbox"` list reads back `ListItem`s. `node.items` is unchanged. `Infer` types the
 * items as `ListView<Item>`. At run time each is `unknown`.
 */
function listView(node: Extract<BlockNode, { kind: 'list' }>, values: ParsedValues): ListView {
  const items: unknown[] = node.items.map((raw, i) => {
    const typed = values.item(node, i)
    return typed !== undefined ? typed : raw
  })
  const view: ListView = {
    kind: 'list',
    ordered: node.ordered,
    items: items as ListItem[],
    length: items.length,
    pos: node.pos,
    [Symbol.iterator](): Iterator<ListItem> {
      return items[Symbol.iterator]() as Iterator<ListItem>
    },
  }
  return view
}

/** A `CodeView` for a code block. */
function codeView(node: Extract<BlockNode, { kind: 'code' }>): CodeView {
  return { kind: 'code', lang: node.lang, value: node.value, pos: node.pos }
}

/** A `ParagraphView` for a paragraph block. */
function paragraphView(node: Extract<BlockNode, { kind: 'paragraph' }>): ParagraphView {
  return { kind: 'paragraph', text: node.text, pos: node.pos }
}

/** The `BlockView` for a `BlockNode`. */
function blockView(node: BlockNode, values: ParsedValues): BlockView {
  switch (node.kind) {
    case 'table':
      return tableView(node, values)
    case 'list':
      return listView(node, values)
    case 'code':
      return codeView(node)
    case 'paragraph':
      return paragraphView(node)
  }
}

// ── SectionNode → SectionView ─────────────────────────────────────────────────────

/** A section's own prose followed by the prose of every subsection below it. */
function subtreeText(node: SectionNode): string {
  const parts: string[] = [ownProse(node)]
  for (const child of node.sections) parts.push(subtreeText(child))
  return parts.filter((p) => p.length > 0).join('\n\n')
}

/**
 * The text of a section's own paragraphs, joined by blank lines. Line breaks inside one
 * paragraph become single spaces.
 */
function ownProse(node: SectionNode): string {
  return node.blocks
    .filter((b): b is Extract<BlockNode, { kind: 'paragraph' }> => b.kind === 'paragraph')
    .map((b) => unwrapSoftBreaks(b.text))
    .join('\n\n')
}

/** Replaces each line break inside a paragraph, with the spaces around it, by one space. */
function unwrapSoftBreaks(text: string): string {
  return text.replace(/[ \t]*\n[ \t]*/g, ' ')
}

/**
 * Every `^block-id` of a section: the section's own anchors (`node.anchors`), then each of its
 * blocks' anchors (`block.anchor`). Subsection ids are not included. Read them through
 * `.sections`.
 */
function sectionAnchors(node: SectionNode): string[] {
  const ids = node.anchors.slice()
  for (const b of node.blocks) if (b.anchor !== undefined) ids.push(b.anchor)
  return ids
}

/**
 * Builds a `SectionView` for one `SectionNode`. `opts` is the section's declared `SectionOpts`,
 * if any. Its `children` grammar sorts the nested `sections`, and each table in a `content`
 * record of `^anchor`-bound leaves becomes a named field on the view.
 */
function sectionView(
  node: SectionNode,
  opts: SectionOpts | undefined,
  values: ParsedValues,
): SectionView {
  const tables = node.blocks
    .filter((b): b is Extract<BlockNode, { kind: 'table' }> => b.kind === 'table')
    .map((b) => tableView(b, values))
  const lists = node.blocks
    .filter((b): b is Extract<BlockNode, { kind: 'list' }> => b.kind === 'list')
    .map((b) => listView(b, values))

  const view: SectionView = {
    name: node.name,
    pos: node.pos,
    // Includes block anchors. A `^id` at the end of the section's prose binds to that paragraph,
    // not to `node.anchors`, but it is still one of the section's ids.
    anchors: sectionAnchors(node),
    text(scope: 'prose' | 'all' = 'prose'): string {
      return scope === 'all' ? subtreeText(node) : ownProse(node)
    },
    tables,
    lists,
    byAnchor(id: string): BlockView | undefined {
      const block = node.blocks.find((b) => b.anchor === id)
      return block ? blockView(block, values) : undefined
    },
    // The same kind of group as `doc.body`, sorted by this section's `children` grammar.
    sections: sectionGroup(node.sections, opts?.children, values),
  }
  // Set only when there is exactly one table. Its rows are not typed, because the type would
  // then depend on how many tables the section has.
  if (tables.length === 1 && tables[0] !== undefined) view.table = tables[0]

  // Each table in a `content` record becomes a field on the view, such as
  // `doc.body.decision.components`. Its value is the `TableView` of the block whose anchor is the
  // record key. The structure and content planes pick each named leaf's block the same way
  // (`pickBlock` in `slots.ts`), so the model exposes exactly the block they checked.
  if (opts?.content !== undefined && !isLeafSpec(opts.content)) {
    for (const [fieldName, leaf] of Object.entries(opts.content)) {
      if (leaf.kind !== 'table') continue
      const block = pickBlock(node, fieldName)
      if (block && block.kind === 'table' && !Object.hasOwn(view, fieldName)) {
        ;(view as unknown as Record<string, TableView>)[fieldName] = tableView(block, values)
      }
    }
  }
  return view
}

// ── SectionNode[] to SectionGroup ──────────────────────

/**
 * Builds the `SectionGroup` for a list of sibling sections, sorted by the level's grammar `seq`:
 *   - A section that fills a declared slot gets two keys, its exact heading text and its
 *     lowerCamelCase form, both for the same value. These are the only enumerable keys. A
 *     duplicate of a filled slot (`structure/duplicate-section`) gets none.
 *   - A section that matches no slot goes in `unknown`, in document order. `.section(name)` also
 *     finds it. It gets no key.
 *   - `unknown` and `section` are not enumerable, so a group with no declared sections present
 *     deep-equals `{}`.
 *
 * A declared section that is absent has no key, so it reads as `undefined`.
 */
function sectionGroup(
  nodes: SectionNode[],
  seq: SectionSeq | undefined,
  values: ParsedValues,
): SectionGroup {
  const slots = slotsOf(seq?.specs ?? [])

  // Build each section's view and sort it into declared or unknown, in document order, with
  // the slot resolver the structure and content planes use (`bindSlots`). A declared key's
  // value is the `SectionView`, except when the section's `content` is one `table(...)` leaf.
  // Then the value is that table's `TableView`. `.section(name)` always returns the
  // `SectionView`.
  //
  // Only a section that fills its slot gets a key: every occurrence of a repeatable slot, else
  // the first section of the slot by any spelling. A repeatable slot's value is an array of
  // every occurrence's value, in document order. The first occurrence sets the key's position.
  const declaredKeyed: DeclaredEntry[] = []
  // A repeatable slot's index → index into declaredKeyed, so every spelling of the slot joins
  // one array, as the structure plane counts them.
  const repeatAt = new Map<number, number>()
  const unknown: SectionView[] = []
  // Exact heading → SectionView, for every section (declared and unknown), for `.section(name)`.
  const byExact = new Map<string, SectionView>()
  for (const { node, slotIdx, fills } of bindSlots(nodes, slots)) {
    const slot = slotIdx === null ? undefined : slots[slotIdx]
    const opts = slot?.opts
    const view = sectionView(node, opts, values)
    if (!byExact.has(view.name)) byExact.set(view.name, view) // first occurrence wins
    if (slotIdx === null || !slot) {
      unknown.push(view)
      continue
    }
    // A duplicate of a filled slot (structure/duplicate-section) gets no key.
    if (!fills) continue
    const element: SectionElement = promotedTable(node, view, opts) ?? view
    bindDeclaredElement(declaredKeyed, repeatAt, slotIdx, slot, node.name, element)
  }

  // A plain object, so its only enumerable keys are the section keys added below.
  const group = {} as SectionGroup

  // `unknown` and `.section()` are not enumerable, so an empty group is `toEqual({})`.
  Object.defineProperty(group, 'unknown', {
    value: unknown,
    enumerable: false,
    writable: false,
    configurable: true,
  })
  Object.defineProperty(group, 'section', {
    value: (name: string): SectionView | undefined => byExact.get(name),
    enumerable: false,
    writable: false,
    configurable: true,
  })

  // The enumerable keys: exact heading text and lowerCamelCase form, for declared sections that
  // are present. The first one wins. A camelCase key never replaces `unknown`, `section`, an
  // exact-heading key or an earlier camelCase key. The structure plane reports collisions.
  for (const { names, value } of declaredKeyed) {
    // A repeatable slot's value is `(SectionView | TableView)[]`, which the index signature does
    // not list, so cast to the signature's value type.
    const bound = value as SectionGroup[string]
    for (const name of names) {
      // `Object.hasOwn`, not `in`: `in` sees `Object.prototype`, so a heading such as
      // `Constructor` (key `constructor`) or `To String` would never be bound.
      if (!Object.hasOwn(group, name)) group[name] = bound
      const key = toCamelKey(name)
      if (key !== '' && key !== name && !Object.hasOwn(group, key)) group[key] = bound
    }
  }

  return group
}

/** The value of a declared section's key: its `SectionView`, or its table's `TableView`. */
type SectionElement = SectionView | TableView

/** A declared slot's value, and the headings (in first-seen order) it is bound under. */
interface DeclaredEntry {
  names: string[]
  value: SectionElement | SectionElement[]
}

/**
 * Adds `element`, seen under heading `name`. A repeatable slot collects its occurrences in one
 * array, placed where the first occurrence is, and bound under each spelling seen. Any other slot
 * gets the single value.
 */
function bindDeclaredElement(
  declaredKeyed: DeclaredEntry[],
  repeatAt: Map<number, number>,
  slotIdx: number,
  slot: Slot,
  name: string,
  element: SectionElement,
): void {
  if (!slot.repeatable) {
    declaredKeyed.push({ names: [name], value: element })
    return
  }
  const at = repeatAt.get(slotIdx)
  if (at === undefined) {
    repeatAt.set(slotIdx, declaredKeyed.length)
    declaredKeyed.push({ names: [name], value: [element] })
  } else {
    const entry = declaredKeyed[at]!
    ;(entry.value as SectionElement[]).push(element)
    if (!entry.names.includes(name)) entry.names.push(name)
  }
}

/**
 * The `TableView` a section's key returns instead of the `SectionView`, or `undefined`. This
 * applies when the section's `content` is one `table(...)` leaf and the block that leaf checks
 * (`pickBlock`: the section's first block) is a table, so the key holds the table the content
 * plane validated, whatever other tables follow it.
 */
function promotedTable(
  node: SectionNode,
  view: SectionView,
  opts: SectionOpts | undefined,
): TableView | undefined {
  if (!opts || opts.content === undefined) return undefined
  if (!isLeafSpec(opts.content) || opts.content.kind !== 'table') return undefined
  // The first block is a table, so it is the first of `view.tables`.
  return pickBlock(node, undefined)?.kind === 'table' ? view.tables[0] : undefined
}

// ── Entry point ─────────────────────────────────────────────────────────────────

/**
 * Builds the typed model of a document. `frontmatter` is the schema's output from `values`, or
 * the parsed YAML when there is none. `body` is the group of top-level sections, sorted by
 * `def.body`. `byAnchor` finds a `^anchor` anywhere in the document, including under the H1
 * before the first section.
 */
export function buildModel<F, B>(
  tree: DocTree,
  def: ContractDef<F, B>,
  _ctx: ValidateCtx,
  values: ParsedValues = createParsedValues(),
): Doc<F, B> {
  const frontmatter = (
    values.frontmatter !== undefined ? values.frontmatter.data : tree.frontmatter?.data
  ) as F
  const body = sectionGroup(
    tree.root.sections,
    def.body as SectionSeq | undefined,
    values,
  ) as unknown as B

  return {
    frontmatter,
    body,
    byAnchor(id: string): BlockView | undefined {
      return findAnchor([tree.root], id, values)
    },
    inlineSpans(row: Record<string, string>, col: string): InlineSpan[] {
      // Find the table that holds `row`: by identity for a row a `TableView` handed out, else
      // by comparing content. Then return that cell's inline code spans.
      const hit = rowOrigin.get(row) ?? tableForRow([tree.root], row)
      if (!hit) return []
      const ci = hit.node.columns.indexOf(col)
      if (ci < 0) return []
      return hit.node.inlineSpans(hit.ri, ci)
    },
  }
}

/** Searches the section tree, depth first, for a block with anchor `id`. */
function findAnchor(nodes: SectionNode[], id: string, values: ParsedValues): BlockView | undefined {
  for (const node of nodes) {
    const block = node.blocks.find((b) => b.anchor === id)
    if (block) return blockView(block, values)
    const nested = findAnchor(node.sections, id, values)
    if (nested) return nested
  }
  return undefined
}

/**
 * Finds the table block, and the body row index, that hold a row record. Searches depth first.
 * `Doc.inlineSpans` uses it for a record no `TableView` handed out (such as a copy of a row), so
 * this builds each row from the raw cell strings and compares. The first match wins. A row whose
 * cells a schema transformed does not match.
 */
function tableForRow(
  nodes: SectionNode[],
  row: Record<string, string>,
): { node: TableBlock; ri: number } | undefined {
  for (const node of nodes) {
    for (const b of node.blocks) {
      if (b.kind !== 'table') continue
      const ri = rowIndexOf(b, row)
      if (ri >= 0) return { node: b, ri }
    }
    const nested = tableForRow(node.sections, row)
    if (nested) return nested
  }
  return undefined
}

/** The index of the body row whose cells equal `target`, or `-1`. */
function rowIndexOf(node: TableBlock, target: Record<string, string>): number {
  const keys = Object.keys(target)
  for (let ri = 0; ri < node.rows.length; ri++) {
    const cells = node.rows[ri]
    if (!cells) continue
    const built: Record<string, string> = {}
    node.columns.forEach((c, i) => {
      built[c] = cells[i] ?? ''
    })
    if (recordEqual(built, target, keys)) return ri
  }
  return -1
}

/** True when `a` has exactly `keys` and matches `b` on each of them. */
function recordEqual(
  a: Record<string, string>,
  b: Record<string, string>,
  keys: string[],
): boolean {
  if (Object.keys(a).length !== keys.length) return false
  for (const k of keys) if (a[k] !== b[k]) return false
  return true
}
