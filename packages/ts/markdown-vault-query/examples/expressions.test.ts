import { createVaultIndex } from '@osdlc/markdown-vault'
import { expect, test } from 'vitest'

import {
  ErrorValue,
  ExpressionError,
  ExpressionEvalError,
  evaluate,
  evaluateSafe,
  parseExpression,
  resolveNote,
  runLinkResolver,
  tokenize,
  type BinaryExpr,
  type BinaryOp,
  type CallExpr,
  type EvalContext,
  type Expr,
  type IdentExpr,
  type IndexExpr,
  type ListExpr,
  type LiteralExpr,
  type MethodExpr,
  type ObjectExpr,
  type PropExpr,
  type RegexExpr,
  type Token,
  type TokenType,
  type UnaryExpr,
} from '@osdlc/markdown-vault-query'

const vault = createVaultIndex([
  { path: 'tasks/a.md', frontmatter: { status: 'open', points: 3 }, tags: ['work'] },
  { path: 'people/Ada.md' },
])
const note = vault.byPath.get('tasks/a.md')!
const ctx: EvalContext = { note, vault, formulas: { triple: 'points * 3' } }

test('parseExpression and evaluate run an expression against a note', () => {
  const expr: Expr = parseExpression('points * 2 + 1')

  expect(evaluate(expr, ctx)).toBe(7)
  expect(evaluate(parseExpression('formula.triple'), ctx)).toBe(9)
  expect(evaluate(parseExpression('file.hasTag("work")'), ctx)).toBe(true)
})

test('parseExpression throws ExpressionError with the position', () => {
  const error = (() => {
    try {
      parseExpression('points *')
    } catch (e) {
      return e
    }
  })()

  expect(error).toBeInstanceOf(ExpressionError)
  expect((error as ExpressionError).input).toBe('points *')
  expect((error as ExpressionError).position).toBeGreaterThan(0)
})

test('evaluate throws ExpressionEvalError and evaluateSafe returns an ErrorValue', () => {
  const expr = parseExpression('missing()')

  expect(() => evaluate(expr, ctx)).toThrow(ExpressionEvalError)
  const safe = evaluateSafe(expr, ctx)
  expect(safe).toBeInstanceOf(ErrorValue)
  expect((safe as ErrorValue).message).toBe('Unknown function "missing"')
})

test('runLinkResolver builds one resolver for many evaluations', () => {
  const resolveLink = runLinkResolver(vault)
  const withResolver: EvalContext = { ...ctx, resolveLink }

  expect(resolveLink('Ada')?.file.path).toBe('people/Ada.md')
  expect(evaluate(parseExpression('link("Ada").asFile().name'), withResolver)).toBe('Ada.md')
})

test('resolveNote resolves a link target the way the scanner does', () => {
  expect(resolveNote(vault, 'Ada')?.file.path).toBe('people/Ada.md')
  expect(resolveNote(vault, 'Ada#Heading')?.file.path).toBe('people/Ada.md')
  expect(resolveNote(vault, 'Nobody')).toBeNull()
})

// The experimental exports: the lexer and the node types of the syntax tree.
test('experimental: tokenize splits an expression into tokens', () => {
  const tokens: Token[] = tokenize('a >= 1')
  const types: TokenType[] = tokens.map((token) => token.type)

  expect(types).toEqual(['IDENT', 'OP', 'NUMBER', 'EOF'])
})

test('experimental: the parser returns the node types of the syntax tree', () => {
  const op: BinaryOp = '+'
  const sum = parseExpression('1 + x') as BinaryExpr
  const literal = sum.left as LiteralExpr
  const ident = sum.right as IdentExpr
  const negated = parseExpression('-x') as UnaryExpr
  const regex = parseExpression('/a+/i') as RegexExpr
  const list = parseExpression('[1, 2]') as ListExpr
  const object = parseExpression('{"a": 1}') as ObjectExpr
  const prop = parseExpression('file.name') as PropExpr
  const index = parseExpression('list[0]') as IndexExpr
  const call = parseExpression('today()') as CallExpr
  const method = parseExpression('name.lower()') as MethodExpr

  expect(sum.op).toBe(op)
  expect([literal.kind, ident.kind, negated.kind]).toEqual(['literal', 'ident', 'unary'])
  expect([regex.kind, list.kind, object.kind]).toEqual(['regex', 'list', 'object'])
  expect([prop.kind, index.kind, call.kind, method.kind]).toEqual([
    'prop',
    'index',
    'call',
    'method',
  ])
})
