/** The error classes and the link resolver the package exports. */

import { createVaultIndex } from '@osdlc/markdown-vault'
import { expect, test } from 'vitest'

import {
  BaseParseError,
  ExpressionEvalError,
  evaluate,
  parseBase,
  parseExpression,
  runLinkResolver,
} from '../src/index.ts'

test('BaseParseError passes its cause through and keeps the path', () => {
  const cause = new Error('boom')
  const error = new BaseParseError('Bad thing', 'views[0]', cause)

  expect(error.cause).toBe(cause)
  expect(error.path).toBe('views[0]')
  expect(error.message).toBe('Bad thing at views[0]: boom')
  expect(new BaseParseError('No cause', 'root').cause).toBeUndefined()
})

test('parseBase puts the YAML or expression error in cause', () => {
  const yaml = (() => {
    try {
      parseBase('a: [')
    } catch (e) {
      return e as BaseParseError
    }
  })()
  expect(yaml?.cause).toBeInstanceOf(Error)
  expect(yaml?.path).toBe('root')

  const filter = (() => {
    try {
      parseBase('filters: "a &&"')
    } catch (e) {
      return e as BaseParseError
    }
  })()
  expect(filter?.cause).toBeInstanceOf(Error)
  expect((filter?.cause as Error).name).toBe('ExpressionError')
})

test('ExpressionEvalError is its own class, not the global EvalError', () => {
  const error = new ExpressionEvalError('bad')

  expect(error).toBeInstanceOf(Error)
  expect(error).not.toBeInstanceOf(EvalError)
  expect(error.name).toBe('ExpressionEvalError')
})

test('a circular formula throws ExpressionEvalError through the public context', () => {
  const vault = createVaultIndex([{ path: 'a.md' }])
  const ctx = { note: vault.notes[0]!, vault, formulas: { a: 'formula.b', b: 'formula.a' } }

  expect(() => evaluate(parseExpression('formula.a'), ctx)).toThrow(
    /Circular formula reference: a → b → a/,
  )
  expect(Object.keys(ctx)).toEqual(['note', 'vault', 'formulas'])
})

test('runLinkResolver resolves against the index it was built from, once', () => {
  const vault = createVaultIndex([{ path: 'people/Ada.md' }, { path: 'docs/guide.md' }])
  const resolve = runLinkResolver(vault)
  const guide = vault.byPath.get('docs/guide.md')!

  expect(resolve('Ada')?.file.path).toBe('people/Ada.md')
  expect(resolve('./Ada', guide)).toBeNull()
  expect(resolve('https://example.com/Ada')).toBeNull()
})
