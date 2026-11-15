/** The string form of a filter: each operator, quoting, and each error message. */
import { describe, expect, test } from 'vitest'

import { type Filter, formatFilter, parseFilter, parseTerm, QueryError } from '../src/index.ts'

const fails = (run: () => unknown): string => {
  try {
    run()
  } catch (e) {
    expect(e).toBeInstanceOf(QueryError)
    expect((e as QueryError).code).toBe('bad-filter')
    return (e as Error).message
  }
  throw new Error('did not throw')
}

describe('parseTerm', () => {
  test.each<[string, Filter]>([
    ['status=done', { field: 'status', op: 'eq', value: 'done' }],
    ['status!=done', { field: 'status', op: 'ne', value: 'done' }],
    ['status=done,open', { field: 'status', op: 'in', value: ['done', 'open'] }],
    ['status!=done,open', { field: 'status', op: 'nin', value: ['done', 'open'] }],
    ['kind~claim', { field: 'kind', op: 'contains', value: 'claim' }],
    ['kind!~claim', { field: 'kind', op: 'ncontains', value: 'claim' }],
    ['confidence>0.7', { field: 'confidence', op: 'gt', value: '0.7' }],
    ['confidence>=0.7', { field: 'confidence', op: 'gte', value: '0.7' }],
    ['confidence<0.7', { field: 'confidence', op: 'lt', value: '0.7' }],
    ['confidence<=0.7', { field: 'confidence', op: 'lte', value: '0.7' }],
    ['owner=', { field: 'owner', op: 'exists', value: false }],
    ['owner!=', { field: 'owner', op: 'exists', value: true }],
    ['scope.since>=1.2', { field: 'scope.since', op: 'gte', value: '1.2' }],
    ['@id~hook', { field: '@id', op: 'contains', value: 'hook' }],
  ])('%s', (term, filter) => {
    expect(parseTerm(term)).toEqual(filter)
  })

  test('a value runs to the end of the term, spaces and later operators included', () => {
    expect(parseTerm('harness=Claude Code')).toEqual({
      field: 'harness',
      op: 'eq',
      value: 'Claude Code',
    })
    expect(parseTerm('note~a=b')).toEqual({ field: 'note', op: 'contains', value: 'a=b' })
    expect(parseTerm('title~a, b')).toEqual({ field: 'title', op: 'contains', value: 'a, b' })
  })

  test('quotes keep a comma, a quote and an empty string as one value', () => {
    expect(parseTerm('title="a, b"').value).toBe('a, b')
    expect(parseTerm('title="say \\"hi\\" \\\\ bye"').value).toBe('say "hi" \\ bye')
    expect(parseTerm('title=""')).toEqual({ field: 'title', op: 'eq', value: '' })
    expect(parseTerm('title="a, b",c').value).toEqual(['a, b', 'c'])
  })

  test('each error says what is wrong with the term', () => {
    expect(fails(() => parseTerm(' '))).toBe('empty filter term')
    expect(fails(() => parseTerm('status'))).toBe(
      "'status': no operator; write <field><op><value> with one of = != ~ !~ > >= < <=",
    )
    expect(fails(() => parseTerm('=done'))).toBe("'=done': no field before '='")
    expect(fails(() => parseTerm('status!done'))).toBe(
      "'status!done': '!' must be followed by '=' or '~'",
    )
    expect(fails(() => parseTerm('rating>'))).toBe("'rating>': '>' needs a value")
    expect(fails(() => parseTerm('title~'))).toBe("'title~': '~' needs a value")
    expect(fails(() => parseTerm('title="a'))).toBe(`'title="a': unterminated quote`)
    expect(fails(() => parseTerm('title="a"b'))).toBe(`'title="a"b': text after the closing quote`)
  })
})

describe('parseFilter', () => {
  test('splits terms at spaces outside quotes', () => {
    expect(parseFilter('status=done kind~claim  confidence>=0.7')).toEqual([
      { field: 'status', op: 'eq', value: 'done' },
      { field: 'kind', op: 'contains', value: 'claim' },
      { field: 'confidence', op: 'gte', value: '0.7' },
    ])
    expect(parseFilter('harness="Claude Code" status=current')).toEqual([
      { field: 'harness', op: 'eq', value: 'Claude Code' },
      { field: 'status', op: 'eq', value: 'current' },
    ])
    expect(parseFilter('  ')).toEqual([])
  })

  test('reports the term that does not parse', () => {
    expect(fails(() => parseFilter('status=done oops'))).toMatch(/^'oops': no operator/)
  })
})

describe('formatFilter', () => {
  test.each([
    'status=done',
    'status!=done,open',
    'kind~claim',
    'rating>=4',
    'owner=',
    'owner!=',
    'harness="Claude Code"',
    'title="a, b",c',
  ])('%s reads back the same', (term) => {
    expect(formatFilter(parseTerm(term))).toBe(term)
    expect(parseFilter(formatFilter(parseTerm(term)))).toEqual([parseTerm(term)])
  })
})
