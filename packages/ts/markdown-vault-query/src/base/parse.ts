/**
 * Parser for Obsidian `.base` files (YAML) into a typed BaseDef.
 *
 * Schema per the official docs and obsidian-api typings:
 *   filters:    string expression, or recursive {and|or|not: [...]}
 *   formulas:   name → expression string
 *   properties: property ID → config (displayName, ...)
 *   summaries:  name → summary formula over the implicit `values` list
 *   views:      list of view objects; unknown view keys are preserved
 */

import YAML from 'yaml'
import { parseExpression, ExpressionError } from '../expr/parser.ts'
import type { Expr } from '../expr/ast.ts'

/**
 * Thrown by {@link parseBase} for a `.base` file that is not valid YAML or does not match the
 * schema. The message ends with the location and the reason; `cause` holds the underlying error
 * when there is one.
 */
export class BaseParseError extends Error {
  /** Where in the file the problem is, such as `views[0].sort[1]` or `formulas.total`. */
  path: string

  constructor(message: string, path: string, cause?: Error) {
    super(
      `${message} at ${path}${cause ? `: ${cause.message}` : ''}`,
      cause ? { cause } : undefined,
    )
    this.name = 'BaseParseError'
    this.path = path
  }
}

/** A filter: an expression, or an `and`, `or` or `not` group of filters. */
export type FilterNode =
  | { type: 'expr'; source: string; expr: Expr }
  | { type: 'and'; children: FilterNode[] }
  | { type: 'or'; children: FilterNode[] }
  /** `not` means "none of the following". */
  | { type: 'not'; children: FilterNode[] }

/** One sort or group key. */
export interface SortKey {
  /** The property ID to order by, such as `file.name` or `due`. */
  property: string
  /** Sort order. */
  direction: 'ASC' | 'DESC'
}

/** One view of a base: how to filter, order, group and summarize the notes. */
export interface BaseViewDef {
  /** View type id: built-in table/cards/list, or plugin-registered (map, ...). */
  type: string
  /** The view's name; `View <n>` when the file gives none. */
  name: string
  /** The view's own filter, applied after the base's, or null. */
  filters: FilterNode | null
  /** Property IDs of displayed columns, in order. */
  order: string[]
  /** Multi-key sort; priority = list order. */
  sort: SortKey[]
  /** The property rows are grouped by, or null. */
  groupBy: SortKey | null
  /** The most rows to return, or null for no limit. */
  limit: number | null
  /** Property ID → summary name (built-in or from BaseDef.summaries). */
  summaries: Record<string, string>
  /** All view keys not modeled above, preserved verbatim (columnSize, image, ...). */
  extra: Record<string, unknown>
}

/** A parsed `.base` file. */
export interface BaseDef {
  /** The global filter that applies to every view, or null. */
  filters: FilterNode | null
  /** Formula name to expression source. */
  formulas: Record<string, string>
  /** Property ID to its config, such as `displayName`. */
  properties: Record<string, Record<string, unknown>>
  /** Custom summary name to its expression over the implicit `values` list. */
  summaries: Record<string, string>
  /** The views, in file order. */
  views: BaseViewDef[]
  /** Unrecognized top-level keys, preserved verbatim. */
  extra: Record<string, unknown>
}

const KNOWN_TOP_KEYS = new Set(['filters', 'formulas', 'properties', 'summaries', 'views'])
const KNOWN_VIEW_KEYS = new Set([
  'type',
  'name',
  'filters',
  'order',
  'sort',
  'groupBy',
  'limit',
  'summaries',
])

function parseFilterNode(section: unknown, path: string): FilterNode {
  if (typeof section === 'string') {
    try {
      return { type: 'expr', source: section, expr: parseExpression(section) }
    } catch (e) {
      if (e instanceof ExpressionError)
        throw new BaseParseError('Invalid filter expression', path, e)
      throw e
    }
  }

  if (typeof section === 'object' && section !== null && !Array.isArray(section)) {
    const obj = section as Record<string, unknown>
    for (const key of ['and', 'or', 'not'] as const) {
      if (key in obj) {
        const raw = obj[key]
        const items = Array.isArray(raw) ? raw : [raw]
        return {
          type: key,
          children: items.map((item, i) => parseFilterNode(item, `${path}.${key}[${i}]`)),
        }
      }
    }
    throw new BaseParseError('Filter object must have one of "and", "or", "not"', path)
  }

  // Bare array (implicit AND) — not written by the UI but accepted for leniency.
  if (Array.isArray(section)) {
    return {
      type: 'and',
      children: section.map((item, i) => parseFilterNode(item, `${path}[${i}]`)),
    }
  }

  throw new BaseParseError('Invalid filter (expected string or and/or/not object)', path)
}

function parseSortKey(raw: unknown, path: string): SortKey {
  if (typeof raw === 'string') {
    // Lenient shorthand: "prop" / "-prop".
    return raw.startsWith('-')
      ? { property: raw.slice(1), direction: 'DESC' }
      : { property: raw, direction: 'ASC' }
  }
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>
    // `column` is the legacy 1.9-beta spelling of `property`.
    const property = obj.property ?? obj.column
    if (typeof property !== 'string')
      throw new BaseParseError('Sort entry missing "property"', path)
    const direction = String(obj.direction ?? 'ASC').toUpperCase()
    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new BaseParseError(`Invalid sort direction "${obj.direction}"`, path)
    }
    return { property, direction }
  }
  throw new BaseParseError('Invalid sort entry', path)
}

function stringRecord(raw: unknown, path: string): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BaseParseError('Expected a mapping of names to strings', path)
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string')
      throw new BaseParseError(`Value must be a string`, `${path}.${key}`)
    out[key] = value
  }
  return out
}

function parseView(raw: unknown, index: number): BaseViewDef {
  const path = `views[${index}]`
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BaseParseError('View must be an object', path)
  }
  const obj = raw as Record<string, unknown>

  if (typeof obj.type !== 'string' || obj.type.length === 0) {
    throw new BaseParseError('View missing required "type"', path)
  }

  const view: BaseViewDef = {
    type: obj.type,
    name: typeof obj.name === 'string' ? obj.name : `View ${index + 1}`,
    filters:
      obj.filters !== undefined && obj.filters !== null
        ? parseFilterNode(obj.filters, `${path}.filters`)
        : null,
    order: [],
    sort: [],
    groupBy: null,
    limit: null,
    summaries: {},
    extra: {},
  }

  if (obj.order !== undefined && obj.order !== null) {
    if (!Array.isArray(obj.order))
      throw new BaseParseError('"order" must be a list of property IDs', `${path}.order`)
    view.order = obj.order.map((item, i) => {
      if (typeof item !== 'string')
        throw new BaseParseError('Order entries must be strings', `${path}.order[${i}]`)
      return item
    })
  }

  if (obj.sort !== undefined && obj.sort !== null) {
    if (!Array.isArray(obj.sort)) throw new BaseParseError('"sort" must be a list', `${path}.sort`)
    view.sort = obj.sort.map((item, i) => parseSortKey(item, `${path}.sort[${i}]`))
  }

  if (obj.groupBy !== undefined && obj.groupBy !== null) {
    view.groupBy = parseSortKey(obj.groupBy, `${path}.groupBy`)
  }

  if (obj.limit !== undefined && obj.limit !== null) {
    if (typeof obj.limit !== 'number' || obj.limit < 0) {
      throw new BaseParseError('"limit" must be a non-negative number', `${path}.limit`)
    }
    view.limit = obj.limit
  }

  if (obj.summaries !== undefined && obj.summaries !== null) {
    view.summaries = stringRecord(obj.summaries, `${path}.summaries`)
  }

  for (const [key, value] of Object.entries(obj)) {
    if (!KNOWN_VIEW_KEYS.has(key)) view.extra[key] = value
  }

  return view
}

/**
 * Parse the source of a `.base` file into a {@link BaseDef}. Every filter, formula and summary is
 * parsed as an expression, so a syntax error fails here. Throws {@link BaseParseError}.
 */
export function parseBase(source: string): BaseDef {
  let raw: unknown
  try {
    raw = YAML.parse(source) ?? {}
  } catch (e) {
    throw new BaseParseError('Invalid YAML', 'root', e as Error)
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BaseParseError('Base file must be a YAML mapping', 'root')
  }
  const obj = raw as Record<string, unknown>

  const base: BaseDef = {
    filters:
      obj.filters !== undefined && obj.filters !== null
        ? parseFilterNode(obj.filters, 'filters')
        : null,
    formulas:
      obj.formulas !== undefined && obj.formulas !== null
        ? stringRecord(obj.formulas, 'formulas')
        : {},
    properties: {},
    summaries:
      obj.summaries !== undefined && obj.summaries !== null
        ? stringRecord(obj.summaries, 'summaries')
        : {},
    views: [],
    extra: {},
  }

  if (obj.properties !== undefined && obj.properties !== null) {
    if (typeof obj.properties !== 'object' || Array.isArray(obj.properties)) {
      throw new BaseParseError('"properties" must be a mapping', 'properties')
    }
    for (const [key, value] of Object.entries(obj.properties as Record<string, unknown>)) {
      if (typeof value === 'string') {
        // Shorthand: displayName only.
        base.properties[key] = { displayName: value }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        base.properties[key] = value as Record<string, unknown>
      } else {
        throw new BaseParseError('Invalid property config', `properties.${key}`)
      }
    }
  }

  if (obj.views !== undefined && obj.views !== null) {
    if (!Array.isArray(obj.views)) throw new BaseParseError('"views" must be a list', 'views')
    base.views = obj.views.map((v, i) => parseView(v, i))
  }

  for (const [key, value] of Object.entries(obj)) {
    if (!KNOWN_TOP_KEYS.has(key)) base.extra[key] = value
  }

  // Formulas and summaries must parse as expressions (fail fast with context).
  for (const [name, formula] of Object.entries(base.formulas)) {
    try {
      parseExpression(formula)
    } catch (e) {
      if (e instanceof ExpressionError)
        throw new BaseParseError('Invalid formula expression', `formulas.${name}`, e)
      throw e
    }
  }
  for (const [name, formula] of Object.entries(base.summaries)) {
    try {
      parseExpression(formula)
    } catch (e) {
      if (e instanceof ExpressionError)
        throw new BaseParseError('Invalid summary expression', `summaries.${name}`, e)
      throw e
    }
  }

  return base
}

// Known limits, tracked in docs/planning/tasks/T-01-embedded-base-fences.md: an empty ```base
// block is dropped or merged with the next fence, and a ```base64 fence is read as a base.
const EMBEDDED_BASE_RE = /^(`{3,}|~{3,})base[^\n]*\n([\s\S]*?)\n\1\s*$/gm

/**
 * Find the ```base fenced code blocks in a markdown string and parse each with {@link parseBase}.
 * Throws {@link BaseParseError} for the first block that is invalid.
 */
export function extractEmbeddedBases(markdown: string): BaseDef[] {
  const bases: BaseDef[] = []
  for (const match of markdown.matchAll(EMBEDDED_BASE_RE)) {
    // Group 2 (the block body) is non-optional in EMBEDDED_BASE_RE, so a match
    // always carries it; reading it stands in for the match test.
    const body = match[2]
    if (body !== undefined) bases.push(parseBase(body))
  }
  return bases
}
