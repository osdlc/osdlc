/**
 * The content plane: the frontmatter schema and the content leaves.
 *
 * `matchContent(tree, def, ctx)` runs after the structure plane. It walks the same body grammar,
 * finds each declared section's `content` leaf and the block that fills it, and checks that
 * block's data: columns, row count, cell values, list items, code language and paragraph word
 * count. A leaf is checked only when a block of the right kind is present. A missing or
 * wrong-kind block is reported by the structure plane (`structure/block-missing`,
 * `structure/block-kind`), so this plane does not report it again.
 *
 * A table cell finding is placed on its row (`node.rowPos(i)`). A frontmatter finding is placed
 * on its key's line (`tree.frontmatter.lineForPath(path)`). The leaf options come from
 * `LeafSpec.config`, as the builders in `leaves.ts` store them. They may hold Zod schemas, such
 * as a table's `cells`.
 *
 * Hints: each finding carries as `hint` the nearest `description` (leaf, section, parent levels,
 * then the contract). A frontmatter finding uses the failing field's `.describe()` text, found by
 * walking the Zod schema along the issue path, else the contract's description. A contract with
 * no descriptions gives findings with no `hint` key.
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

/** A Zod issue, with only the fields this module reads. */
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

/** The part of a Zod schema this module calls: `safeParse`. */
interface RuntimeZod {
  safeParse(value: unknown): { success: boolean; data?: unknown; error?: { issues: ZodIssue[] } }
}

/** Casts a Zod schema to `RuntimeZod`. */
function asZod(schema: ZodType): RuntimeZod {
  return schema as unknown as RuntimeZod
}

// ── Leaf options (`LeafSpec.config`, as the builders store them) ───────────

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

// ── Walking the specs (matches how the structure plane finds slots) ──────────────────

/** A declared section slot with options, after `optional(...)` is unwrapped. */
interface ContentSlot {
  names: string[]
  opts: SectionOpts
}

/** Unwraps `optional(spec)` to the spec inside it. */
function innerOf(spec: Spec): SectionSpec | OneOfSpec | GapSpec {
  if (spec.kind === 'optional') return innerOf((spec as OptionalSpec).spec)
  return spec
}

/** The `section` and `oneOf` slots at one level that have options (content or children). */
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
 * The sections at this level that fill a slot: every occurrence for a repeatable slot, else the
 * first one. The structure plane reports a second occurrence as `duplicate-section`.
 */
function sectionsFor(nodes: SectionNode[], slot: ContentSlot): SectionNode[] {
  const hits = nodes.filter((n) => slot.names.includes(n.name))
  return slot.opts.repeatable === true ? hits : hits.slice(0, 1)
}

/**
 * Checks one level: pairs each slot with the section that fills it, checks that section's
 * content leaves, then checks its declared children. `inheritedHint` is the nearest description
 * above this level.
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
    // The structure plane reports a missing section (structure/section-missing).
    for (const node of sectionsFor(nodes, slot)) {
      const sectionHint = slot.opts.description ?? levelHint
      validateSectionContent(node, slot.opts, ctx, out, values, sectionHint)
      if (slot.opts.children) {
        matchLevel(node.sections, slot.opts.children, ctx, out, values, sectionHint)
      }
    }
  }
}

/** Checks a section's content: a single leaf, or named leaves bound by `^anchor`. */
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

/** True for a single `LeafSpec`, false for a `Record<string, LeafSpec>`. */
function isLeafSpec(c: LeafSpec | Record<string, LeafSpec>): c is LeafSpec {
  return typeof (c as LeafSpec).kind === 'string'
}

/**
 * The block a leaf checks: the block with `anchor` when it is set, otherwise the section's
 * first block.
 */
function pickBlock(node: SectionNode, anchor: string | undefined): BlockNode | null {
  if (anchor !== undefined) return node.blocks.find((b) => b.anchor === anchor) ?? null
  return node.blocks[0] ?? null
}

/**
 * Checks one leaf against the block that fills it, only when a block of the right kind is
 * present. The structure plane reports a missing block (`structure/block-missing`) or a block of
 * the wrong kind (`structure/block-kind`).
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

  // The leaf's own description, else the section's.
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
 * Checks a `table` block's data:
 *   - each declared column is in `node.columns`            → `content/table/column-missing`
 *   - with `extraColumns: "error"`, no undeclared column   → `content/table/column-extra`
 *   - `minRows`                                            → `content/table/min-rows`
 *   - each `cells` schema on each row's value              → `content/table/cell`
 * The checks are independent, so one table can get several findings. Column and row-count
 * findings are placed on the header. Cell findings are placed on the row (`node.rowPos(i)`).
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

/** Reports missing declared columns and, with `extraColumns: "error"`, undeclared ones. */
function checkTableColumns(
  node: Extract<BlockNode, { kind: 'table' }>,
  cfg: TableConfig,
  ctx: Ctx,
  out: Finding[],
): void {
  // One finding per missing column.
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

/** Reports too few rows (`content/table/min-rows`). */
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

/** Runs each `cells` schema on every row's value in that column. */
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
    if (colIdx === -1) continue // column-missing already reports this
    const zod = asZod(schema)
    node.rows.forEach((row, i) => {
      const value = row[colIdx] ?? ''
      const res = zod.safeParse(value)
      if (res.success) {
        // Keep the output for the typed model.
        values.setCell(node, i, col, res.data)
      } else {
        out.push(
          ctx.finding({
            id: 'content/table/cell',
            message: `cell ‘${value}’ in column ‘${col}’ is invalid`,
            pos: node.rowPos(i),
          }),
        )
      }
    })
  }
}

// ── List ────────────────────────────────────────────────────────────────────────

/**
 * Checks a `list` block's data:
 *   - `everyItem: "checkbox"`: each item without a checkbox gets `content/list/item-kind`, on
 *     the item's line.
 *   - `everyItem: ZodType`: each item whose `text` fails the schema gets
 *     `content/list/item-kind`.
 *   - `minItems`: too few items gives `content/list/min-items`.
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
        // Keep the output for the typed model.
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

/** Reports a `code` block whose language is not the declared `lang` (`content/code/lang`). */
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

/** Reports a `paragraph` block with more than `maxWords` words (`content/max-words`). */
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
 * Maps a Zod issue code to a frontmatter finding id: `frontmatter/enum`,
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
      // a failed `.refine()` or `.superRefine()` check
      return 'frontmatter/refine'
    case 'invalid_type':
      // zod v4 reports a missing required key as invalid_type. The caller maps that case to
      // frontmatter/required.
      return 'frontmatter/type'
    default:
      return 'frontmatter/type'
  }
}

/** A Zod issue path as text: `[]` → "", `["a","b"]` → "a.b", `["related",0]` → "related[0]". */
function formatKeyPath(path: (string | number)[]): string {
  let s = ''
  for (const seg of path) {
    if (typeof seg === 'number') s += `[${seg}]`
    else s += s === '' ? seg : `.${seg}`
  }
  return s
}

/** The JS type name of a value, for "(got number)" text. `null` and arrays get their own names. */
function typeName(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/** The value at `path` in `data`, or `undefined` when any segment is absent. */
function valueAt(data: unknown, path: (string | number)[]): unknown {
  let node: unknown = data
  for (const seg of path) {
    if (node === null || node === undefined || typeof node !== 'object') return undefined
    node = (node as Record<string | number, unknown>)[seg]
  }
  return node
}

/**
 * The message for a frontmatter Zod issue. Zod's own message names a type or a value but not the
 * key, such as "expected string, received undefined". These messages start with the field
 * (`frontmatter field ‘<key>’ …`), so the reader knows what to fix.
 *
 * `id` is the finding id already chosen, so a missing required key reads "is required", not
 * "must be a string". `data` is the parsed frontmatter. It gives the actual type for a wrong-type
 * message, because zod v4 does not report it.
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

/** A value that is not the literal or enum value expected. `values` holds the allowed values. */
function invalidValueMessage(at: string, issue: ZodIssue): string {
  const values = Array.isArray(issue.values) ? issue.values : []
  if (values.length === 1) return `${at} must be ‘${String(values[0])}’`
  if (values.length > 1)
    return `${at} must be one of ${values.map((v) => `‘${String(v)}’`).join(', ')}`
  return `${at} has an invalid value`
}

/** A value of the wrong type. Names the expected type and the actual type. */
function invalidTypeMessage(at: string, issue: ZodIssue, data: unknown): string {
  const got = typeName(valueAt(data, issue.path))
  return issue.expected
    ? `${at} must be a ${issue.expected} (got ${got})`
    : `${at} has the wrong type (got ${got})`
}

/** A failed `pattern` or `format`. Names the format, or says "pattern" for a regex. */
function invalidFormatMessage(at: string, issue: ZodIssue): string {
  return issue.format && issue.format !== 'regex'
    ? `${at} is not a valid ${issue.format}`
    : `${at} does not match the required pattern`
}

/**
 * A failed `.refine()` or `.superRefine()` check. Keeps its message, with the field in front
 * when the issue is about one key, and as it is when it is about the whole frontmatter.
 */
function customMessage(at: string, field: string, issue: ZodIssue): string {
  return field && issue.message ? `${at}: ${issue.message}` : (issue.message ?? `${at} is invalid`)
}

/** Any other Zod code: the field, then Zod's own message. */
function unhandledMessage(at: string, field: string, issue: ZodIssue): string {
  return field
    ? `${at}: ${issue.message ?? 'is invalid'}`
    : (issue.message ?? 'frontmatter is invalid')
}

/**
 * The fields of a zod v4 schema needed to walk it along an issue path and read the
 * `.describe()` text at each node. `description` reads from zod's registry. `_zod.def` holds
 * the wrapped schema (`innerType`), an object's `shape` and an array's `element`.
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
 * Unwraps a schema's optional, nullable and default wrappers. Returns the innermost schema and
 * the outermost `.describe()` text found on the way.
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

/** Follows one path segment: a key into an object's `shape`, or an index into an array's `element`. */
function descend(node: unknown, seg: string | number): unknown {
  if (node === null || typeof node !== 'object') return undefined
  const def = (node as ZodIntrospect)._zod?.def
  return typeof seg === 'number' ? def?.element : def?.shape?.[seg]
}

/**
 * The nearest `.describe()` text along a Zod issue path. Walks the schema from the root by each
 * path segment, unwrapping wrappers. The deepest description found wins. Returns `undefined`
 * when no node on the path has one, and the caller then uses the contract's description.
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
 * Checks the frontmatter against the contract's Zod schema. Each issue is placed on its key's
 * line (`tree.frontmatter.lineForPath(issue.path)`). A strict object that rejects unknown keys
 * gives one Zod issue listing them in `keys`. Each key becomes its own `frontmatter/unknown-key`
 * on that key's line. A missing required key (an `invalid_type` on an undefined value) becomes
 * `frontmatter/required`. With no frontmatter block, or an empty one, the schema runs on `{}`,
 * so missing required keys are still reported. Each finding's `hint` is the nearest `.describe()` text on
 * the issue path, else `rootHint`.
 */
function matchFrontmatter(
  tree: DocTree,
  schema: ZodType,
  ctx: Ctx,
  out: Finding[],
  values: ParsedValues,
  rootHint?: string,
): void {
  // An empty or comment-only block parses to `null`. It holds no keys, so treat it like an absent
  // block: missing keys are `frontmatter/required`, not one type error on the whole block.
  const raw = tree.frontmatter?.data
  const data: unknown = raw === null || raw === undefined ? {} : raw
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
    if (issue.code === 'unrecognized_keys' && Array.isArray(issue.keys)) {
      emitUnknownKeys(issue, lineFor, ctxFor(issue.path), out)
    } else {
      emitFrontmatterIssue(issue, data, lineFor, ctxFor(issue.path), out)
    }
  }
}

/** Maps a Zod issue path to its source position, or `undefined` when it has none. */
type LineForPath = (path: (string | number)[]) => SourcePos | undefined

/** Adds one `frontmatter/unknown-key` per unknown key, on that key's line. */
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

/** Adds one finding for any other frontmatter issue (required, type, enum and so on), on its key's line. */
function emitFrontmatterIssue(
  issue: ZodIssue,
  data: unknown,
  lineFor: LineForPath,
  ctx: Ctx,
  out: Finding[],
): void {
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

/** True when `data` has no value at `path` (a missing required key). */
function isMissingRequired(data: unknown, path: (string | number)[]): boolean {
  return valueAt(data, path) === undefined
}

// ── Entry point ─────────────────────────────────────────────────────────────────

/**
 * Adds one `frontmatter/yaml` finding per YAML error in the frontmatter block, on the error's
 * line. Returns true when the YAML has no errors. The caller does not run the schema on broken
 * YAML, since its findings would only repeat the syntax error.
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
 * Runs the content plane: the frontmatter schema (if declared) and every section's content leaf.
 * Returns findings in the order they were made. `validate()` sorts them. The values the schemas
 * produce (frontmatter, cells and items) go into `values`, for the typed model.
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
