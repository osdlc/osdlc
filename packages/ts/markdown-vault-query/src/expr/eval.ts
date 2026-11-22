/**
 * Evaluator for Bases expressions: resolves properties against a vault note,
 * dispatches the full global-function and per-type method library, and
 * evaluates formulas with cycle detection.
 */

import type { Expr, MethodExpr } from './ast.ts'
import { parseExpression } from './parser.ts'
import { formatDateMoment, formatRelative } from './format-date.ts'
import { createLinkResolver, type VaultIndex, type VaultNote } from '@osdlc/markdown-vault'
import {
  DateValue,
  DurationValue,
  ErrorValue,
  ExpressionEvalError,
  FileValue,
  HtmlValue,
  IconValue,
  ImageValue,
  LinkValue,
  RegexpValue,
  addValues,
  compareValues,
  divideValues,
  fromFrontmatter,
  isEmptyValue,
  isList,
  isPlainObject,
  isTruthy,
  linkPath,
  localDate,
  moduloValues,
  multiplyValues,
  parseDate,
  parseDuration,
  subtractValues,
  toDisplayString,
  toNumber,
  typeName,
  valueEquals,
  type Value,
} from './values.ts'

/** Upper bound on the output length of string.repeat(), to avoid a native
 * RangeError (uncatchable as an ExpressionEvalError) from an oversized but finite count. */
const MAX_REPEAT_RESULT_LENGTH = 1_000_000

/** What an expression reads while it runs: the row's note, the vault and the base's formulas. */
export interface EvalContext {
  /** The note the expression is evaluated against (one result row). */
  note: VaultNote
  /** The index that link, backlink and `file()` lookups resolve against. */
  vault: VaultIndex
  /** Raw formula expressions from the .base file, by name. */
  formulas: Record<string, string>
  /** The `this` file: the base file, its embedder, or the active file. */
  thisNote?: VaultNote | null
  /** Implicit variables: value/index/acc in lambdas, values in summaries. */
  locals?: Record<string, Value>
  /** Stable clock for now()/today() across one query run. */
  now?: Date
  /**
   * One query run's link resolver over `vault` (see {@link runLinkResolver}),
   * so the run builds the basename table once. Without it each lookup builds
   * its own, which always sees the index as it is now. A relative target
   * ('./sib') is read from `from`'s folder.
   */
  resolveLink?: (target: string, from?: VaultNote) => VaultNote | null
}

/** An {@link EvalContext} plus the state the evaluator keeps for itself. */
interface RunContext extends EvalContext {
  /** Formula names being evaluated, outermost first, for cycle detection. */
  formulaStack?: string[]
}

/**
 * Build a link resolver over `vault` for {@link EvalContext.resolveLink}. The query functions
 * build one per run. A caller of {@link evaluate} that evaluates many expressions against one
 * index passes one, so the basename table is built once. The table is a snapshot taken on first
 * use, so build a new resolver after the index changes.
 */
export function runLinkResolver(
  vault: VaultIndex,
): (target: string, from?: VaultNote) => VaultNote | null {
  const resolve = createLinkResolver(vault)
  return (target, from) => resolve(linkPath(target), from)
}

/**
 * Resolve a link target in `ctx`'s run, as resolveNote does. A relative target
 * is read from `from`, the note the target was written in: the row's note
 * unless the value came from another note's frontmatter.
 */
function resolveIn(ctx: EvalContext, target: string, from: VaultNote = ctx.note): VaultNote | null {
  return ctx.resolveLink ? ctx.resolveLink(target, from) : resolveNote(ctx.vault, target, from)
}

function linkResolver(
  ctx: EvalContext,
  from: VaultNote = ctx.note,
): (target: string) => string | null {
  return (target) => resolveIn(ctx, target, from)?.file.path ?? null
}

/** A URL with a scheme (`https://…`): an external link, never a vault note. */
const EXTERNAL_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Resolve a link target / path to a vault note. Delegates to the scanner's own
 * resolver, so a target resolves here exactly as the same `[[link]]` in a note
 * body resolved into `note.links`; a `#heading` subpath is dropped first, as
 * the scanner drops it. A relative target ('./sib') is read from `from`'s
 * folder, or from the vault root without one.
 */
export function resolveNote(vault: VaultIndex, target: string, from?: VaultNote): VaultNote | null {
  return createLinkResolver(vault)(linkPath(target), from)
}

/**
 * Evaluate a parsed expression against `ctx`.
 *
 * Throws {@link ExpressionEvalError} for a type error, an unknown function or formula, a circular
 * formula or a bad argument. {@link evaluateSafe} returns an {@link ErrorValue} instead.
 */
export function evaluate(expr: Expr, ctx: EvalContext): Value {
  switch (expr.kind) {
    case 'literal':
      return expr.value
    case 'regex': {
      try {
        return new RegexpValue(new RegExp(expr.pattern, expr.flags))
      } catch (e) {
        throw new ExpressionEvalError(`Invalid regex: ${(e as Error).message}`)
      }
    }
    case 'list':
      return expr.items.map((item) => evaluate(item, ctx))
    case 'object': {
      const out: { [key: string]: Value } = {}
      for (const entry of expr.entries) out[entry.key] = evaluate(entry.value, ctx)
      return out
    }
    case 'ident':
      return evalIdent(expr.name, ctx)
    case 'prop':
      return evalMember(expr.object, expr.name, ctx)
    case 'index': {
      // note["x"] / formula["x"] scope access with computed keys.
      if (
        expr.object.kind === 'ident' &&
        (expr.object.name === 'note' || expr.object.name === 'formula')
      ) {
        const key = evaluate(expr.index, ctx)
        if (typeof key !== 'string')
          throw new ExpressionEvalError(`${expr.object.name}[...] requires a string key`)
        return expr.object.name === 'note' ? noteProperty(key, ctx) : evalFormula(key, ctx)
      }
      const object = evaluate(expr.object, ctx)
      const index = evaluate(expr.index, ctx)
      return indexValue(object, index)
    }
    case 'call':
      return callGlobal(expr.name, expr.args, ctx)
    case 'method':
      return callMethod(expr, ctx)
    case 'unary': {
      if (expr.op === '!') return !isTruthy(evaluate(expr.operand, ctx))
      const operand = evaluate(expr.operand, ctx)
      if (typeof operand === 'number') return -operand
      if (operand instanceof DurationValue)
        return new DurationValue(-operand.months, -operand.ms, -operand.calendarDays)
      throw new ExpressionEvalError(`Cannot negate ${typeName(operand)}`)
    }
    case 'binary': {
      switch (expr.op) {
        case '&&': {
          const left = evaluate(expr.left, ctx)
          return isTruthy(left) ? evaluate(expr.right, ctx) : left
        }
        case '||': {
          const left = evaluate(expr.left, ctx)
          return isTruthy(left) ? left : evaluate(expr.right, ctx)
        }
        case '==':
          return valueEquals(evaluate(expr.left, ctx), evaluate(expr.right, ctx))
        case '!=':
          return !valueEquals(evaluate(expr.left, ctx), evaluate(expr.right, ctx))
        case '>':
          return compareValues(evaluate(expr.left, ctx), evaluate(expr.right, ctx)) > 0
        case '<':
          return compareValues(evaluate(expr.left, ctx), evaluate(expr.right, ctx)) < 0
        case '>=':
          return compareValues(evaluate(expr.left, ctx), evaluate(expr.right, ctx)) >= 0
        case '<=':
          return compareValues(evaluate(expr.left, ctx), evaluate(expr.right, ctx)) <= 0
        case '+':
          return addValues(evaluate(expr.left, ctx), evaluate(expr.right, ctx))
        case '-':
          return subtractValues(evaluate(expr.left, ctx), evaluate(expr.right, ctx))
        case '*':
          return multiplyValues(evaluate(expr.left, ctx), evaluate(expr.right, ctx))
        case '/':
          return divideValues(evaluate(expr.left, ctx), evaluate(expr.right, ctx))
        case '%':
          return moduloValues(evaluate(expr.left, ctx), evaluate(expr.right, ctx))
      }
    }
  }
}

/** Evaluate, converting thrown evaluation errors into ErrorValue (per-cell error model). */
export function evaluateSafe(expr: Expr, ctx: EvalContext): Value {
  try {
    return evaluate(expr, ctx)
  } catch (e) {
    if (e instanceof ExpressionEvalError) return new ErrorValue(e.message)
    throw e
  }
}

// ---------------------------------------------------------------------------
// Identifier / property resolution
// ---------------------------------------------------------------------------

function evalIdent(name: string, ctx: EvalContext): Value {
  // Own-property lookup: locals is a plain object, and a plain index would find
  // `constructor` or `toString` on Object.prototype and hand back a function.
  const local = ctx.locals && Object.hasOwn(ctx.locals, name) ? ctx.locals[name] : undefined
  if (local !== undefined) return local
  switch (name) {
    case 'file':
      return new FileValue(ctx.note)
    case 'this':
      return ctx.thisNote ? new FileValue(ctx.thisNote) : null
    // `note` and `formula` are scopes, resolved at member-access level;
    // a bare `note`/`formula` falls through to a frontmatter lookup.
  }
  return noteProperty(name, ctx)
}

function noteProperty(name: string, ctx: EvalContext): Value {
  if (!Object.hasOwn(ctx.note.properties, name)) return null
  return fromFrontmatter(ctx.note.properties[name], linkResolver(ctx))
}

function evalMember(objectExpr: Expr, name: string, ctx: EvalContext): Value {
  // Scope-qualified access: note.x, formula.x
  if (objectExpr.kind === 'ident') {
    if (objectExpr.name === 'note') return noteProperty(name, ctx)
    if (objectExpr.name === 'formula') return evalFormula(name, ctx)
  }
  const object = evaluate(objectExpr, ctx)
  return memberValue(object, name, ctx)
}

function fileMember(note: VaultNote, name: string, ctx: EvalContext): Value {
  const meta = note.file
  switch (name) {
    case 'name':
      return meta.name
    case 'basename':
      return meta.basename
    case 'path':
      return meta.path
    case 'folder':
      return meta.folder
    case 'ext':
      return meta.ext
    case 'size':
      return meta.size
    case 'ctime':
      return new DateValue(meta.ctime, true)
    case 'mtime':
      return new DateValue(meta.mtime, true)
    case 'tags':
      return note.tags.map((t) => `#${t}`)
    case 'links':
      return note.links.map((l) => new LinkValue(l.target, l.display, false, l.path))
    case 'embeds':
      return note.embeds.map((l) => new LinkValue(l.target, l.display, false, l.path))
    case 'backlinks':
      return note.backlinks.map((path) => {
        const linked = ctx.vault.byPath.get(path)
        return linked ? new FileValue(linked) : new LinkValue(path, null, false, path)
      })
    case 'properties':
      return fromFrontmatter(note.properties, linkResolver(ctx, note))
    case 'file':
      // `file.file` / `this.file`: the raw file object.
      return new FileValue(note)
  }
  throw new ExpressionEvalError(`Unknown file property "${name}"`)
}

function memberValue(object: Value, name: string, ctx: EvalContext): Value {
  if (object === null) return null
  if (object instanceof FileValue) return fileMember(object.note, name, ctx)
  if (object instanceof DateValue) {
    const d = object.date
    switch (name) {
      case 'year':
        return d.getFullYear()
      case 'month':
        return d.getMonth() + 1
      case 'day':
        return d.getDate()
      case 'hour':
        return d.getHours()
      case 'minute':
        return d.getMinutes()
      case 'second':
        return d.getSeconds()
      case 'millisecond':
        return d.getMilliseconds()
    }
    throw new ExpressionEvalError(`Unknown date property "${name}"`)
  }
  if (object instanceof DurationValue) {
    switch (name) {
      case 'days':
        return object.totalMs / 86400000
      case 'hours':
        return object.totalMs / 3600000
      case 'minutes':
        return object.totalMs / 60000
      case 'seconds':
        return object.totalMs / 1000
      case 'milliseconds':
        return object.totalMs
    }
    throw new ExpressionEvalError(`Unknown duration property "${name}"`)
  }
  if (typeof object === 'string' && name === 'length') return object.length
  if (isList(object) && name === 'length') return object.length
  if (isPlainObject(object)) return Object.hasOwn(object, name) ? (object[name] ?? null) : null
  if (object instanceof LinkValue) {
    // Property access on a link reads through to the linked file.
    if (name === 'path') return object.resolvedPath ?? object.target
    const linked = object.resolvedPath ? ctx.vault.byPath.get(object.resolvedPath) : null
    if (linked) return fileMember(linked, name, ctx)
    return null
  }
  throw new ExpressionEvalError(`Cannot read property "${name}" of ${typeName(object)}`)
}

function indexValue(object: Value, index: Value): Value {
  if (object === null) return null
  if (isList(object)) {
    if (typeof index !== 'number') throw new ExpressionEvalError('List index must be a number')
    return object[index] ?? null
  }
  if (isPlainObject(object)) {
    if (typeof index !== 'string') throw new ExpressionEvalError('Object key must be a string')
    return Object.hasOwn(object, index) ? (object[index] ?? null) : null
  }
  if (typeof object === 'string') {
    if (typeof index !== 'number') throw new ExpressionEvalError('String index must be a number')
    return object[index] ?? null
  }
  throw new ExpressionEvalError(`Cannot index ${typeName(object)}`)
}

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

function evalFormula(name: string, ctx: EvalContext): Value {
  const source = Object.hasOwn(ctx.formulas, name) ? ctx.formulas[name] : undefined
  if (source === undefined) throw new ExpressionEvalError(`Unknown formula "${name}"`)
  const stack = (ctx as RunContext).formulaStack ?? []
  if (stack.includes(name))
    throw new ExpressionEvalError(`Circular formula reference: ${[...stack, name].join(' → ')}`)
  const expr = parseExpression(source)
  // A formula reads the note, not its caller: the caller's lambda locals
  // (value/index/acc, or a summary's values) would otherwise shadow note
  // properties of the same name, so one formula gave different answers
  // depending on where it was called.
  const formulaCtx: RunContext = { ...ctx, formulaStack: [...stack, name] }
  delete formulaCtx.locals
  return evaluate(expr, formulaCtx)
}

// ---------------------------------------------------------------------------
// Global functions
// ---------------------------------------------------------------------------

function nowDate(ctx: EvalContext): Date {
  return ctx.now ?? new Date()
}

function toFileValue(v: Value, ctx: EvalContext): FileValue | null {
  if (v instanceof FileValue) return v
  if (v instanceof LinkValue) {
    // Every link is resolved where it is made, from the note that holds it. A
    // relative target that failed there must not resolve again from this row.
    if (v.external || !v.resolvedPath) return null
    const note = ctx.vault.byPath.get(v.resolvedPath)
    return note ? new FileValue(note) : null
  }
  if (typeof v === 'string') {
    if (EXTERNAL_URL_RE.test(v)) return null
    const note = resolveIn(ctx, v)
    return note ? new FileValue(note) : null
  }
  return null
}

function callGlobal(name: string, argExprs: Expr[], ctx: EvalContext): Value {
  // Lazy: only if() short-circuits its branches.
  if (name === 'if') {
    // Reading the two required branches is the same test as `length < 2`.
    const [condExpr, thenExpr, elseExpr] = argExprs
    if (condExpr === undefined || thenExpr === undefined || argExprs.length > 3) {
      throw new ExpressionEvalError('if() takes 2 or 3 arguments')
    }
    if (isTruthy(evaluate(condExpr, ctx))) return evaluate(thenExpr, ctx)
    return elseExpr ? evaluate(elseExpr, ctx) : null
  }

  const args = argExprs.map((arg) => evaluate(arg, ctx))
  switch (name) {
    case 'date': {
      const arg = args[0]
      if (arg instanceof DateValue) return arg
      if (typeof arg === 'string') {
        const parsed = parseDate(arg)
        if (!parsed) throw new ExpressionEvalError(`Invalid date: "${arg}"`)
        return parsed
      }
      if (typeof arg === 'number') return new DateValue(new Date(arg), true)
      throw new ExpressionEvalError('date() requires a string')
    }
    case 'duration': {
      const arg = args[0]
      if (arg instanceof DurationValue) return arg
      if (typeof arg === 'string') {
        const parsed = parseDuration(arg)
        if (!parsed) throw new ExpressionEvalError(`Invalid duration: "${arg}"`)
        return parsed
      }
      throw new ExpressionEvalError('duration() requires a string')
    }
    case 'now':
      return new DateValue(nowDate(ctx), true)
    case 'today': {
      const d = nowDate(ctx)
      return new DateValue(localDate(d.getFullYear(), d.getMonth(), d.getDate()), false)
    }
    case 'escapeHTML': {
      const s = toDisplayString(args[0] ?? null)
      return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
    }
    case 'html':
      return new HtmlValue(toDisplayString(args[0] ?? null))
    case 'icon': {
      if (typeof args[0] !== 'string') throw new ExpressionEvalError('icon() requires a string')
      return new IconValue(args[0])
    }
    case 'image': {
      const src = args[0] ?? null
      if (src === null) throw new ExpressionEvalError('image() requires an argument')
      return new ImageValue(src)
    }
    case 'file': {
      const resolved = toFileValue(args[0] ?? null, ctx)
      return resolved
    }
    case 'link': {
      const arg = args[0] ?? null
      const display = args[1] ?? null
      const displayValue =
        display === null
          ? null
          : display instanceof IconValue
            ? display.name
            : toDisplayString(display)
      if (arg instanceof LinkValue)
        return new LinkValue(
          arg.target,
          displayValue ?? arg.display,
          arg.external,
          arg.resolvedPath,
        )
      if (arg instanceof FileValue)
        return new LinkValue(arg.note.file.path, displayValue, false, arg.note.file.path)
      if (typeof arg === 'string') {
        const external = EXTERNAL_URL_RE.test(arg)
        // Accept both bare targets and full [[wikilink]] syntax. Group 1 is
        // required by the pattern and split() always yields a first part, so
        // the `?? arg` fallback is just the "not a wikilink" case. The target
        // keeps a `#heading` subpath for display; the resolver drops it.
        const innerParts = /^\[\[(.*)\]\]$/.exec(arg.trim())?.[1]?.split('|')
        const target = innerParts?.[0]?.trim() ?? arg
        const resolvedPath = external ? null : (resolveIn(ctx, target)?.file.path ?? null)
        return new LinkValue(
          target,
          displayValue ?? innerParts?.[1]?.trim() ?? null,
          external,
          resolvedPath,
        )
      }
      throw new ExpressionEvalError('link() requires a path, file, or URL')
    }
    case 'list': {
      const arg = args[0] ?? null
      if (arg === null) return []
      return isList(arg) ? arg : [arg]
    }
    case 'max':
    case 'min': {
      const numbers = args.map(toNumber)
      if (numbers.length === 0)
        throw new ExpressionEvalError(`${name}() requires at least one argument`)
      return name === 'max' ? Math.max(...numbers) : Math.min(...numbers)
    }
    case 'number':
      return toNumber(args[0] ?? null)
    case 'random':
      return Math.random()
  }
  throw new ExpressionEvalError(`Unknown function "${name}"`)
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

const LAZY_LIST_METHODS = new Set(['filter', 'map', 'reduce'])

function callMethod(expr: MethodExpr, ctx: EvalContext): Value {
  const object = evaluate(expr.object, ctx)
  const name = expr.name

  // List lambdas receive raw expressions with implicit value/index/acc vars.
  if (LAZY_LIST_METHODS.has(name)) {
    if (isList(object)) return listLambda(object, expr, ctx)
    // On a missing list the lambda has no items to bind value/index/acc to, so
    // it must not run at all: evaluated bare, those names read note properties
    // and a null-unsafe body throws before the missing-value rule below.
    if (object === null) return null
  }

  const args = expr.args.map((arg) => evaluate(arg, ctx))

  // Any-type methods.
  switch (name) {
    case 'toString':
      return toDisplayString(object)
    case 'isTruthy':
      return isTruthy(object)
    case 'isType': {
      if (typeof args[0] !== 'string') throw new ExpressionEvalError('isType() requires a string')
      return typeName(object) === args[0].toLowerCase()
    }
    case 'isEmpty':
      return isEmptyValue(object)
  }

  if (object === null) {
    // Methods on missing values follow the type they'd have; be permissive:
    // boolean-returning predicates are false, everything else stays null.
    if (
      [
        'contains',
        'containsAll',
        'containsAny',
        'startsWith',
        'endsWith',
        'hasTag',
        'hasLink',
        'hasProperty',
        'inFolder',
        'linksTo',
        'matches',
      ].includes(name)
    ) {
      return false
    }
    return null
  }

  if (typeof object === 'string') return stringMethod(object, name, args)
  if (typeof object === 'number') return numberMethod(object, name, args)
  if (isList(object)) return listMethod(object, name, args)
  if (object instanceof DateValue) return dateMethod(object, name, args, ctx)
  if (object instanceof FileValue) return fileMethod(object, name, args, ctx)
  if (object instanceof LinkValue) return linkMethod(object, name, args, ctx)
  if (object instanceof RegexpValue) return regexpMethod(object, name, args)
  if (isPlainObject(object)) return objectMethod(object, name)

  throw new ExpressionEvalError(`Unknown method "${name}" on ${typeName(object)}`)
}

// These take `Value | undefined` because a missing argument — args[1] on a
// one-argument call — is one of the shapes they exist to reject, and the
// typeof test already rejects it with the right message.
function requireString(v: Value | undefined, method: string): string {
  if (typeof v !== 'string') throw new ExpressionEvalError(`${method}() requires a string argument`)
  return v
}

function requireNumber(v: Value | undefined, method: string): number {
  if (typeof v !== 'number') throw new ExpressionEvalError(`${method}() requires a number argument`)
  return v
}

function stringMethod(s: string, name: string, args: Value[]): Value {
  switch (name) {
    case 'contains':
      return s.includes(requireString(args[0], 'contains'))
    case 'containsAll':
      return args.every((a) => s.includes(requireString(a, 'containsAll')))
    case 'containsAny':
      return args.some((a) => s.includes(requireString(a, 'containsAny')))
    case 'startsWith':
      return s.startsWith(requireString(args[0], 'startsWith'))
    case 'endsWith':
      return s.endsWith(requireString(args[0], 'endsWith'))
    case 'lower':
      return s.toLowerCase()
    case 'title':
      return s.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    case 'trim':
      return s.trim()
    case 'reverse':
      return [...s].reverse().join('')
    case 'repeat': {
      const count = requireNumber(args[0], 'repeat')
      if (!Number.isFinite(count) || count < 0) {
        throw new ExpressionEvalError('repeat() requires a non-negative count')
      }
      if (s.length * count > MAX_REPEAT_RESULT_LENGTH) {
        throw new ExpressionEvalError(
          `repeat() result would exceed ${MAX_REPEAT_RESULT_LENGTH} characters`,
        )
      }
      return s.repeat(count)
    }
    case 'slice': {
      const start = requireNumber(args[0] ?? 0, 'slice')
      const end = args.length > 1 ? requireNumber(args[1], 'slice') : undefined
      return s.slice(start, end)
    }
    case 'split': {
      const sep = args[0]
      const limit = args.length > 1 ? requireNumber(args[1], 'split') : undefined
      if (sep instanceof RegexpValue) return s.split(sep.regex, limit)
      return s.split(requireString(sep, 'split'), limit)
    }
    case 'replace': {
      const pattern = args[0]
      const replacement = toDisplayString(args[1] ?? null)
      if (pattern instanceof RegexpValue) return s.replace(pattern.regex, replacement)
      // String patterns replace ALL occurrences.
      return s.replaceAll(requireString(pattern, 'replace'), replacement)
    }
    case 'matches': {
      // Symmetric convenience: "abc".matches(/b/) — mirror of regexp.matches.
      const pattern = args[0]
      if (pattern instanceof RegexpValue) return regexpMethod(pattern, 'matches', [s])
      throw new ExpressionEvalError('matches() requires a regex argument')
    }
  }
  throw new ExpressionEvalError(`Unknown method "${name}" on string`)
}

function numberMethod(n: number, name: string, args: Value[]): Value {
  switch (name) {
    case 'abs':
      return Math.abs(n)
    case 'ceil':
      return Math.ceil(n)
    case 'floor':
      return Math.floor(n)
    case 'round': {
      if (args.length === 0) return Math.round(n)
      const digits = requireNumber(args[0], 'round')
      const factor = 10 ** digits
      return Math.round(n * factor) / factor
    }
    case 'toFixed': {
      const digits = requireNumber(args[0] ?? 0, 'toFixed')
      if (!Number.isFinite(digits) || digits < 0 || digits > 100) {
        throw new ExpressionEvalError('toFixed() requires digits between 0 and 100')
      }
      return n.toFixed(digits)
    }
  }
  throw new ExpressionEvalError(`Unknown method "${name}" on number`)
}

function listLambda(list: Value[], expr: MethodExpr, ctx: EvalContext): Value {
  const name = expr.name
  // Reading the lambda is the "too few arguments" half of the arity check.
  const [lambda, initial] = expr.args
  if (name === 'filter' || name === 'map') {
    if (lambda === undefined || expr.args.length > 1)
      throw new ExpressionEvalError(`${name}() takes exactly one expression`)
    const results: Value[] = []
    for (const [index, value] of list.entries()) {
      const itemCtx: EvalContext = { ...ctx, locals: { ...ctx.locals, value, index } }
      const result = evaluate(lambda, itemCtx)
      if (name === 'map') results.push(result)
      else if (isTruthy(result)) results.push(value)
    }
    return results
  }
  // reduce(expr, initial)
  if (lambda === undefined || expr.args.length > 2)
    throw new ExpressionEvalError('reduce() takes an expression and an optional initial value')
  let acc: Value = initial !== undefined ? evaluate(initial, ctx) : null
  for (const [index, value] of list.entries()) {
    const itemCtx: EvalContext = { ...ctx, locals: { ...ctx.locals, value, index, acc } }
    acc = evaluate(lambda, itemCtx)
  }
  return acc
}

/**
 * The numbers in a list for the numeric aggregates: missing and error entries
 * are skipped, and so is anything toNumber rejects, matching the leniency of
 * the builtin summaries.
 */
function listNumbers(list: Value[]): number[] {
  const numbers: number[] = []
  for (const item of list) {
    if (item === null || item instanceof ErrorValue) continue
    try {
      numbers.push(toNumber(item))
    } catch (e) {
      if (!(e instanceof ExpressionEvalError)) throw e
    }
  }
  return numbers
}

function listMethod(list: Value[], name: string, args: Value[]): Value {
  switch (name) {
    case 'contains':
      return list.some((item) => valueEquals(item, args[0] ?? null))
    case 'containsAll':
      return args.every((a) => list.some((item) => valueEquals(item, a)))
    case 'containsAny':
      return args.some((a) => list.some((item) => valueEquals(item, a)))
    case 'join':
      return list.map(toDisplayString).join(args.length > 0 ? requireString(args[0], 'join') : ', ')
    case 'reverse':
      return [...list].reverse()
    case 'flat': {
      const flatten = (items: Value[]): Value[] =>
        items.flatMap((item) => (isList(item) ? flatten(item) : [item]))
      return flatten(list)
    }
    case 'unique': {
      const out: Value[] = []
      for (const item of list) {
        if (!out.some((seen) => valueEquals(seen, item))) out.push(item)
      }
      return out
    }
    case 'sort':
      return [...list].sort((a, b) => {
        try {
          return compareValues(a, b)
        } catch {
          return toDisplayString(a).localeCompare(toDisplayString(b))
        }
      })
    case 'slice': {
      const start = requireNumber(args[0] ?? 0, 'slice')
      const end = args.length > 1 ? requireNumber(args[1], 'slice') : undefined
      return list.slice(start, end)
    }
    // Numeric aggregates (used by summary formulas; mean() appears in official docs).
    // A summary's `values` holds one entry per row, null where the property is
    // missing and an error where the cell failed, so these count only the
    // numbers — the same entries the builtin summaries in query.ts keep.
    case 'sum':
      return listNumbers(list).reduce((total, n) => total + n, 0)
    case 'mean':
    case 'average': {
      const numbers = listNumbers(list)
      if (numbers.length === 0) return null
      return numbers.reduce((total, n) => total + n, 0) / numbers.length
    }
    case 'median': {
      const sorted = listNumbers(list).sort((a, b) => a - b)
      if (sorted.length === 0) return null
      const mid = Math.floor(sorted.length / 2)
      // An even-length list averages its two middle entries, an odd-length one
      // takes the single middle entry; slicing keeps both reads in range.
      const middle = sorted.slice(sorted.length % 2 === 0 ? mid - 1 : mid, mid + 1)
      return middle.reduce((total, n) => total + n, 0) / middle.length
    }
    case 'stddev': {
      const numbers = listNumbers(list)
      if (numbers.length === 0) return null
      const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length
      return Math.sqrt(numbers.reduce((total, x) => total + (x - mean) ** 2, 0) / numbers.length)
    }
  }
  throw new ExpressionEvalError(`Unknown method "${name}" on list`)
}

function dateMethod(d: DateValue, name: string, args: Value[], ctx: EvalContext): Value {
  switch (name) {
    case 'date':
      return new DateValue(
        localDate(d.date.getFullYear(), d.date.getMonth(), d.date.getDate()),
        false,
      )
    case 'time': {
      const pad = (n: number): string => String(n).padStart(2, '0')
      return `${pad(d.date.getHours())}:${pad(d.date.getMinutes())}:${pad(d.date.getSeconds())}`
    }
    case 'format':
      return formatDateMoment(d.date, requireString(args[0], 'format'))
    case 'relative':
      return formatRelative(d.date, nowDate(ctx))
  }
  throw new ExpressionEvalError(`Unknown method "${name}" on date`)
}

function normalizeTag(tag: string): string {
  return tag.replace(/^#/, '').toLowerCase()
}

function fileMethod(file: FileValue, name: string, args: Value[], ctx: EvalContext): Value {
  const note = file.note
  switch (name) {
    case 'asLink': {
      const display = args.length > 0 ? toDisplayString(args[0] ?? null) : null
      return new LinkValue(note.file.path, display, false, note.file.path)
    }
    case 'hasTag': {
      // Any-of; nested tags match their parents (#a/b matches "a").
      return args.some((arg) => {
        const query = normalizeTag(requireString(arg, 'hasTag'))
        return note.tags.some((tag) => {
          const t = normalizeTag(tag)
          return t === query || t.startsWith(`${query}/`)
        })
      })
    }
    case 'hasLink': {
      const target = args[0] ?? null
      return [...note.links, ...note.embeds].some((ref) => {
        if (target instanceof FileValue) return ref.path === target.note.file.path
        if (target instanceof LinkValue) {
          return target.resolvedPath
            ? ref.path === target.resolvedPath
            : // The scanner's ref.target has no `#heading` subpath; a URL keeps
              // its `#fragment`.
              ref.target === (target.external ? target.target : linkPath(target.target))
        }
        if (typeof target === 'string') {
          // A URL is compared as written: resolving it would match a vault
          // note by the URL's last path segment.
          const resolved = EXTERNAL_URL_RE.test(target) ? null : resolveIn(ctx, target)
          if (resolved) return ref.path === resolved.file.path
          return ref.target === target
        }
        return false
      })
    }
    case 'hasProperty':
      return Object.hasOwn(note.properties, requireString(args[0], 'hasProperty'))
    case 'inFolder': {
      const folder = requireString(args[0], 'inFolder').replace(/\/+$/, '')
      if (folder === '' || folder === '/') return true
      return note.file.folder === folder || note.file.folder.startsWith(`${folder}/`)
    }
  }
  throw new ExpressionEvalError(`Unknown method "${name}" on file`)
}

function linkMethod(link: LinkValue, name: string, args: Value[], ctx: EvalContext): Value {
  switch (name) {
    case 'asFile':
      return toFileValue(link, ctx)
    case 'linksTo': {
      const file = toFileValue(link, ctx)
      if (!file) return false
      return fileMethod(file, 'hasLink', args, ctx) as boolean
    }
  }
  throw new ExpressionEvalError(`Unknown method "${name}" on link`)
}

function regexpMethod(regexp: RegexpValue, name: string, args: Value[]): Value {
  switch (name) {
    case 'matches': {
      const value = args[0]
      if (typeof value !== 'string') return false
      // Reset lastIndex so a /g regex is reusable across rows.
      regexp.regex.lastIndex = 0
      return regexp.regex.test(value)
    }
  }
  throw new ExpressionEvalError(`Unknown method "${name}" on regexp`)
}

function objectMethod(object: { [key: string]: Value }, name: string): Value {
  switch (name) {
    case 'keys':
      return Object.keys(object)
    case 'values':
      return Object.values(object)
  }
  throw new ExpressionEvalError(`Unknown method "${name}" on object`)
}
