/**
 * Query execution: run a BaseDef (or one of its views) against a VaultIndex.
 *
 * The pipeline of a view (`runView`): global filters AND view filters → sort →
 * limit → evaluate the columns of the rows kept → group → summaries. Groups
 * and summaries cover the rows after the limit.
 */

import type { BaseDef, BaseViewDef, FilterNode, SortKey } from './base/parse.ts'
import { parseExpression } from './expr/parser.ts'
import { evaluateSafe, runLinkResolver, type EvalContext } from './expr/eval.ts'
import {
  DateValue,
  DurationValue,
  ErrorValue,
  compareValues,
  isEmptyValue,
  isTruthy,
  toDisplayString,
  toNumber,
  valueEquals,
  type Value,
} from './expr/values.ts'
import type { VaultIndex, VaultNote } from '@osdlc/markdown-vault'

/** Options every query function takes. */
export interface QueryOptions {
  /** Vault path of the file hosting the query (`this`): base file or embedder. */
  thisPath?: string
  /** Stable clock for now()/today(); defaults to the current time. */
  now?: Date
}

/** One row of a view result. */
export interface ViewRow {
  /** The note this row stands for. */
  note: VaultNote
  /** Evaluated values for the view's `order` columns, by property ID. */
  columns: Record<string, Value>
}

/** One group of a view with `groupBy`. */
export interface ViewGroup {
  /** The value every row in the group shares for the `groupBy` property. */
  key: Value
  /** The key as display text, for a heading. */
  keyDisplay: string
  /** The group's rows, in view order. */
  rows: ViewRow[]
  /** Per-column summaries computed over this group's rows. */
  summaries: Record<string, Value>
}

/** What {@link runView} returns. */
export interface ViewResult {
  /** The view that ran. */
  view: BaseViewDef
  /** Sorted (and limited) rows. */
  rows: ViewRow[]
  /** Present when the view has groupBy. */
  groups: ViewGroup[] | null
  /** Per-column summaries over all rows, by property ID. */
  summaries: Record<string, Value>
  /** Matching row count before `limit` was applied. */
  total: number
}

/** A query run's options plus the link resolver every row of the run shares. */
interface RunOptions extends QueryOptions {
  resolveLink: (target: string, from?: VaultNote) => VaultNote | null
}

/**
 * Start one query run. The resolver is built here, not cached on the index,
 * so a run always resolves against the index as the caller passed it.
 */
function startRun(vault: VaultIndex, options: QueryOptions): RunOptions {
  return { ...options, resolveLink: runLinkResolver(vault) }
}

function makeContext(
  note: VaultNote,
  vault: VaultIndex,
  base: BaseDef,
  options: RunOptions,
): EvalContext {
  const thisNote = options.thisPath ? (vault.byPath.get(options.thisPath) ?? null) : null
  // `now` is spread in only when supplied. It is read as `ctx.now ?? new
  // Date()`, so absent and undefined mean the same thing — but under
  // exactOptionalPropertyTypes only absent is assignable to `now?: Date`.
  return {
    note,
    vault,
    formulas: base.formulas,
    thisNote,
    resolveLink: options.resolveLink,
    ...(options.now !== undefined ? { now: options.now } : {}),
  }
}

/**
 * Whether a note passes a filter tree. A null filter passes every note. A bad expression does not
 * throw: one that fails to evaluate counts as false, so a `not` group around it passes. A tree
 * nested too deeply for the stack fails the note. `ctx` carries the note under test.
 */
export function matchesFilter(filter: FilterNode | null, ctx: EvalContext): boolean {
  try {
    return passesFilter(filter, ctx)
  } catch (e) {
    if (e instanceof RangeError) return false
    throw e
  }
}

function passesFilter(filter: FilterNode | null, ctx: EvalContext): boolean {
  if (filter === null) return true
  switch (filter.type) {
    case 'expr': {
      const result = evaluateSafe(filter.expr, ctx)
      return !(result instanceof ErrorValue) && isTruthy(result)
    }
    case 'and':
      return filter.children.every((child) => passesFilter(child, ctx))
    case 'or':
      return filter.children.some((child) => passesFilter(child, ctx))
    case 'not':
      // "None of the following are true".
      return !filter.children.some((child) => passesFilter(child, ctx))
  }
}

/**
 * Evaluate a property ID (`file.x`, `note.x`, `formula.x`, or bare note
 * property) against a row. Never throws: a bad ID or a failed evaluation gives an
 * {@link ErrorValue}.
 */
export function evaluatePropertyId(id: string, ctx: EvalContext): Value {
  // Property IDs are not general expressions, but scope-qualified names; the
  // expression grammar covers them exactly (identifier + member access).
  try {
    const expr = parseExpression(scopedId(id))
    return evaluateSafe(expr, ctx)
  } catch {
    return new ErrorValue(`Invalid property ID "${id}"`)
  }
}

const PLAIN_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Quote a name for bracket access unless it is already a bare identifier. */
function memberAccess(name: string): string {
  return PLAIN_NAME_RE.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`
}

/** Names the expression grammar reads as a scope or a literal, never as a note property. */
const RESERVED_NAMES = new Set(['file', 'this', 'note', 'formula', 'true', 'false', 'null'])

function scopedId(id: string): string {
  // `note.` and `formula.` qualify user-chosen names, so a segment carrying a
  // dash or a space has to go through bracket syntax — `note.due-date` parses
  // as a subtraction otherwise, and `formula.Total Cost` does not parse at all.
  // `file.` and `this.` name a fixed attribute set and pass through.
  // A note property may nest (`note.meta.owner`); the formula table is flat, so
  // a formula name is one key even when it holds a dot (`formula.incl. tax`).
  if (id.startsWith('formula.')) return `formula${memberAccess(id.slice('formula.'.length))}`
  if (id.startsWith('note.'))
    return `note${id.slice('note.'.length).split('.').map(memberAccess).join('')}`
  if (id.startsWith('file.') || id.startsWith('this.')) return id
  // Bare names refer to note properties; quote via bracket syntax so names
  // with dashes/spaces, and names the grammar reserves, still resolve.
  return PLAIN_NAME_RE.test(id) && !RESERVED_NAMES.has(id) ? id : `note[${JSON.stringify(id)}]`
}

/**
 * The notes that pass a base's global filters, in vault order. Views are not applied.
 * Use {@link runView} for a view's filters, columns, sort, groups and summaries.
 */
export function queryBase(
  vault: VaultIndex,
  base: BaseDef,
  options: QueryOptions = {},
): VaultNote[] {
  const run = startRun(vault, options)
  return vault.notes.filter((note) =>
    matchesFilter(base.filters, makeContext(note, vault, base, run)),
  )
}

/**
 * The notes for which a filter expression is truthy, in vault order. A note whose evaluation
 * fails is left out. Throws {@link ExpressionError} when the expression does not parse. Use
 * {@link queryVault} to sort and page the result.
 */
export function queryExpression(
  vault: VaultIndex,
  expression: string,
  options: QueryOptions = {},
): VaultNote[] {
  const expr = parseExpression(expression)
  const base: BaseDef = {
    filters: null,
    formulas: {},
    properties: {},
    summaries: {},
    views: [],
    extra: {},
  }
  const run = startRun(vault, options)
  return vault.notes.filter((note) => {
    const result = evaluateSafe(expr, makeContext(note, vault, base, run))
    return !(result instanceof ErrorValue) && isTruthy(result)
  })
}

/** Options for {@link queryVault}. */
export interface FilterQueryOptions extends QueryOptions {
  /** Filter expression string; empty or omitted matches every note. */
  filter?: string
  /** Sort keys applied before limit/offset; empty keeps vault order. */
  sort?: SortKey[]
  /** Max notes to return after sorting; omitted returns every match. A non-negative integer. */
  limit?: number
  /** Notes to skip after sorting; default 0. A non-negative integer. */
  offset?: number
}

/** What {@link queryVault} returns. */
export interface FilterQueryResult {
  /** The page of matching notes after sort → offset → limit. */
  notes: VaultNote[]
  /** Total matches before offset/limit were applied. */
  total: number
}

/**
 * Ad-hoc paged query: filter the vault by an expression string, sort by the
 * given keys, then page with offset/limit. Returns the page plus the pre-page
 * `total` — the ergonomic shape a UI needs when it renders its own rows
 * (unlike `runView`, which evaluates per-view columns/groups/summaries).
 * Throws {@link ExpressionError} when the filter does not parse, and `RangeError` when `offset` or
 * `limit` is not a non-negative integer.
 */
export function queryVault(vault: VaultIndex, options: FilterQueryOptions = {}): FilterQueryResult {
  for (const name of ['offset', 'limit'] as const) {
    const value = options[name]
    if (value !== undefined && !(Number.isInteger(value) && value >= 0)) {
      throw new RangeError(`${name} must be a non-negative integer, got ${value}`)
    }
  }
  const base: BaseDef = {
    filters: null,
    formulas: {},
    properties: {},
    summaries: {},
    views: [],
    extra: {},
  }
  const expr = options.filter && options.filter.trim() ? parseExpression(options.filter) : null
  const sortKeys = options.sort ?? []
  const run = startRun(vault, options)

  const matched: Array<{ note: VaultNote; sortValues: Value[] }> = []
  for (const note of vault.notes) {
    const ctx = makeContext(note, vault, base, run)
    if (expr) {
      const result = evaluateSafe(expr, ctx)
      if (result instanceof ErrorValue || !isTruthy(result)) continue
    }
    matched.push({ note, sortValues: sortKeys.map((key) => evaluatePropertyId(key.property, ctx)) })
  }

  const total = matched.length
  if (sortKeys.length > 0) sortRows(matched, sortKeys)

  const offset = options.offset ?? 0
  const end = options.limit !== undefined ? offset + options.limit : undefined
  return { notes: matched.slice(offset, end).map((m) => m.note), total }
}

function compareForSort(a: Value, b: Value): number {
  // Empty values always sort last, regardless of direction handling below.
  const aEmpty = a === null || a instanceof ErrorValue
  const bEmpty = b === null || b instanceof ErrorValue
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  try {
    return compareValues(a, b)
  } catch {
    return toDisplayString(a).localeCompare(toDisplayString(b), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  }
}

function sortRows(rows: Array<{ note: VaultNote; sortValues: Value[] }>, keys: SortKey[]): void {
  rows.sort((a, b) => {
    for (const [i, key] of keys.entries()) {
      // sortValues is built by mapping these same keys, so both reads are in
      // range; a short row falls through to the path tiebreaker.
      const av = a.sortValues[i]
      const bv = b.sortValues[i]
      if (av === undefined || bv === undefined) break
      const cmp = compareForSort(av, bv)
      if (cmp !== 0) {
        const aEmpty = av === null || av instanceof ErrorValue
        const bEmpty = bv === null || bv instanceof ErrorValue
        // Keep empties last even under DESC.
        if (aEmpty || bEmpty) return cmp
        return key.direction === 'DESC' ? -cmp : cmp
      }
    }
    // Stable fallback: file path.
    return a.note.file.path.localeCompare(b.note.file.path)
  })
}

/**
 * The view called `viewName`, or the first view when the name is omitted. A base with no views
 * gets a bare table view named `Default`. Throws when no view has the name.
 */
export function selectView(base: BaseDef, viewName?: string): BaseViewDef {
  const first = base.views[0]
  if (first === undefined) {
    // A base with no views still queries; synthesize a bare table view.
    return {
      type: 'table',
      name: 'Default',
      filters: null,
      order: [],
      sort: [],
      groupBy: null,
      limit: null,
      summaries: {},
      extra: {},
    }
  }
  if (viewName === undefined) return first
  const view = base.views.find((v) => v.name === viewName)
  if (!view) {
    throw new Error(
      `View "${viewName}" not found; available: ${base.views.map((v) => v.name).join(', ')}`,
    )
  }
  return view
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

// Folded pairwise rather than spread: a summary holds one value per row, and
// `Math.min(...nums)` on a large vault overflows the call stack. Both callers
// guarantee a non-empty list, so the seedless reduce is safe.
const minOf = (nums: number[]): number => nums.reduce((a, b) => Math.min(a, b))
const maxOf = (nums: number[]): number => nums.reduce((a, b) => Math.max(a, b))

const BUILTIN_SUMMARIES: Record<string, (values: Value[]) => Value> = {
  average: (values) =>
    numericAggregate(values, (nums) => nums.reduce((a, b) => a + b, 0) / nums.length),
  sum: (values) => numericAggregate(values, (nums) => nums.reduce((a, b) => a + b, 0)),
  min: (values) => numericAggregate(values, minOf),
  max: (values) => numericAggregate(values, maxOf),
  median: (values) =>
    numericAggregate(values, (nums) => {
      const sorted = [...nums].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      // An even-length list averages its two middle entries, an odd-length one
      // takes the single middle entry; slicing keeps both reads in range.
      const middle = sorted.slice(sorted.length % 2 === 0 ? mid - 1 : mid, mid + 1)
      return middle.reduce((total, n) => total + n, 0) / middle.length
    }),
  stddev: (values) =>
    numericAggregate(values, (nums) => {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length
      return Math.sqrt(nums.reduce((total, x) => total + (x - mean) ** 2, 0) / nums.length)
    }),
  range: (values) => {
    const dates = presentValues(values).filter((v): v is DateValue => v instanceof DateValue)
    if (dates.length > 0 && dates.length === presentValues(values).length) {
      const times = dates.map((d) => d.ms)
      return new DurationValue(0, maxOf(times) - minOf(times))
    }
    return numericAggregate(values, (nums) => maxOf(nums) - minOf(nums))
  },
  earliest: (values) => dateAggregate(values, minOf),
  latest: (values) => dateAggregate(values, maxOf),
  checked: (values) => values.filter((v) => v === true).length,
  unchecked: (values) => values.filter((v) => v === false).length,
  // Empty is what isEmpty() says: missing, an error, or an empty string/list/object.
  empty: (values) => values.filter(isEmptyValue).length,
  filled: (values) => values.filter((v) => !isEmptyValue(v)).length,
  unique: (values) => {
    const present = presentValues(values)
    const out: Value[] = []
    for (const v of present) {
      if (!out.some((seen) => valueEquals(seen, v))) out.push(v)
    }
    return out.length
  },
  count: (values) => presentValues(values).length,
}

function presentValues(values: Value[]): Value[] {
  return values.filter((v) => v !== null && !(v instanceof ErrorValue))
}

function numericAggregate(values: Value[], fn: (nums: number[]) => number): Value {
  const nums: number[] = []
  for (const v of presentValues(values)) {
    try {
      nums.push(toNumber(v))
    } catch {
      // Non-numeric values are skipped, matching Obsidian's lenient summaries.
    }
  }
  if (nums.length === 0) return null
  return fn(nums)
}

function dateAggregate(values: Value[], fn: (times: number[]) => number): Value {
  const dates = presentValues(values).filter((v): v is DateValue => v instanceof DateValue)
  if (dates.length === 0) return null
  const hasTime = dates.some((d) => d.hasTime)
  return new DateValue(new Date(fn(dates.map((d) => d.ms))), hasTime)
}

function computeSummary(
  name: string,
  columnValues: Value[],
  base: BaseDef,
  vault: VaultIndex,
  contextNote: VaultNote | undefined,
  options: RunOptions,
): Value {
  // Own-property lookups on both tables: a summary named for an inherited
  // member ("constructor", "hasOwnProperty") would otherwise resolve to a
  // function and be handed to the parser or called as an aggregator.
  const custom = Object.hasOwn(base.summaries, name) ? base.summaries[name] : undefined
  if (custom !== undefined) {
    // A custom summary is a formula over `values`, evaluated against a row so
    // it can also read note properties. An empty result has no row to supply,
    // and nothing to aggregate either, so it summarizes to nothing — the same
    // answer the builtin aggregates give for an empty column. Falling through
    // to the builtin table here would report the custom name as unknown.
    if (!contextNote) return null
    const ctx = makeContext(contextNote, vault, base, options)
    return evaluateSafe(parseExpression(custom), {
      ...ctx,
      locals: { ...ctx.locals, values: columnValues },
    })
  }
  const builtinName = name.toLowerCase()
  const builtin = Object.hasOwn(BUILTIN_SUMMARIES, builtinName)
    ? BUILTIN_SUMMARIES[builtinName]
    : undefined
  if (!builtin) return new ErrorValue(`Unknown summary "${name}"`)
  return builtin(columnValues)
}

function computeSummaries(
  view: BaseViewDef,
  rows: ViewRow[],
  base: BaseDef,
  vault: VaultIndex,
  options: RunOptions,
): Record<string, Value> {
  const out: Record<string, Value> = {}
  for (const [propertyId, summaryName] of Object.entries(view.summaries)) {
    // Reading the column replaces the `propertyId in row.columns` test: a Value
    // is never undefined, so "absent" and "undefined" are the same answer.
    const columnValues = rows.map((row) => {
      const evaluated = row.columns[propertyId]
      return evaluated !== undefined
        ? evaluated
        : evaluatePropertyId(propertyId, makeContext(row.note, vault, base, options))
    })
    out[propertyId] = computeSummary(summaryName, columnValues, base, vault, rows[0]?.note, options)
  }
  return out
}

// ---------------------------------------------------------------------------
// View execution
// ---------------------------------------------------------------------------

/**
 * Group-key equality. valueEquals never matches an error, but rows that fail
 * with the same message belong in one group, as their empty keys sort together.
 */
function sameGroupKey(a: Value, b: Value): boolean {
  if (a instanceof ErrorValue || b instanceof ErrorValue) {
    return a instanceof ErrorValue && b instanceof ErrorValue && a.message === b.message
  }
  return valueEquals(a, b)
}

/**
 * Run one view of a base over the vault: apply the base's and the view's filters, sort, limit,
 * evaluate the `order` columns of the rows kept, group and summarize. `total` counts the matches
 * before the limit.
 * Throws when `viewName` names no view.
 */
export function runView(
  vault: VaultIndex,
  base: BaseDef,
  viewName?: string,
  options: QueryOptions = {},
): ViewResult {
  const view = selectView(base, viewName)
  const run = startRun(vault, options)

  // Filter: global AND view.
  const matched: Array<{ note: VaultNote; sortValues: Value[] }> = []
  for (const note of vault.notes) {
    const ctx = makeContext(note, vault, base, run)
    if (!matchesFilter(base.filters, ctx)) continue
    if (!matchesFilter(view.filters, ctx)) continue
    matched.push({
      note,
      sortValues: view.sort.map((key) => evaluatePropertyId(key.property, ctx)),
    })
  }

  const total = matched.length
  if (view.sort.length > 0) sortRows(matched, view.sort)
  const limited = view.limit !== null ? matched.slice(0, view.limit) : matched

  const rows: ViewRow[] = limited.map(({ note }) => {
    const ctx = makeContext(note, vault, base, run)
    const columns: Record<string, Value> = {}
    for (const propertyId of view.order) {
      columns[propertyId] = evaluatePropertyId(propertyId, ctx)
    }
    return { note, columns }
  })

  let groups: ViewGroup[] | null = null
  if (view.groupBy) {
    const groupBy = view.groupBy
    const byKey: ViewGroup[] = []
    for (const row of rows) {
      const key = evaluatePropertyId(groupBy.property, makeContext(row.note, vault, base, run))
      let group = byKey.find((g) => sameGroupKey(g.key, key))
      if (!group) {
        group = { key, keyDisplay: toDisplayString(key), rows: [], summaries: {} }
        byKey.push(group)
      }
      group.rows.push(row)
    }
    byKey.sort((a, b) => {
      const cmp = compareForSort(a.key, b.key)
      const aEmpty = a.key === null || a.key instanceof ErrorValue
      const bEmpty = b.key === null || b.key instanceof ErrorValue
      if (aEmpty || bEmpty) return cmp
      return groupBy.direction === 'DESC' ? -cmp : cmp
    })
    for (const group of byKey) {
      group.summaries = computeSummaries(view, group.rows, base, vault, run)
    }
    groups = byKey
  }

  return {
    view,
    rows,
    groups,
    summaries: computeSummaries(view, rows, base, vault, run),
    total,
  }
}
