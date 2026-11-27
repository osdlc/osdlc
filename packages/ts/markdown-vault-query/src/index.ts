/**
 * @osdlc/markdown-vault-query: a query engine over a markdown vault.
 *
 * Parse Obsidian Bases (`.base`) files and run their filters, formulas, views, and summaries
 * against a markdown vault, entirely in memory.
 *
 * ```ts
 * import { readFile } from 'node:fs/promises'
 * import { scanVault } from '@osdlc/markdown-vault'
 * import { parseBase, runView } from '@osdlc/markdown-vault-query'
 *
 * const vault = await scanVault('/path/to/vault')
 * const base = parseBase(await readFile('tasks.base', 'utf8'))
 * const { rows } = runView(vault, base, 'All tasks')
 * ```
 */

// .base file parsing
export {
  parseBase,
  extractEmbeddedBases,
  BaseParseError,
  type BaseDef,
  type BaseViewDef,
  type FilterNode,
  type SortKey,
} from './base/parse.ts'

// Expression language
export { parseExpression, ExpressionError } from './expr/parser.ts'
export type * from './expr/ast.ts'
export { tokenize, type Token, type TokenType } from './expr/lexer.ts'
export {
  evaluate,
  evaluateSafe,
  resolveNote,
  runLinkResolver,
  type EvalContext,
} from './expr/eval.ts'
export {
  DateValue,
  DurationValue,
  LinkValue,
  FileValue,
  RegexpValue,
  HtmlValue,
  ImageValue,
  IconValue,
  ErrorValue,
  ExpressionEvalError,
  isTruthy,
  isEmptyValue,
  valueEquals,
  compareValues,
  toDisplayString,
  toNumber,
  typeName,
  parseDate,
  parseDuration,
  fromFrontmatter,
  type LinkResolver,
  type Value,
} from './expr/values.ts'
export { formatDateMoment, formatRelative } from './expr/format-date.ts'

// Query execution
export {
  runView,
  queryBase,
  queryExpression,
  queryVault,
  selectView,
  matchesFilter,
  evaluatePropertyId,
  type QueryOptions,
  type FilterQueryOptions,
  type FilterQueryResult,
  type ViewResult,
  type ViewRow,
  type ViewGroup,
} from './query.ts'
