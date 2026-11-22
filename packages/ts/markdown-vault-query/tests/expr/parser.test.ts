import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseExpression, ExpressionError } from '../../src/expr/parser.ts'
import type { BinaryExpr, MethodExpr } from '../../src/expr/ast.ts'

test('parses comparison of property and string', () => {
  const expr = parseExpression('status == "active"') as BinaryExpr
  assert.equal(expr.kind, 'binary')
  assert.equal(expr.op, '==')
  assert.deepEqual(expr.left, { kind: 'ident', name: 'status' })
  assert.deepEqual(expr.right, { kind: 'literal', value: 'active' })
})

test('parses dotted property access', () => {
  const expr = parseExpression('file.ext != "base"') as BinaryExpr
  assert.deepEqual(expr.left, {
    kind: 'prop',
    object: { kind: 'ident', name: 'file' },
    name: 'ext',
  })
})

test('parses method calls with arguments', () => {
  const expr = parseExpression('file.inFolder("planning/tasks")') as MethodExpr
  assert.equal(expr.kind, 'method')
  assert.equal(expr.name, 'inFolder')
  assert.deepEqual(expr.args, [{ kind: 'literal', value: 'planning/tasks' }])
})

test('parses chained methods', () => {
  const expr = parseExpression('title.lower().contains("x")') as MethodExpr
  assert.equal(expr.kind, 'method')
  assert.equal(expr.name, 'contains')
  const inner = expr.object as MethodExpr
  assert.equal(inner.kind, 'method')
  assert.equal(inner.name, 'lower')
})

test('respects operator precedence', () => {
  const expr = parseExpression('a + b * c == d && e || f') as BinaryExpr
  assert.equal(expr.op, '||')
  const left = expr.left as BinaryExpr
  assert.equal(left.op, '&&')
  const cmp = left.left as BinaryExpr
  assert.equal(cmp.op, '==')
  const sum = cmp.left as BinaryExpr
  assert.equal(sum.op, '+')
  const product = sum.right as BinaryExpr
  assert.equal(product.op, '*')
})

test('parses unary negation and not', () => {
  assert.deepEqual(parseExpression('!done'), {
    kind: 'unary',
    op: '!',
    operand: { kind: 'ident', name: 'done' },
  })
  assert.deepEqual(parseExpression('-price'), {
    kind: 'unary',
    op: '-',
    operand: { kind: 'ident', name: 'price' },
  })
})

test('parses grouped expressions', () => {
  const expr = parseExpression('(a || b) && c') as BinaryExpr
  assert.equal(expr.op, '&&')
  assert.equal((expr.left as BinaryExpr).op, '||')
})

test('parses global function calls', () => {
  assert.deepEqual(parseExpression('today()'), { kind: 'call', name: 'today', args: [] })
  const iff = parseExpression('if(done, "yes", "no")')
  assert.equal(iff.kind, 'call')
  assert.equal((iff as { args: unknown[] }).args.length, 3)
})

test('parses list literals', () => {
  const expr = parseExpression('["a", "b"].contains(status)') as MethodExpr
  assert.equal(expr.kind, 'method')
  assert.equal(expr.object.kind, 'list')
})

test('parses bracket property access', () => {
  const expr = parseExpression('note["foo-bar"] == 1') as BinaryExpr
  assert.deepEqual(expr.left, {
    kind: 'index',
    object: { kind: 'ident', name: 'note' },
    index: { kind: 'literal', value: 'foo-bar' },
  })
})

test('parses numeric literals including decimals and negatives', () => {
  assert.deepEqual(parseExpression('1.5'), { kind: 'literal', value: 1.5 })
  const neg = parseExpression('-2')
  assert.deepEqual(neg, { kind: 'unary', op: '-', operand: { kind: 'literal', value: 2 } })
})

test('parses booleans and null keywords', () => {
  assert.deepEqual(parseExpression('true'), { kind: 'literal', value: true })
  assert.deepEqual(parseExpression('null'), { kind: 'literal', value: null })
})

test('treats dash as subtraction, not identifier character', () => {
  const expr = parseExpression('a-b') as BinaryExpr
  assert.equal(expr.op, '-')
})

test('parses lambda-style filter arguments using value keyword', () => {
  const expr = parseExpression('tags.filter(value != "draft")') as MethodExpr
  assert.equal(expr.name, 'filter')
  const arg = expr.args[0] as BinaryExpr
  assert.equal(arg.op, '!=')
  assert.deepEqual(arg.left, { kind: 'ident', name: 'value' })
})

test('parses string escapes', () => {
  assert.deepEqual(parseExpression('"a\\"b"'), { kind: 'literal', value: 'a"b' })
  assert.deepEqual(parseExpression("'it\\'s'"), { kind: 'literal', value: "it's" })
})

test('rejects malformed input', () => {
  assert.throws(() => parseExpression('status =='), ExpressionError)
  assert.throws(() => parseExpression('(a'), ExpressionError)
  assert.throws(() => parseExpression('"unterminated'), ExpressionError)
  assert.throws(() => parseExpression('a ~ b'), ExpressionError)
})

test('memoizes repeated parses but evicts under a flood of distinct expressions', () => {
  // queryVault/queryExpression pass caller-supplied filter strings straight in,
  // so the memo table must not grow with every distinct string a long-lived
  // process ever sees.
  const probe = 'file.name == "cache-probe"'
  const first = parseExpression(probe)
  assert.equal(parseExpression(probe), first, 'a repeat parse is memoized')

  // More distinct expressions than the cache holds; the probe is the least
  // recently used entry by the end, so it must have been dropped.
  for (let i = 0; i < 5000; i++) parseExpression(`file.size > ${i}`)

  assert.notEqual(parseExpression(probe), first, 'the memo table is bounded, not permanent')
})

test('a hot expression survives a flood that keeps touching it', () => {
  // Eviction is least-recently-used, so re-parsing an expression during the
  // flood keeps it resident rather than letting the flood push it out.
  const hot = 'file.name == "hot-probe"'
  const first = parseExpression(hot)
  for (let i = 0; i < 5000; i++) {
    parseExpression(`file.size > ${i}.5`)
    assert.equal(parseExpression(hot), first)
  }
})
