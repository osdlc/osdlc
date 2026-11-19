/**
 * Filters: the JSON shape, and the short string form the command line and a URL use.
 *
 * ```text
 * filter = term *( space term )
 * term   = field op value
 * field  = [ "@" ] name *( "." name )      no space, and none of = ! ~ < >
 * op     = "=" | "!=" | "~" | "!~" | ">" | ">=" | "<" | "<="
 * value  = item *( "," item )              a list only after = and !=
 * item   = bare | '"' text '"'             in quotes, \" is a quote and \\ a backslash
 * ```
 */
import { QueryError } from './model.ts'

/**
 * How a filter compares a field with its value.
 *
 * @experimental
 */
export type FilterOp =
  'eq' | 'ne' | 'in' | 'nin' | 'contains' | 'ncontains' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists'

/**
 * One condition on a record. Every filter of a query must hold.
 *
 * @experimental
 */
export interface Filter {
  /** A data field, a path into one (`scope.since`), or a record fact such as `@id`. */
  field: string
  /** How to compare. Default `eq` when a filter is written as JSON. */
  op: FilterOp
  /** The value to compare with: a list for `in` and `nin`, a boolean for `exists`. */
  value?: unknown
}

const OPS: readonly [string, FilterOp][] = [
  ['!=', 'ne'],
  ['!~', 'ncontains'],
  ['>=', 'gte'],
  ['<=', 'lte'],
  ['=', 'eq'],
  ['~', 'contains'],
  ['>', 'gt'],
  ['<', 'lt'],
]
const SIGN = new Map<FilterOp, string>([
  ...OPS.map(([sign, op]): [FilterOp, string] => [op, sign]),
  ['in', '='],
  ['nin', '!='],
])

const bad = (term: string, why: string): QueryError =>
  new QueryError('bad-filter', `'${term}': ${why}`)

/** The items of a value: split at commas outside quotes when `split`, each one unquoted. */
function items(term: string, value: string, split: boolean): string[] {
  const out: string[] = []
  let i = 0
  for (;;) {
    let item = ''
    if (value[i] === '"') {
      i++
      for (; ; i++) {
        const c = value[i]
        if (c === undefined) throw bad(term, 'unterminated quote')
        if (c === '"') break
        if (c === '\\' && (value[i + 1] === '"' || value[i + 1] === '\\')) i++
        item += value[i]
      }
      i++
      if (i < value.length && !(split && value[i] === ','))
        throw bad(term, 'text after the closing quote')
    } else {
      const end = split ? value.indexOf(',', i) : -1
      item = value.slice(i, end === -1 ? value.length : end)
      i = end === -1 ? value.length : end
    }
    out.push(item)
    if (i >= value.length) return out
    i++
  }
}

/**
 * One term of the string form as a filter: `status=done`, `kind~claim`, `confidence>=0.7`. The
 * value runs to the end of `term`, so a term that is one argument or one URL parameter needs no
 * quotes around a value with spaces.
 *
 * - `field=value` and `field!=value`: equal, not equal. A comma makes a list: one of, none of.
 * - `field=` and `field!=`: the field has no value, the field has one.
 * - `field~text` and `field!~text`: contains, does not contain, without regard to case.
 * - `field>value`, `>=`, `<`, `<=`: numbers by size, strings (ISO dates too) by code unit.
 *
 * @throws QueryError `bad-filter`, with one of these messages after `'<term>': `:
 *   `empty filter term`; `no operator; write <field><op><value> with one of = != ~ !~ > >= < <=`;
 *   `no field before '<op>'`; `'!' must be followed by '=' or '~'`; `'<op>' needs a value`;
 *   `unterminated quote`; `text after the closing quote`.
 * @experimental
 */
export function parseTerm(term: string): Filter {
  if (term.trim() === '') throw new QueryError('bad-filter', 'empty filter term')
  const at = term.search(/[=!~<>]/)
  if (at === -1)
    throw bad(term, 'no operator; write <field><op><value> with one of = != ~ !~ > >= < <=')
  const found = OPS.find(([sign]) => term.startsWith(sign, at))
  if (found === undefined) throw bad(term, `'!' must be followed by '=' or '~'`)
  const [sign, op] = found
  const field = term.slice(0, at).trim()
  if (field === '') throw bad(term, `no field before '${sign}'`)
  const value = term.slice(at + sign.length)
  if (op === 'eq' || op === 'ne') {
    if (value === '') return { field, op: 'exists', value: op === 'ne' }
    const list = items(term, value, true)
    if (list.length > 1) return { field, op: op === 'eq' ? 'in' : 'nin', value: list }
    return { field, op, value: list[0] }
  }
  if (value === '') throw bad(term, `'${sign}' needs a value`)
  return { field, op, value: items(term, value, false)[0] }
}

/**
 * A whole filter in the string form, such as `status=done kind~claim confidence>=0.7`, as
 * filters. Terms are split at spaces outside quotes, so a value with a space is quoted:
 * `harness="Claude Code"`.
 *
 * @throws QueryError `bad-filter`, as `parseTerm`.
 * @experimental
 */
export function parseFilter(text: string): Filter[] {
  const terms: string[] = []
  let term = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (quoted && c === '\\' && i + 1 < text.length) term += c + text[++i]
    else if (c === '"') {
      quoted = !quoted
      term += c
    } else if (!quoted && /\s/.test(c)) {
      if (term !== '') terms.push(term)
      term = ''
    } else term += c
  }
  if (term !== '') terms.push(term)
  return terms.map(parseTerm)
}

const quote = (v: unknown, inList: boolean): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s === '' || /[\s"]/.test(s) || (inList && s.includes(',')) || s.startsWith('"')
    ? `"${s.replace(/[\\"]/g, '\\$&')}"`
    : s
}

/**
 * A filter in the string form. `parseFilter` reads it back to an equal filter when its values
 * are strings.
 *
 * @experimental
 */
export function formatFilter(filter: Filter): string {
  if (filter.op === 'exists') return `${filter.field}${filter.value === false ? '=' : '!='}`
  const sign = SIGN.get(filter.op) as string
  if (filter.op === 'in' || filter.op === 'nin')
    return `${filter.field}${sign}${(Array.isArray(filter.value) ? filter.value : [filter.value]).map((v) => quote(v, true)).join(',')}`
  return `${filter.field}${sign}${quote(filter.value, filter.op === 'eq' || filter.op === 'ne')}`
}

const OP_NAMES = new Set<string>(SIGN.keys()).add('exists')

/**
 * The filters of a query's `where`: a string in the string form, a list of terms, a list of
 * filters, or a mix of the two.
 *
 * @throws QueryError `bad-filter` for a term that does not parse, `bad-query` for a value that
 *   is neither a string nor a filter.
 */
export function filtersOf(where: unknown): Filter[] {
  if (where === undefined || where === null) return []
  if (typeof where === 'string') return parseFilter(where)
  if (!Array.isArray(where))
    throw new QueryError('bad-query', `where: expected a string or a list, got ${typeof where}`)
  return where.map((w: unknown, i): Filter => {
    if (typeof w === 'string') return parseTerm(w)
    const f = w as Partial<Filter> | null
    if (typeof f !== 'object' || f === null || typeof f.field !== 'string' || f.field === '')
      throw new QueryError(
        'bad-query',
        `where[${i}]: expected a term such as "status=done" or { field, op, value }`,
      )
    const op = f.op ?? 'eq'
    if (!OP_NAMES.has(op))
      throw new QueryError(
        'bad-query',
        `where[${i}]: no op '${String(op)}'; ops: ${[...OP_NAMES].join(', ')}`,
      )
    if ((op === 'in' || op === 'nin') && !Array.isArray(f.value))
      throw new QueryError('bad-query', `where[${i}]: '${op}' takes a list of values`)
    if (op !== 'exists' && f.value === undefined)
      throw new QueryError('bad-query', `where[${i}]: '${op}' needs a value`)
    return { field: f.field, op, value: op === 'exists' ? f.value !== false : f.value }
  })
}
