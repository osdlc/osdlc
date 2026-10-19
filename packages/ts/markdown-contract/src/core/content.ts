/**
 * The content plane — Zod leaves over projected blocks.
 *
 * `matchContent(tree, def, ctx)` runs AFTER the structure plane. It walks the SAME body
 * grammar the structure plane walks, finds each declared section's `content` leaf and the
 * block that fills it, and validates that block's DATA — columns, row count, cell values,
 * list-item shape, code language, paragraph word count. Presence and kind are the structure
 * plane's kind-gate, so
 * this plane never re-reports `structure/block-missing` / `structure/block-kind`:
 *
 *   - the content leaf runs only when a block of the expected kind is present; a
 *     wrong-kind or absent block defers to the structure plane's finding.
 *
 * Cell-level table findings localize to the offending row via `node.rowPos(i)`, and
 * frontmatter findings remap the Zod issue path to its key's source line via
 * `tree.frontmatter.lineForPath(path)`. The leaf config is read off `LeafSpec.config`
 * (stashed inert by the `leaves.ts` builders); raw `z.*` may ride inside a leaf (e.g. a
 * table's typed `cells`).
 *
 * Hints: the walk threads the nearest enclosing authored `description` (leaf config →
 * section opts → ancestor levels → contract root) and stamps it on each finding as `hint`.
 * Frontmatter findings resolve the failing field's `.describe()` text by walking the compiled
 * Zod shape along the issue path, falling back to the contract-root description. A
 * description-free contract mints byte-identical findings (no `hint` key).
 */
import type { ZodType } from 'zod'

import type { ParsedValues } from './parsed-values.js'
import { frontmatterYamlErrors } from './projection.js'
import { withHint } from './registry.js'
import { leafHintOf } from './structure.js'
import type {
  BlockNode,
  ContractDef,
  Ctx,
  DocTree,
  Finding,
  GapSpec,
  LeafSpec,
  OneOfSpec,
  OptionalSpec,
  SectionNode,
  SectionOpts,
  SectionSeq,
  SectionSpec,
  SourcePos,
  Spec,
} from './types.js'

// ── The runtime shape of a Zod schema, as this module reads it ──

/** A Zod issue, narrowed to the fields the remap and the message builder need. */
interface ZodIssue {
  path: (string | number)[]
  code: string
  message?: string
  keys?: string[]
  /** `invalid_type`: the expected JS type, e.g. "string" (zod v4 drops `received`). */
  expected?: string
  /** `invalid_value`: the allowed value(s) — one entry for a literal, many for an enum. */
  values?: unknown[]
  /** `invalid_format`: the string format that failed, e.g. "regex" / "date" / "email". */
  format?: string
}

/** The runtime face of a zod schema: `safeParse` plus the parsed `data` / issue stream. */
interface RuntimeZod {
  safeParse(value: unknown): { success: boolean; data?: unknown; error?: { issues: ZodIssue[] } }
}

/** View a zod schema through the narrow shape this module reads. */
function asZod(schema: ZodType): RuntimeZod {
  return schema as unknown as RuntimeZod
}

// ── Leaf config shapes (the inert `LeafSpec.config` the builders stash) ───────────

interface TableConfig {
  columns: string[]
  anchor?: string
  minRows?: number
  cells?: Record<string, ZodType>
  extraColumns?: 'ignore' | 'error'
}
interface ListConfig {
  ordered?: boolean
  everyItem?: 'checkbox' | ZodType
  minItems?: number
}
interface CodeConfig {
  lang?: string
}
interface MaxWordsConfig {
  maxWords: number
}

// ── Spec walking (mirrors the structure plane's slot resolution) ──────────────────

/** A declared section slot carrying content, after `optional(...)` is unwrapped. */
interface ContentSlot {
  names: string[]
  opts: SectionOpts
}

/** Unwrap `optional(spec)` to its inner spec. */
function innerOf(spec: Spec): SectionSpec | OneOfSpec | GapSpec {
  if (spec.kind === 'optional') return innerOf((spec as OptionalSpec).spec)
  return spec
}

/** The section/oneOf slots at one level that carry a `SectionOpts` (content / children). */
function contentSlots(specs: readonly Spec[]): ContentSlot[] {
  const slots: ContentSlot[] = []
  for (const spec of specs) {
    const inner = innerOf(spec)
    if (inner.kind === 'section') {
      const s = inner as SectionSpec
      if (s.opts) slots.push({ names: s.names, opts: s.opts })
    } else if (inner.kind === 'oneOf') {
      const o = inner as OneOfSpec
      if (o.opts) slots.push({ names: o.names, opts: o.opts })
    }
  }
  return slots
}

/**
 * The doc sections at this level that fill a slot: every occurrence of a repeatable slot, else
 * the first one (a second occurrence is the structure plane's `duplicate-section`).
 */
function sectionsFor(nodes: SectionNode[], slot: ContentSlot): SectionNode[] {
  const hits = nodes.filter((n) => slot.names.includes(n.name))
  return slot.opts.repeatable === true ? hits : hits.slice(0, 1)
}

/**
 * Walk one level: pair each content slot with the doc section filling it, validate that
 * section's content leaf(s), then recurse into declared children. `inheritedHint` is the
 * nearest enclosing description above this level.
 */
function matchLevel(
  nodes: SectionNode[],
  seq: SectionSeq,
  ctx: Ctx,
  out: Finding[],
  values: ParsedValues,
  inheritedHint?: string,
): void {
  const levelHint = seq.opts.description ?? inheritedHint
  for (const slot of contentSlots(seq.specs)) {
    // An absent section is the structure plane's concern (structure/section-missing).
    for (const node of sectionsFor(nodes, slot)) {
      const sectionHint = slot.opts.description ?? levelHint
      validateSectionContent(node, slot.opts, ctx, out, values, sectionHint)
      if (slot.opts.children) {
        matchLevel(node.sections, slot.opts.children, ctx, out, values, sectionHint)
      }
    }
  }
}

/** Validate a section's content leaf(s): a single leaf, or named leaves bound by `^anchor`. */
function validateSectionContent(
  node: SectionNode,
  opts: SectionOpts,
  ctx: Ctx,
  out: Finding[],
  values: ParsedValues,
  sectionHint?: string,
): void {
  if (opts.content === undefined) return
  if (isLeafSpec(opts.content)) {
    validateLeaf(node, opts.content, undefined, ctx, out, values, sectionHint)
  } else {
    for (const [anchor, leaf] of Object.entries(opts.content)) {
      validateLeaf(node, leaf, anchor, ctx, out, values, sectionHint)
    }
  }
}

/** Structural guard: a single `LeafSpec` vs a `Record<string, LeafSpec>`. */
function isLeafSpec(c: LeafSpec | Record<string, LeafSpec>): c is LeafSpec {
  return typeof (c as LeafSpec).kind === 'string'
}

/**
 * The block a content slot addresses: when `anchor` is set, the block carrying that anchor;
 * otherwise the section's first block (a single-leaf slot owns the section's sole block).
 */
function pickBlock(node: SectionNode, anchor: string | undefined): BlockNode | null {
  if (anchor !== undefined) return node.blocks.find((b) => b.anchor === anchor) ?? null
  return node.blocks[0] ?? null
}

/**
 * Validate one leaf against the block that fills it. The leaf runs ONLY when a block of the
 * expected kind is present: an absent block (→ `structure/block-missing`) or a
 * wrong-kind block (→ `structure/block-kind`) is the structure plane's to report, so the
 * content plane stays silent and never double-reports.
 */
function validateLeaf(
  node: SectionNode,
  leaf: LeafSpec,
  anchor: string | undefined,
  baseCtx: Ctx,
  out: Finding[],
  values: ParsedValues,
  sectionHint?: string,
): void {
  const block = pickBlock(node, anchor)
  if (!block) return // structure/block-missing
  if (block.kind !== leaf.kind) return // structure/block-kind

  // The leaf's effective hint: its config's authored description, else the section's.
  const ctx = withHint(baseCtx, leafHintOf(leaf, sectionHint))

  switch (leaf.kind) {
    case 'table':
      validateTable(
        block as Extract<BlockNode, { kind: 'table' }>,
        leaf.config as TableConfig,
        ctx,
        out,
        values,
      )
      break
    case 'list':
      validateList(
        block as Extract<BlockNode, { kind: 'list' }>,
        leaf.config as ListConfig,
        ctx,
        out,
        values,
      )
      break
    case 'code':
      validateCode(
        block as Extract<BlockNode, { kind: 'code' }>,
        leaf.config as CodeConfig,
        ctx,
        out,
      )
      break
    case 'paragraph':
      validateParagraph(
        block as Extract<BlockNode, { kind: 'paragraph' }>,
        leaf.config as MaxWordsConfig,
        ctx,
        out,
      )
      break
  }
}

// ── Table ─────────────────────────────────────────────────────────────────────────

/**
 * Validate a `table` block's data:
 *   - every declared column present in `node.columns`     → `content/table/column-missing`
 *   - `extraColumns: "error"` for each undeclared column  → `content/table/column-extra`
 *   - `minRows`                                            → `content/table/min-rows`
 *   - typed `cells` over each row's value, localized to    → `content/table/cell`
 *     the offending row via `node.rowPos(i)`
 * Each is independent; a table can fire several. Column / row-count findings pin the table's
 * header position; cell findings pin the offending row.
 */
function validateTable(
  node: Extract<BlockNode, { kind: 'table' }>,
  cfg: TableConfig,
  ctx: Ctx,
  out: Finding[],
  values: ParsedValues,
): void {
  checkTableColumns(node, cfg, ctx, out)
  checkTableMinRows(node, cfg, ctx, out)
  checkTableCells(node, cfg, ctx, out, values)
}

/** Missing declared columns and (when `extraColumns: "error"`) undeclared columns. */
function checkTableColumns(
  node: Extract<BlockNode, { kind: 'table' }>,
  cfg: TableConfig,
  ctx: Ctx,
  out: Finding[],
): void {
  // Declared columns must all be present (one finding per missing column).
  for (const col of cfg.columns) {
    if (!node.columns.includes(col)) {
      out.push(
        ctx.finding({
          id: 'content/table/column-missing',
          message: `table is missing declared column ‘${col}’`,
          pos: node.pos,
        }),
      )
    }
  }

  // Extra (undeclared) columns, when locked with extraColumns: "error".
  if (cfg.extraColumns === 'error') {
    for (const col of node.columns) {
      if (!cfg.columns.includes(col)) {
        out.push(
          ctx.finding({
            id: 'content/table/column-extra',
            message: `table carries undeclared column ‘${col}’`,
            pos: node.pos,
          }),
        )
      }
    }
  }
}

/** Row-count floor → `content/table/min-rows`. */
function checkTableMinRows(
  node: Extract<BlockNode, { kind: 'table' }>,
  cfg: TableConfig,
  ctx: Ctx,
  out: Finding[],
): void {
  if (cfg.minRows !== undefined && node.rows.length < cfg.minRows) {
    out.push(
      ctx.finding({
        id: 'content/table/min-rows',
        message: `table has ${node.rows.length} rows; expected at least ${cfg.minRows}`,
        pos: node.pos,
      }),
    )
  }
}

/** Typed cells — run each declared cell schema over every row's value in that column. */
function checkTableCells(
  node: Extract<BlockNode, { kind: 'table' }>,
  cfg: TableConfig,
  ctx: Ctx,
  out: Finding[],
  values: ParsedValues,
): void {
  if (!cfg.cells) return
  for (const [col, schema] of Object.entries(cfg.cells)) {
    const colIdx = node.columns.indexOf(col)
    if (colIdx === -1) continue // a declared cell on a missing column → column-missing covers it
    const zod = asZod(schema)
    node.rows.forEach((row, i) => {
      const value = row[colIdx] ?? ''
      const res = zod.safeParse(value)
      if (res.success) {
        // Keep the parsed output for the typed model, from this same `safeParse`.
        values.setCell(node, i, col, res.data)
      } else {
        out.push(
          ctx.finding({
            id: 'content/table/cell',
            message: `cell ‘${value}’ in column ‘${col}’ is invalid`,
            pos: node.rowPos(i), // localize to the offending row
          }),
        )
      }
    })
  }
}

// ── List ────────────────────────────────────────────────────────────────────────

/**
 * Validate a `list` block's data:
 *   - `everyItem: "checkbox"`  → every item carries `checked`, else `content/list/item-kind`
 *                                 per offending item (pinned to the item's source line)
 *   - `everyItem: ZodType`     → run the schema over each item's `text` → `content/list/item-kind`
 *   - `minItems`               → item-count floor → `content/list/min-items`
 */
function validateList(
  node: Extract<BlockNode, { kind: 'list' }>,
  cfg: ListConfig,
  ctx: Ctx,
  out: Finding[],
  values: ParsedValues,
): void {
  if (cfg.everyItem === 'checkbox') {
    for (const item of node.items) {
      if (item.checked === undefined) {
        out.push(
          ctx.finding({
            id: 'content/list/item-kind',
            message: 'list item is not a checkbox (‘- [ ]’ / ‘- [x]’)',
            pos: item.pos,
          }),
        )
      }
    }
  } else if (cfg.everyItem !== undefined) {
    const zod = asZod(cfg.everyItem)
    node.items.forEach((item, i) => {
      const res = zod.safeParse(item.text)
      if (res.success) {
        // Keep the parsed output for the typed model, from this same `safeParse`.
        values.setItem(node, i, res.data)
      } else {
        out.push(
          ctx.finding({
            id: 'content/list/item-kind',
            message: `list item ‘${item.text}’ is invalid`,
            pos: item.pos,
          }),
        )
      }
    })
  }

  if (cfg.minItems !== undefined && node.items.length < cfg.minItems) {
    out.push(
      ctx.finding({
        id: 'content/list/min-items',
        message: `list has ${node.items.length} items; expected at least ${cfg.minItems}`,
        pos: node.pos,
      }),
    )
  }
}

// ── Code ───────────────────────────────────────────────────────────────────────

/** Validate a `code` block's language matches the declared `lang` → `content/code/lang`. */
function validateCode(
  node: Extract<BlockNode, { kind: 'code' }>,
  cfg: CodeConfig,
  ctx: Ctx,
  out: Finding[],
): void {
  if (cfg.lang === undefined) return
  if (node.lang !== cfg.lang) {
    out.push(
      ctx.finding({
        id: 'content/code/lang',
        message: `code block language ‘${node.lang ?? '(none)'}’ does not match required ‘${cfg.lang}’`,
        pos: node.pos,
      }),
    )
  }
}

// ── Paragraph (maxWords) ──────────────────────────────────────────────────────────

/** Validate a `paragraph` block's word count ≤ `maxWords` → `content/max-words`. */
function validateParagraph(
  node: Extract<BlockNode, { kind: 'paragraph' }>,
  cfg: MaxWordsConfig,
  ctx: Ctx,
  out: Finding[],
): void {
  const words = node.text.split(/\s+/).filter((w) => w.length > 0).length
  if (words > cfg.maxWords) {
    out.push(
      ctx.finding({
        id: 'content/max-words',
        message: `paragraph runs to ${words} words; expected at most ${cfg.maxWords}`,
        pos: node.pos,
      }),
    )
  }
}

// ── Frontmatter ────────────────────────────────────────────────────────────────

/**
 * Map a Zod issue code to its frontmatter-plane finding id: `frontmatter/enum`,
 * `frontmatter/unknown-key`, `frontmatter/type`, `frontmatter/required` or `frontmatter/refine`.
 * Any other code falls back to `frontmatter/type`.
 */
function frontmatterIdFor(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_enum_value':
    case 'invalid_value': // zod v4 enum mismatch
      return 'frontmatter/enum'
    case 'unrecognized_keys':
      return 'frontmatter/unknown-key'
    case 'custom':
      // a `.refine()` / `.superRefine()` cross-field predicate.
      return 'frontmatter/refine'
    case 'invalid_type':
      // zod v4 reports a missing required key as invalid_type (received undefined).
      return 'frontmatter/type'
    default:
      return 'frontmatter/type'
  }
}

/** Render a Zod issue path as a readable key reference: `[]` → "", `["a","b"]` → "a.b", `["related",0]` → "related[0]". */
function formatKeyPath(path: (string | number)[]): string {
  let s = ''
  for (const seg of path) {
    if (typeof seg === 'number') s += `[${seg}]`
    else s += s === '' ? seg : `.${seg}`
  }
  return s
}

/** The JS type name of a value, for "(got number)" hints — distinguishing null and array from object. */
function typeName(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/** The value addressed by `path` within `data` (undefined when any segment is absent). */
function valueAt(data: unknown, path: (string | number)[]): unknown {
  let node: unknown = data
  for (const seg of path) {
    if (node === null || node === undefined || typeof node !== 'object') return undefined
    node = (node as Record<string | number, unknown>)[seg]
  }
  return node
}

/**
 * Build a field-qualified message for a frontmatter Zod issue. Zod's own message names a
 * type or a literal but never the offending key, so a report reads "expected string, received
 * undefined" with no clue which field is wrong. Every message here instead leads with the
 * field — `frontmatter field ‘<key>’ …` — so the report names exactly what to fix.
 *
 * `id` is the already-resolved finding id, so a missing-required key (an `invalid_type` whose
 * value is undefined) reads "is required" rather than "must be a string". `data` is the parsed
 * frontmatter, used to report the actual type on a wrong-type mismatch (zod v4 drops `received`).
 */
function frontmatterMessage(issue: ZodIssue, id: string, data: unknown): string {
  const field = formatKeyPath(issue.path)
  const at = field ? `frontmatter field ‘${field}’` : 'frontmatter'

  if (id === 'frontmatter/required') return `${at} is required`

  switch (issue.code) {
    case 'invalid_enum_value': // zod v3 enum mismatch
    case 'invalid_value':
      return invalidValueMessage(at, issue)
    case 'invalid_type':
      return invalidTypeMessage(at, issue, data)
    case 'invalid_format':
      return invalidFormatMessage(at, issue)
    case 'too_small':
      return `${at} is too small`
    case 'too_big':
      return `${at} is too large`
    case 'custom':
      return customMessage(at, field, issue)
    default:
      return unhandledMessage(at, field, issue)
  }
}

/** zod v4 literal/enum mismatch — `values` is the allowed set (one entry for a literal). */
function invalidValueMessage(at: string, issue: ZodIssue): string {
  const values = Array.isArray(issue.values) ? issue.values : []
  if (values.length === 1) return `${at} must be ‘${String(values[0])}’`
  if (values.length > 1)
    return `${at} must be one of ${values.map((v) => `‘${String(v)}’`).join(', ')}`
  return `${at} has an invalid value`
}

/** A wrong-type mismatch — name the expected type and the actual type (zod v4 drops `received`). */
function invalidTypeMessage(at: string, issue: ZodIssue, data: unknown): string {
  const got = typeName(valueAt(data, issue.path))
  return issue.expected
    ? `${at} must be a ${issue.expected} (got ${got})`
    : `${at} has the wrong type (got ${got})`
}

/** A `pattern` / `format` constraint — name the format, else "pattern". */
function invalidFormatMessage(at: string, issue: ZodIssue): string {
  return issue.format && issue.format !== 'regex'
    ? `${at} is not a valid ${issue.format}`
    : `${at} does not match the required pattern`
}

/**
 * A `.refine()` / `.superRefine()` predicate speaks its own rule — keep its message,
 * field-qualified when it addresses a key, verbatim when it is document-level.
 */
function customMessage(at: string, field: string, issue: ZodIssue): string {
  return field && issue.message ? `${at}: ${issue.message}` : (issue.message ?? `${at} is invalid`)
}

/** An unhandled Zod code: lead with the field but keep Zod's detail rather than discard it. */
function unhandledMessage(at: string, field: string, issue: ZodIssue): string {
  return field
    ? `${at}: ${issue.message ?? 'is invalid'}`
    : (issue.message ?? 'frontmatter is invalid')
}

/**
 * The (tiny) introspection face of a compiled zod v4 schema — just enough to walk an object
 * shape along a Zod issue path and read the `.describe()` text at each node. `description`
 * reads through zod's registry; `_zod.def` carries the wrapper (`innerType`), object (`shape`),
 * and array (`element`) structure.
 */
interface ZodIntrospect {
  description?: string
  _zod?: {
    def?: {
      innerType?: unknown
      shape?: Record<string, unknown>
      element?: unknown
    }
  }
}

/**
 * Unwrap a schema's optional/nullable/default wrapper chain, returning the innermost schema
 * and the outermost `.describe()` description seen anywhere on the chain (one logical node).
 */
function unwrapDescribed(start: unknown): { node: unknown; description?: string } {
  let node = start
  let description: string | undefined
  while (node !== null && typeof node === 'object') {
    const z = node as ZodIntrospect
    if (description === undefined && typeof z.description === 'string') {
      description = z.description
    }
    const inner = z._zod?.def?.innerType
    if (inner === undefined) break
    node = inner
  }
  return description === undefined ? { node } : { node, description }
}

/** Descend one issue-path segment: object `shape` by key, array `element` by numeric index. */
function descend(node: unknown, seg: string | number): unknown {
  if (node === null || typeof node !== 'object') return undefined
  const def = (node as ZodIntrospect)._zod?.def
  return typeof seg === 'number' ? def?.element : def?.shape?.[seg]
}

/**
 * The nearest `.describe()` description along a Zod issue path: walk the compiled
 * shape from the root, descending by each path segment and unwrapping wrappers as they
 * appear; the DEEPEST description reachable wins (nearest-enclosing). Returns `undefined`
 * when no node on the path carries one — the caller falls back to the contract-root
 * description.
 */
function zodHintAt(schema: ZodType, path: (string | number)[]): string | undefined {
  let hint: string | undefined
  let node: unknown = schema
  for (let i = 0; ; i++) {
    const unwrapped = unwrapDescribed(node)
    node = unwrapped.node
    if (unwrapped.description !== undefined) hint = unwrapped.description
    const seg = path[i]
    if (seg === undefined) break
    node = descend(node, seg)
    if (node === undefined) break
  }
  return hint
}

/**
 * Validate the document frontmatter against a declared Zod schema, remapping each Zod issue
 * to its key's source line via `tree.frontmatter.lineForPath(issue.path)`. When the
 * schema rejects an unrecognized key (a strict object), Zod reports one issue whose `keys`
 * list the offending keys; each is emitted as a `frontmatter/unknown-key` localized to that
 * key's line. A missing-required key surfaces as `frontmatter/required` (an `invalid_type`
 * whose received value is undefined). When no frontmatter block is present, the schema runs
 * over `{}` so required-key findings still fire. Each finding's `hint` is the failing field's
 * `.describe()` text (nearest along the issue path), else `rootHint`.
 */
function matchFrontmatter(
  tree: DocTree,
  schema: ZodType,
  ctx: Ctx,
  out: Finding[],
  values: ParsedValues,
  rootHint?: string,
): void {
  const data: unknown = tree.frontmatter ? tree.frontmatter.data : {}
  const res = asZod(schema).safeParse(data)
  if (res.success) {
    values.frontmatter = { data: res.data }
    return
  }
  if (!res.error) return

  const lineFor = (path: (string | number)[]): SourcePos | undefined => {
    const line = tree.frontmatter?.lineForPath(path)
    return line !== undefined ? { line } : undefined
  }
  const ctxFor = (path: (string | number)[]): Ctx =>
    withHint(ctx, zodHintAt(schema, path) ?? rootHint)

  for (const issue of res.error.issues) {
    // A strict-object rejection lists every offending key under `issue.keys`; each becomes its
    // own unknown-key finding. Anything else is a generic field issue.
    if (issue.code === 'unrecognized_keys' && Array.isArray(issue.keys)) {
      emitUnknownKeys(issue, lineFor, ctxFor(issue.path), out)
    } else {
      emitFrontmatterIssue(issue, data, lineFor, ctxFor(issue.path), out)
    }
  }
}

/** Whether a Zod issue path maps to a source position via the frontmatter CST. */
type LineForPath = (path: (string | number)[]) => SourcePos | undefined

/** Emit one `frontmatter/unknown-key` per offending key, each at that key's source line. */
function emitUnknownKeys(issue: ZodIssue, lineFor: LineForPath, ctx: Ctx, out: Finding[]): void {
  for (const key of issue.keys ?? []) {
    const pos = lineFor([...issue.path, key])
    out.push(
      ctx.finding({
        id: 'frontmatter/unknown-key',
        message: `unknown frontmatter key ‘${key}’`,
        ...(pos ? { pos } : {}),
      }),
    )
  }
}

/** Emit one finding for a generic frontmatter issue (required / type / enum / …), at its key's line. */
function emitFrontmatterIssue(
  issue: ZodIssue,
  data: unknown,
  lineFor: LineForPath,
  ctx: Ctx,
  out: Finding[],
): void {
  // A missing required key reads as an invalid_type whose input is undefined.
  const id =
    issue.code === 'invalid_type' && isMissingRequired(data, issue.path)
      ? 'frontmatter/required'
      : frontmatterIdFor(issue)

  const pos = lineFor(issue.path)
  out.push(
    ctx.finding({
      id,
      message: frontmatterMessage(issue, id, data),
      ...(pos ? { pos } : {}),
    }),
  )
}

/** Whether the value addressed by `path` is absent from `data` (a missing required key). */
function isMissingRequired(data: unknown, path: (string | number)[]): boolean {
  return valueAt(data, path) === undefined
}

// ── Public entry ─────────────────────────────────────────────────────────────────

/**
 * Emit one `frontmatter/yaml` finding per YAML error in the frontmatter block, at the error's
 * line. Returns whether the YAML is sound; the schema is not run over a broken block, since its
 * findings would only echo the syntax error.
 */
function checkFrontmatterYaml(tree: DocTree, ctx: Ctx, out: Finding[]): boolean {
  if (!tree.frontmatter) return true
  const errors = frontmatterYamlErrors(tree.frontmatter)
  for (const e of errors) {
    out.push(
      ctx.finding({
        id: 'frontmatter/yaml',
        message: `frontmatter is not valid YAML: ${e.message}`,
        pos: { line: e.line },
      }),
    )
  }
  return errors.length === 0
}

/**
 * Run the content plane: frontmatter Zod (if declared) plus every section's content leaf.
 * Returns findings in emission order; `validate()` applies the deterministic cross-plane sort.
 * The values the schemas parse (frontmatter, transformed cells and items) go into `values`, for
 * the typed model.
 */
export function matchContent(
  tree: DocTree,
  def: ContractDef,
  ctx: Ctx,
  values: ParsedValues,
): Finding[] {
  const out: Finding[] = []
  const yamlOk = checkFrontmatterYaml(tree, ctx, out)
  if (def.frontmatter !== undefined && yamlOk) {
    matchFrontmatter(tree, def.frontmatter, ctx, out, values, def.description)
  }
  if (def.body !== undefined) {
    matchLevel(tree.root.sections, def.body, ctx, out, values, def.description)
  }
  return out
}
