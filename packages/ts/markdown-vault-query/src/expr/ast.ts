/**
 * Expression AST for the Obsidian Bases expression language.
 *
 * Unlike a filter-only AST, every node is an expression producing a value;
 * filters are just expressions whose result is coerced to a boolean.
 */

/**
 * A parsed expression: the union of the node types below. Pass it to {@link evaluate}.
 *
 * @experimental The node types follow the expression grammar, which may change in a minor release.
 */
export type Expr =
  | LiteralExpr
  | RegexExpr
  | ListExpr
  | ObjectExpr
  | IdentExpr
  | PropExpr
  | IndexExpr
  | CallExpr
  | MethodExpr
  | UnaryExpr
  | BinaryExpr

/**
 * A string, number, boolean or null literal.
 *
 * @experimental See {@link Expr}.
 */
export interface LiteralExpr {
  kind: 'literal'
  value: string | number | boolean | null
}

/**
 * Regex literal: `/pattern/flags`.
 *
 * @experimental See {@link Expr}.
 */
export interface RegexExpr {
  kind: 'regex'
  pattern: string
  flags: string
}

/**
 * List literal: `[1, 2]`.
 *
 * @experimental See {@link Expr}.
 */
export interface ListExpr {
  kind: 'list'
  items: Expr[]
}

/**
 * Object literal: `{"a": 1, "b": 2}`.
 *
 * @experimental See {@link Expr}.
 */
export interface ObjectExpr {
  kind: 'object'
  entries: Array<{ key: string; value: Expr }>
}

/**
 * Bare identifier: a note property, a scope root (file/formula/this/note), or a lambda variable (value/index).
 *
 * @experimental See {@link Expr}.
 */
export interface IdentExpr {
  kind: 'ident'
  name: string
}

/**
 * Dotted access that is not a call: `file.name`, `note.status`, `formula.total`.
 *
 * @experimental See {@link Expr}.
 */
export interface PropExpr {
  kind: 'prop'
  object: Expr
  name: string
}

/**
 * Bracket access: `list[0]`, `file.properties["due date"]`.
 *
 * @experimental See {@link Expr}.
 */
export interface IndexExpr {
  kind: 'index'
  object: Expr
  index: Expr
}

/**
 * Global function call: `today()`, `date("2025-01-01")`, `if(x, a, b)`.
 *
 * @experimental See {@link Expr}.
 */
export interface CallExpr {
  kind: 'call'
  name: string
  args: Expr[]
}

/**
 * Method call on a receiver: `file.hasTag("x")`, `status.lower()`, `list.filter(value > 2)`.
 *
 * @experimental See {@link Expr}.
 */
export interface MethodExpr {
  kind: 'method'
  object: Expr
  name: string
  args: Expr[]
}

/**
 * Unary `!` or `-`.
 *
 * @experimental See {@link Expr}.
 */
export interface UnaryExpr {
  kind: 'unary'
  op: '!' | '-'
  operand: Expr
}

/**
 * The binary operators: comparison, boolean logic and arithmetic.
 *
 * @experimental See {@link Expr}.
 */
export type BinaryOp =
  '==' | '!=' | '>' | '<' | '>=' | '<=' | '&&' | '||' | '+' | '-' | '*' | '/' | '%'

/**
 * A binary operation: `a + b`, `a && b`.
 *
 * @experimental See {@link Expr}.
 */
export interface BinaryExpr {
  kind: 'binary'
  op: BinaryOp
  left: Expr
  right: Expr
}
