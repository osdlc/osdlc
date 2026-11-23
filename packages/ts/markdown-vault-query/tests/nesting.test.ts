/** Expressions and bases nested too deeply for the stack end in the package's own errors. */

import { createVaultIndex } from '@osdlc/markdown-vault'
import { expect, test } from 'vitest'

import {
  BaseParseError,
  ErrorValue,
  ExpressionError,
  evaluate,
  evaluateSafe,
  matchesFilter,
  parseBase,
  parseExpression,
  queryExpression,
  queryVault,
  runView,
  type FilterNode,
} from '../src/index.ts'

const DEPTH = 200_000
const TIMEOUT = 30_000

const vault = createVaultIndex([{ path: 'a.md', frontmatter: { n: 1 } }])
const note = vault.notes[0]!
const ctx = { note, vault, formulas: {} }

/** `1+1+...+1`: parsed in a loop, so only evaluating it recurses deeply. */
const longChain = '1' + '+1'.repeat(DEPTH)
/** Parentheses nested so deep that parsing it recurses past the stack. */
const deepParens = '('.repeat(DEPTH) + '1' + ')'.repeat(DEPTH)

test(
  'parseExpression throws ExpressionError for nesting past the stack',
  () => {
    expect(() => parseExpression(deepParens)).toThrow(ExpressionError)
    expect(() => parseExpression(deepParens)).toThrow(/nested too deeply/)
    expect(() => parseExpression('!'.repeat(DEPTH) + 'true')).toThrow(ExpressionError)
    // Nothing is cached for the failed parse, and the next parse of a good string works.
    expect(parseExpression('1 + 1').kind).toBe('binary')
  },
  TIMEOUT,
)

test(
  'parseBase reports a too-deep expression as BaseParseError with the cause set',
  () => {
    let error: unknown
    try {
      parseBase(`filters: "${deepParens}"`)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(BaseParseError)
    expect((error as BaseParseError).cause).toBeInstanceOf(ExpressionError)
    expect((error as BaseParseError).path).toBe('filters')
  },
  TIMEOUT,
)

test(
  'parseBase reports deeply nested filter groups as BaseParseError',
  () => {
    const groups = '{not: '.repeat(DEPTH) + '"true"' + '}'.repeat(DEPTH)
    expect(() => parseBase(`filters: ${groups}`)).toThrow(BaseParseError)
  },
  TIMEOUT,
)

test('parseBase reports a filter group that contains itself as BaseParseError', () => {
  // A YAML alias to its own anchor parses into an object that holds itself, so walking the
  // filter tree never reaches a leaf.
  const selfReferring = 'filters: &group\n  and:\n    - *group\n'
  expect(() => parseBase(selfReferring)).toThrow(BaseParseError)
  expect(() => parseBase(selfReferring)).toThrow(/nested too deeply/)
})

test(
  'evaluate throws RangeError and evaluateSafe returns an ErrorValue past the stack',
  () => {
    const expr = parseExpression(longChain)
    expect(() => evaluate(expr, ctx)).toThrow(RangeError)
    expect(evaluateSafe(expr, ctx)).toBeInstanceOf(ErrorValue)
    expect(evaluateSafe(parseExpression('1 + 1'), ctx)).toBe(2)
  },
  TIMEOUT,
)

test(
  'queryExpression leaves the note out when evaluation overflows',
  () => {
    expect(queryExpression(vault, longChain + ' == 1')).toEqual([])
    expect(() => queryExpression(vault, deepParens)).toThrow(ExpressionError)
  },
  TIMEOUT,
)

test(
  'queryVault leaves the note out, or throws ExpressionError for a filter that cannot parse',
  () => {
    expect(queryVault(vault, { filter: longChain + ' == 1' }).total).toBe(0)
    expect(() => queryVault(vault, { filter: deepParens })).toThrow(ExpressionError)
  },
  TIMEOUT,
)

test(
  'runView shows an ErrorValue in a cell whose formula overflows',
  () => {
    const base = parseBase(`
formulas:
  deep: "${longChain}"
views:
  - type: table
    name: V
    order: [formula.deep, n]
`)
    const result = runView(vault, base, 'V')
    expect(result.rows[0]?.columns['formula.deep']).toBeInstanceOf(ErrorValue)
    expect(result.rows[0]?.columns['n']).toBe(1)
  },
  TIMEOUT,
)

test(
  'matchesFilter excludes the note for a hand-built tree nested past the stack',
  () => {
    let node: FilterNode = { type: 'expr', source: 'true', expr: parseExpression('true') }
    for (let i = 0; i < DEPTH; i++) node = { type: 'not', children: [node] }
    expect(matchesFilter(node, ctx)).toBe(false)
  },
  TIMEOUT,
)
