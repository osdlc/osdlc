/**
 * Handle an edit the library refuses. A refused batch throws an `EditError`
 * and returns nothing, so no half-applied document can be written.
 */

import { expect, test } from 'bun:test'

import { editYaml, EditError, type EditErrorCode, type EditSpan } from '@osdlc/yaml-splice'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/** Edit, or explain why not. */
function tryRename(source: string, from: string, to: string): string {
  try {
    editYaml(encode(source), [{ Rename: { from, to } }])
    return 'renamed'
  } catch (err) {
    if (!(err instanceof EditError)) throw err
    const code: EditErrorCode = err.code
    switch (code) {
      case 'MissingKey':
        return `no field named ${from}`
      case 'KeyConflict':
        return `${to} already exists`
      default:
        return `refused: ${code}`
    }
  }
}

test('each refusal has a code to switch on', () => {
  expect(tryRename('a: 1\n', 'a', 'b')).toBe('renamed')
  expect(tryRename('a: 1\n', 'x', 'b')).toBe('no field named x')
  expect(tryRename('a: 1\nb: 2\n', 'a', 'b')).toBe('b already exists')
  expect(tryRename('- a\n- b\n', 'a', 'b')).toBe('refused: RootNotMapping')
})

/** The refusal `run` throws. Fails the test when it does not throw one. */
function refusal(run: () => unknown): EditError {
  try {
    run()
  } catch (err) {
    if (err instanceof EditError) return err
    throw err
  }
  throw new Error('expected a refusal')
}

test('a key conflict carries the byte range it is about', () => {
  const src = encode('a: 1\nb: 2\n')
  const err = refusal(() => editYaml(src, [{ Rename: { from: 'a', to: 'b' } }]))
  expect(err.code).toBe('KeyConflict')
  const span: EditSpan | undefined = err.span
  expect(span).toBeDefined()
  expect(span!.start).toBeLessThanOrEqual(span!.end)
  expect(span!.end).toBeLessThanOrEqual(src.length)
})

test('a number YAML cannot write is refused before anything is edited', () => {
  const err = refusal(() => editYaml(encode('a: 1\n'), [{ Set: { key: 'a', value: Number.NaN } }]))
  expect(err.code).toBe('UnrenderableValue')
})
