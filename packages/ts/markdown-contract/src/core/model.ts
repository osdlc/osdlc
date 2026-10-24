/**
 * The typed model: builds the `Doc` from a parse tree and a contract. `read()` and
 * `validate().doc` return it, and `docRule` rules receive it. The checks never read it. Their
 * findings come from the parse tree, the Zod schemas and the grammar.
 *
 * At each level the model reads `def.body` to tell declared sections from undeclared ones (those
 * a `gap()` or `allowUnknown` allows). A declared section that is present gets two keys on the
 * `SectionGroup`: its exact heading text and its lowerCamelCase form. `.section(name)` also
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
import type {
  BlockNode,
  BlockView,
  CodeView,
  ContractDef,
  Doc,
  DocTree,
  GapSpec,
  InlineSpan,
  LeafSpec,
  ListItem,
  ListView,
  OneOfSpec,
  OptionalSpec,
  ParagraphView,
  SectionGroup,
  SectionNode,
  SectionOpts,
  SectionSeq,
  SectionSpec,
  SectionView,
  Spec,
  TableView,
  ValidateCtx,
} from './types.js'

/** A table `BlockNode`. */
type TableBlock = Extract<BlockNode, { kind: 'table' }>

// ── BlockNode to BlockView ──────────

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

// ── The declared names of a level ──────────────────────────

/** Unwraps `optional(spec)` to the spec inside it. */
function unwrapInner(spec: Spec): SectionSpec | OneOfSpec | GapSpec {
  return spec.kind === 'optional' ? unwrapInner((spec as OptionalSpec).spec) : spec
}

/**
 * Every spelling of every `section` and `oneOf` slot in a level's grammar. Used to sort a
 * level's sections into declared ones (which get keys) and undeclared ones (in `unknown`).
 */
function declaredNames(seq: SectionSeq | undefined): Set<string> {
  const names = new Set<string>()
  if (!seq) return names
  for (const spec of seq.specs) {
    const inner = unwrapInner(spec)
    if (inner.kind === 'section') for (const n of (inner as SectionSpec).names) names.add(n)
    else if (inner.kind === 'oneOf') for (const n of (inner as OneOfSpec).names) names.add(n)
  }
  return names
}

/** The declared `SectionOpts` for a heading at this level. */
function optsFor(seq: SectionSeq | undefined, name: string): SectionOpts | undefined {
  if (!seq) return undefined
  for (const spec of seq.specs) {
    const inner = unwrapInner(spec)
    if (inner.kind === 'section' && (inner as SectionSpec).names.includes(name)) {
      return (inner as SectionSpec).opts
    }
    if (inner.kind === 'oneOf' && (inner as OneOfSpec).names.includes(name)) {
      return (inner as OneOfSpec).opts
    }
  }
  return undefined
}

/** True for a single `LeafSpec`, false for a `Record<string, LeafSpec>`. */
function isLeafSpec(c: LeafSpec | Record<string, LeafSpec>): c is LeafSpec {
  return typeof (c as LeafSpec).kind === 'string'
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
  // `doc.body.decision.components`. Its value is the `TableView` of the block with that anchor.
  if (opts?.content !== undefined && !isLeafSpec(opts.content)) {
    for (const [fieldName, leaf] of Object.entries(opts.content)) {
      if (leaf.kind !== 'table') continue
      const anchor = (leaf.config as { anchor?: string } | undefined)?.anchor
      const block = anchor ? node.blocks.find((b) => b.anchor === anchor) : undefined
      if (block && block.kind === 'table' && !(fieldName in view)) {
        ;(view as unknown as Record<string, TableView>)[fieldName] = tableView(block, values)
      }
    }
  }
  return view
}

// ── SectionNode[] to SectionGroup ──────────────────────

/**
 * Builds the `SectionGroup` for a list of sibling sections, sorted by the level's grammar `seq`:
 *   - A section whose heading matches a declared slot gets two keys, its exact heading text and
 *     its lowerCamelCase form, both for the same value. These are the only enumerable keys.
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
  const declared = declaredNames(seq)

  // Build each section's view and sort it into declared or unknown, in document order. A
  // declared key's value is the `SectionView`, except when the section's `content` is one
  // `table(...)` leaf. Then the value is that table's `TableView`. `.section(name)` always
  // returns the `SectionView`.
  //
  // A repeatable slot's value is an array of every occurrence's value, in document order. The
  // first occurrence sets the key's position. A slot that is not repeatable has a single value.
  const declaredKeyed: { name: string; value: SectionElement | SectionElement[] }[] = []
  const repeatAt = new Map<string, number>() // exact heading name → index into declaredKeyed
  const unknown: SectionView[] = []
  // Exact heading → SectionView, for every section (declared and unknown), for `.section(name)`.
  const byExact = new Map<string, SectionView>()
  for (const node of nodes) {
    const opts = optsFor(seq, node.name)
    const view = sectionView(node, opts, values)
    if (!byExact.has(view.name)) byExact.set(view.name, view) // first occurrence wins
    if (!declared.has(node.name)) {
      unknown.push(view)
      continue
    }
    const element: SectionElement = promotedTable(view, opts) ?? view
    bindDeclaredElement(declaredKeyed, repeatAt, node.name, element, opts?.repeatable === true)
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
  for (const { name, value } of declaredKeyed) {
    // A repeatable slot's value is `(SectionView | TableView)[]`, which the index signature does
    // not list, so cast to the signature's value type.
    const bound = value as SectionGroup[string]
    if (!(name in group)) group[name] = bound
    const key = toCamelKey(name)
    if (key !== '' && key !== name && !(key in group)) group[key] = bound
  }

  return group
}

/** The value of a declared section's key: its `SectionView`, or its table's `TableView`. */
type SectionElement = SectionView | TableView

/**
 * Adds `element` under `name`. A repeatable slot collects its occurrences in one array, placed
 * where the first occurrence is. Any other slot gets the single value.
 */
function bindDeclaredElement(
  declaredKeyed: { name: string; value: SectionElement | SectionElement[] }[],
  repeatAt: Map<string, number>,
  name: string,
  element: SectionElement,
  repeatable: boolean,
): void {
  if (!repeatable) {
    declaredKeyed.push({ name, value: element })
    return
  }
  const at = repeatAt.get(name)
  if (at === undefined) {
    repeatAt.set(name, declaredKeyed.length)
    declaredKeyed.push({ name, value: [element] })
  } else {
    ;(declaredKeyed[at]!.value as SectionElement[]).push(element)
  }
}

/**
 * The `TableView` a section's key returns instead of the `SectionView`, or `undefined`. This
 * applies when the section's `content` is one `table(...)` leaf and the section holds exactly
 * one table.
 */
function promotedTable(view: SectionView, opts: SectionOpts | undefined): TableView | undefined {
  if (!opts || opts.content === undefined) return undefined
  if (!isLeafSpec(opts.content) || opts.content.kind !== 'table') return undefined
  return view.table
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
      // Find the table that holds `row`, by comparing content, since the doc has no table view
      // to search with `indexOf`. Then return that cell's inline code spans.
      const hit = tableForRow([tree.root], row)
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
 * `Doc.inlineSpans` gets a plain `Record<string, string>` (such as `files.rows[0]`) with no link
 * to its table, so this builds each row from the raw cell strings and compares. The first match
 * wins. A row whose cells a schema transformed does not match.
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
