/**
 * Compiles the YAML `body:` into the grammar builders (`sections`, `section`, `oneOf`, `gap`,
 * `optional`) and the four leaves (`table`, `list`, `code`, `maxWords`).
 *
 * An unknown node, level or leaf key is a `DeclarativeError`. The YAML names differ from the
 * code options in these ways:
 *   - `additionalSections` (boolean) on a level is `allowUnknown`.
 *   - `minContains` and `maxContains` (JSON Schema's names) set how often a section occurs, in
 *     place of `optional`, `repeatable`, `min` and `max`. With neither, the slot is plain. With
 *     either, the count runs from `minContains ?? 1` to `maxContains ?? ∞`.
 *   - A nested level sits directly on its section node: `sections` (and optional `order` and
 *     `additionalSections`), with no `children:` wrapper.
 *   - A list leaf's `items` (`checkbox` or a schema node) is `everyItem`. Leaf `cells` and
 *     `items` schemas use the JSON Schema subset in `schema-v2.ts`.
 *   - `description` is allowed on levels, nodes and leaves. It becomes the findings' hint.
 * `requires:` and `forbids:` compile through `text.ts`.
 */
import type { ZodType } from 'zod'

import { gap, oneOf, optional, section, sections } from '../core/grammar.js'
import { code, list, maxWords, table } from '../core/leaves.js'
import type { LeafSpec, LevelOpts, SectionOpts, SectionSeq, Spec } from '../core/types.js'
import { DeclarativeError } from './errors.js'
import { compileSchemaV2 } from './schema-v2.js'
import { compileSectionTextRules, hasTextKeys } from './text.js'

const LEAF_KEYS = new Set(['table', 'list', 'code', 'maxWords'])

const isMap = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

// ── Allowed keys ────────────────────────────────────────────────────

/** The keys of `body:`. Its `requires` and `forbids` become a contract rule (see `load.ts`). */
const LEVEL_KEYS = new Set([
  'order',
  'additionalSections',
  'sections',
  'description',
  'requires',
  'forbids',
])

/** The keys of a section node, including those of a nested level (`sections`, `order`, `additionalSections`). */
const SECTION_NODE_KEYS = new Set([
  'section',
  'aliases',
  'anchor',
  'content',
  'requires',
  'forbids',
  'description',
  'minContains',
  'maxContains',
  'sections',
  'order',
  'additionalSections',
])

/** The keys of a `oneOf` node: the section keys with `oneOf` in place of `section` and `aliases`. */
const ONEOF_NODE_KEYS = new Set(
  [...SECTION_NODE_KEYS].filter((k) => k !== 'aliases' && k !== 'section').concat('oneOf'),
)

/** v1 body keys, mapped to the v2 form the error message names. */
const V1_BODY_SPELLINGS: Record<string, string> = {
  optional: "'minContains: 0'",
  repeatable: "'minContains' / 'maxContains'",
  min: "'minContains'",
  max: "'maxContains'",
  children: "a hoisted 'sections' list on the node",
  allowUnknown: "'additionalSections'",
  everyItem: "'items'",
}

/** Throws on any key not in `allowed`. A v1 key's message names the v2 form. Others are "unknown key". */
function assertClosedKeys(n: Record<string, unknown>, allowed: Set<string>, path: string): void {
  for (const key of Object.keys(n)) {
    if (allowed.has(key)) continue
    const v1 = V1_BODY_SPELLINGS[key]
    if (v1 !== undefined) {
      throw new DeclarativeError(
        `${path}: '${key}' is the v1 spelling — v2 uses ${v1} (markdown-contract migrate rewrites v1 files)`,
      )
    }
    throw new DeclarativeError(`${path}: unknown key '${key}'`)
  }
}

// ── Levels ───────────────────────────────────────────────────────────────────────

/** Compiles a `body:` mapping into a `sections(opts, specs)` body grammar. */
export function compileBodyV2(node: unknown, path = 'body'): SectionSeq {
  if (!isMap(node)) {
    throw new DeclarativeError(`${path}: must be a mapping with a 'sections' list`)
  }
  assertClosedKeys(node, LEVEL_KEYS, path)
  return compileLevel(node, path)
}

/** Compiles one level's `order`, `additionalSections`, `description` and `sections` into a `SectionSeq`. */
function compileLevel(node: Record<string, unknown>, path: string): SectionSeq {
  const opts: LevelOpts = {}
  if ('order' in node) {
    if (node.order !== 'none' && node.order !== 'recognized-relative' && node.order !== 'strict') {
      throw new DeclarativeError(
        `${path}.order must be none | recognized-relative | strict (got ${JSON.stringify(node.order)})`,
      )
    }
    opts.order = node.order
  }
  if ('additionalSections' in node) {
    if (typeof node.additionalSections !== 'boolean') {
      throw new DeclarativeError(`${path}.additionalSections must be a boolean`)
    }
    opts.allowUnknown = node.additionalSections
  }
  if ('description' in node) {
    opts.description = readDescription(node, path)
  }
  if (!Array.isArray(node.sections)) {
    throw new DeclarativeError(`${path}.sections must be a list of nodes`)
  }
  const specs = node.sections.map((n, i) => compileNode(n, `${path}.sections[${i}]`))
  return sections(opts, specs)
}

/** Reads a node's `description`. Throws when it is not a string. */
function readDescription(node: Record<string, unknown>, path: string): string {
  if (typeof node.description !== 'string') {
    throw new DeclarativeError(`${path}.description must be a string`)
  }
  return node.description
}

// ── Nodes ────────────────────────────────────────────────────────────────────────

function compileNode(node: unknown, path: string): Spec {
  if (!isMap(node)) {
    throw new DeclarativeError(`${path}: a body node must be a mapping (section / oneOf / gap)`)
  }
  const selectors = (['section', 'oneOf', 'gap'] as const).filter((k) => k in node)
  if (selectors.length !== 1) {
    throw new DeclarativeError(
      `${path}: a body node needs exactly one of section / oneOf / gap` +
        (selectors.length > 1 ? ` (got ${selectors.join(' + ')})` : ''),
    )
  }
  switch (selectors[0]) {
    case 'gap':
      assertClosedKeys(node, new Set(['gap']), path)
      return compileGap(node, path)
    case 'oneOf':
      assertClosedKeys(node, ONEOF_NODE_KEYS, path)
      return compileOneOf(node, path)
    default:
      assertClosedKeys(node, SECTION_NODE_KEYS, path)
      return compileSectionNode(node, path)
  }
}

/** Compiles a `gap:` node: empty, or `{ min?, max? }`. */
function compileGap(node: Record<string, unknown>, path: string): Spec {
  const g = node.gap
  if (g === null || g === undefined) return gap({})
  if (!isMap(g)) {
    throw new DeclarativeError(`${path}.gap must be a mapping ({ min?, max? }) or empty`)
  }
  for (const key of Object.keys(g)) {
    if (key !== 'min' && key !== 'max') {
      throw new DeclarativeError(`${path}.gap: unknown key '${key}'`)
    }
    if (typeof g[key] !== 'number') {
      throw new DeclarativeError(`${path}.gap.${key} must be a number`)
    }
  }
  return gap({
    ...(typeof g.min === 'number' ? { min: g.min } : {}),
    ...(typeof g.max === 'number' ? { max: g.max } : {}),
  })
}

/** Compiles a `oneOf: [...]` node into a `oneOf(names, opts)` spec, with its count applied. */
function compileOneOf(node: Record<string, unknown>, path: string): Spec {
  const names = node.oneOf
  if (!Array.isArray(names) || names.length === 0 || !names.every((s) => typeof s === 'string')) {
    throw new DeclarativeError(`${path}.oneOf must be a non-empty list of section names`)
  }
  const label = String(names[0])
  const opts = sectionOptsV2(node, path, label)
  return applyOccurrence(node, path, (o) => oneOf(names as string[], o), opts)
}

/** Compiles a `section: <name>` node (with optional `aliases`) into a `section(...)` spec, with its count applied. */
function compileSectionNode(node: Record<string, unknown>, path: string): Spec {
  const name = node.section
  if (typeof name !== 'string') {
    throw new DeclarativeError(`${path}.section must be a heading name (string)`)
  }
  const aliases = node.aliases
  if (
    aliases !== undefined &&
    (!Array.isArray(aliases) || !aliases.every((s) => typeof s === 'string'))
  ) {
    throw new DeclarativeError(`${path}.aliases must be a list of alias spellings`)
  }
  const names = Array.isArray(aliases) ? [name, ...(aliases as string[])] : name
  const opts = sectionOptsV2(node, path, name)
  return applyOccurrence(node, path, (o) => section(names, o), opts)
}

/** The `SectionOpts` of a section or `oneOf` node: anchor, content, nested level, text rules and description. */
function sectionOptsV2(
  node: Record<string, unknown>,
  path: string,
  label: string,
): SectionOpts | undefined {
  const opts: SectionOpts = {}
  let any = false
  if ('anchor' in node) {
    opts.anchor = String(node.anchor)
    any = true
  }
  if ('description' in node) {
    opts.description = readDescription(node, path)
    any = true
  }
  if ('content' in node) {
    opts.content = compileContent(node.content, `${path}.content`)
    any = true
  }
  const children = hoistedChildren(node, path)
  if (children !== undefined) {
    opts.children = children
    any = true
  }
  // `requires:` and `forbids:` on a node become rules over that section and its subsections.
  if (hasTextKeys(node)) {
    const rules = compileSectionTextRules(node, path, label)
    if (rules.length > 0) {
      opts.rules = rules
      any = true
    }
  }
  return any ? opts : undefined
}

/**
 * The nested level written on a section node: `sections`, with optional `order` and
 * `additionalSections`. `order` or `additionalSections` without `sections` is an error.
 */
function hoistedChildren(node: Record<string, unknown>, path: string): SectionSeq | undefined {
  if ('sections' in node) {
    const nested: Record<string, unknown> = { sections: node.sections }
    if ('order' in node) nested.order = node.order
    if ('additionalSections' in node) nested.additionalSections = node.additionalSections
    return compileLevel(nested, path)
  }
  if ('order' in node || 'additionalSections' in node) {
    const key = 'order' in node ? 'order' : 'additionalSections'
    throw new DeclarativeError(`${path}: '${key}' requires a nested 'sections' list on the node`)
  }
  return undefined
}

// ── Counts (minContains, maxContains → optional, repeatable, min, max) ────

/**
 * Reads a slot's count bounds. Returns `undefined` when both keys are absent (a plain slot),
 * else `{ lo, hi }` with lo = minContains ?? 1 and hi = maxContains ?? ∞. Both must be
 * non-negative integers, with hi ≥ 1 and hi ≥ lo.
 */
function readOccurrence(
  node: Record<string, unknown>,
  path: string,
): { lo: number; hi: number } | undefined {
  const hasLo = 'minContains' in node
  const hasHi = 'maxContains' in node
  if (!hasLo && !hasHi) return undefined
  const lo = hasLo ? occurrenceInt(node.minContains, `${path}.minContains`) : 1
  const hi = hasHi ? occurrenceInt(node.maxContains, `${path}.maxContains`) : Infinity
  if (hi < 1) {
    throw new DeclarativeError(
      `${path}.maxContains must be at least 1 (to forbid a section, leave it undeclared)`,
    )
  }
  if (hi < lo) {
    throw new DeclarativeError(`${path}: maxContains (${hi}) is below minContains (${lo})`)
  }
  return { lo, hi }
}

/** Checks that a count bound is a non-negative integer. */
function occurrenceInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new DeclarativeError(`${path} must be a non-negative integer`)
  }
  return v
}

/**
 * Turns the count bounds into builder options:
 *   - lo=0, hi=1: `optional(slot)`, not repeatable.
 *   - lo=1, hi=1: a plain slot, the same as both keys absent.
 *   - hi>1 or hi=∞: `repeatable: true`, with `min: lo` when lo ≥ 2 and `max: hi` when finite.
 *   - lo=0 always wraps the slot in `optional(...)`. lo ≥ 1 never does.
 */
function applyOccurrence(
  node: Record<string, unknown>,
  path: string,
  make: (opts?: SectionOpts) => Spec,
  opts: SectionOpts | undefined,
): Spec {
  const occ = readOccurrence(node, path)
  if (!occ) return make(opts)
  const { lo, hi } = occ
  const counted: SectionOpts = { ...opts }
  if (hi !== 1) {
    counted.repeatable = true
    if (lo >= 2) counted.min = lo
    if (hi !== Infinity) counted.max = hi
  }
  const spec = make(Object.keys(counted).length > 0 ? counted : undefined)
  return lo === 0 ? optional(spec) : spec
}

// ── Content leaves ───────────────────────────────────────────────────────────────

function isLeafMap(v: unknown): v is Record<string, unknown> {
  return isMap(v) && Object.keys(v).length === 1 && LEAF_KEYS.has(Object.keys(v)[0]!)
}

function compileContent(content: unknown, path: string): LeafSpec | Record<string, LeafSpec> {
  if (!isMap(content)) {
    throw new DeclarativeError(
      `${path}: must be a leaf (table/list/code/maxWords) or a named-leaf map`,
    )
  }
  if (isLeafMap(content)) return compileLeaf(content, path)
  // A record of `^anchor`-named leaves.
  const rec: Record<string, LeafSpec> = {}
  for (const [name, leaf] of Object.entries(content)) {
    rec[name] = compileLeaf(leaf, `${path}.${name}`)
  }
  return rec
}

function compileLeaf(node: unknown, path: string): LeafSpec {
  if (!isMap(node) || Object.keys(node).length !== 1) {
    throw new DeclarativeError(
      `${path}: a leaf must be a single-key mapping (table | list | code | maxWords)`,
    )
  }
  const key = Object.keys(node)[0]!
  const cfg = node[key]
  switch (key) {
    case 'maxWords': {
      if (typeof cfg !== 'number') throw new DeclarativeError(`${path}.maxWords must be a number`)
      return maxWords(cfg)
    }
    case 'code':
      return codeLeaf(cfg, path)
    case 'table':
      return tableLeaf(cfg, path)
    case 'list':
      return listLeaf(cfg, path)
    default:
      throw new DeclarativeError(`${path}: unknown leaf '${key}'`)
  }
}

/** Stores a leaf's `description` in its config, where the planes read it as the hint. */
function attachLeafDescription(leaf: LeafSpec, description: string | undefined): LeafSpec {
  if (description !== undefined) {
    ;(leaf.config as Record<string, unknown>).description = description
  }
  return leaf
}

/** `code: { lang?, description? }`, or an empty `code:`. */
function codeLeaf(cfg: unknown, path: string): LeafSpec {
  if (cfg === null || cfg === undefined) return code({})
  if (!isMap(cfg)) throw new DeclarativeError(`${path}.code must be a mapping`)
  assertClosedKeys(cfg, new Set(['lang', 'description']), `${path}.code`)
  if ('lang' in cfg && typeof cfg.lang !== 'string') {
    throw new DeclarativeError(`${path}.code.lang must be a string`)
  }
  const description = 'description' in cfg ? readDescription(cfg, `${path}.code`) : undefined
  const leaf = code(typeof cfg.lang === 'string' ? { lang: cfg.lang } : {})
  return attachLeafDescription(leaf, description)
}

/** `table: { columns, anchor?, minRows?, cells?, extraColumns?, description? }`. `cells` use the schema subset. */
function tableLeaf(cfg: unknown, path: string): LeafSpec {
  if (!isMap(cfg)) throw new DeclarativeError(`${path}.table must be a mapping`)
  assertClosedKeys(
    cfg,
    new Set(['columns', 'anchor', 'minRows', 'cells', 'extraColumns', 'description']),
    `${path}.table`,
  )
  if (!Array.isArray(cfg.columns) || !cfg.columns.every((c) => typeof c === 'string')) {
    throw new DeclarativeError(`${path}.table.columns must be a list of column names`)
  }
  const out: {
    columns: string[]
    anchor?: string
    minRows?: number
    cells?: Record<string, ZodType>
    extraColumns?: 'ignore' | 'error'
  } = { columns: cfg.columns as string[] }
  if ('anchor' in cfg) out.anchor = String(cfg.anchor)
  if ('minRows' in cfg) {
    if (typeof cfg.minRows !== 'number') {
      throw new DeclarativeError(`${path}.table.minRows must be a number`)
    }
    out.minRows = cfg.minRows
  }
  if ('extraColumns' in cfg) {
    if (cfg.extraColumns !== 'ignore' && cfg.extraColumns !== 'error') {
      throw new DeclarativeError(`${path}.table.extraColumns must be "ignore" or "error"`)
    }
    out.extraColumns = cfg.extraColumns
  }
  const cells = tableCells(cfg, path)
  if (cells !== undefined) out.cells = cells
  const description = 'description' in cfg ? readDescription(cfg, `${path}.table`) : undefined
  return attachLeafDescription(table(out), description)
}

/** A table's `cells` map, each column's schema compiled with `compileSchemaV2`. */
function tableCells(
  cfg: Record<string, unknown>,
  path: string,
): Record<string, ZodType> | undefined {
  if (!('cells' in cfg)) return undefined
  if (!isMap(cfg.cells)) {
    throw new DeclarativeError(`${path}.table.cells must be a mapping of column → schema`)
  }
  const cells: Record<string, ZodType> = {}
  for (const [col, schema] of Object.entries(cfg.cells)) {
    cells[col] = compileSchemaV2(schema, `${path}.table.cells.${col}`)
  }
  return cells
}

/** `list: { items?, minItems?, ordered?, description? }`. `items` is `checkbox` or a schema node. */
function listLeaf(cfg: unknown, path: string): LeafSpec {
  if (!isMap(cfg)) throw new DeclarativeError(`${path}.list must be a mapping`)
  assertClosedKeys(cfg, new Set(['items', 'minItems', 'ordered', 'description']), `${path}.list`)
  const out: { ordered?: boolean; everyItem?: 'checkbox' | ZodType; minItems?: number } = {}
  if ('ordered' in cfg) {
    if (typeof cfg.ordered !== 'boolean') {
      throw new DeclarativeError(`${path}.list.ordered must be a boolean`)
    }
    out.ordered = cfg.ordered
  }
  if ('minItems' in cfg) {
    if (typeof cfg.minItems !== 'number') {
      throw new DeclarativeError(`${path}.list.minItems must be a number`)
    }
    out.minItems = cfg.minItems
  }
  if ('items' in cfg) {
    out.everyItem =
      cfg.items === 'checkbox' ? 'checkbox' : compileSchemaV2(cfg.items, `${path}.list.items`)
  }
  const description = 'description' in cfg ? readDescription(cfg, `${path}.list`) : undefined
  return attachLeafDescription(list(out), description)
}
