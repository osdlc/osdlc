/**
 * How the wrapper maps errors thrown by the wasm glue, with the glue mocked so
 * each shape can be thrown on demand: a refusal the wrapper has no name for, a
 * refusal with a malformed span, and an error that is not a refusal.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { editYaml as editYamlWasm } from '#wasm'
import { EditError, editYaml } from '../src/index.ts'

// Hoisted above the imports, so the wrapper loads the mock.
vi.mock('#wasm', () => ({ editYaml: vi.fn() }))

/** A bindgen-style error: `.name` is the variant, `.span` its location. */
function wasmError(name: string, span?: unknown): Error {
  const err = new Error(`${name} from wasm`)
  err.name = name
  if (span !== undefined) Object.assign(err, { span })
  return err
}

function thrownBy(raw: Error): unknown {
  vi.mocked(editYamlWasm).mockImplementation(() => {
    throw raw
  })
  try {
    editYaml(new Uint8Array(), [])
  } catch (err) {
    return err
  }
  throw new Error('expected editYaml to throw')
}

describe('errors from the wasm glue', () => {
  beforeEach(() => {
    vi.mocked(editYamlWasm).mockReset()
  })

  test('an unnamed refusal is an EditError coded InvalidResult, span kept', () => {
    const err = thrownBy(wasmError('EditError', { start: 1, end: 3 }))
    expect(err).toBeInstanceOf(EditError)
    expect(err).toMatchObject({
      code: 'InvalidResult',
      name: 'InvalidResult',
      message: 'EditError from wasm',
      span: { start: 1, end: 3 },
    })
  })

  test('a known refusal with a malformed span keeps its code and drops the span', () => {
    const err = thrownBy(wasmError('AmbiguousKey', { start: '1', end: 2 }))
    expect(err).toBeInstanceOf(EditError)
    expect((err as EditError).code).toBe('AmbiguousKey')
    expect((err as EditError).span).toBeUndefined()
    expect(err).not.toHaveProperty('span')
  })

  test('an error that is not a refusal is rethrown as the same object', () => {
    const raw = wasmError('RuntimeError')
    expect(thrownBy(raw)).toBe(raw)
  })
})
