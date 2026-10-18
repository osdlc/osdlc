/**
 * The shared conformance corpus, run through the wasm wrapper. It loads the
 * same `conformance.json` the Rust crate's `tests/conformance.rs` loads and
 * checks the bytes, `changed` and the error code of every fixture, so the two
 * cannot drift apart.
 *
 * Plus two round trips stated on their own: a value change that keeps
 * single-quote quoting byte for byte, and an edit that changes no value, which
 * returns the input bytes with `changed === false`.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  editYaml,
  EditError,
  type EditErrorCode,
  type EditValue,
  type FieldEdit,
} from '../index.ts'
// The corpus is the crate's; this suite reads it in place.
import corpus from '../../../rust/yaml-splice/tests/fixtures/conformance.json'

const enc = (s: string) => new TextEncoder().encode(s)

describe('round trips', () => {
  const source = enc("title: 'keep me'\nstatus: draft\n")

  test('a value change preserves single-quote quoting byte-for-byte', () => {
    const out = editYaml(source, [{ Set: { key: 'status', value: 'done' } }])
    expect(out.changed).toBe(true)
    expect(bytesToString(out.bytes)).toBe("title: 'keep me'\nstatus: done\n")
  })

  test('a semantic no-op returns byte-identical input with changed === false', () => {
    const out = editYaml(source, [{ Set: { key: 'status', value: 'draft' } }])
    expect(out.changed).toBe(false)
    expect(equalBytes(out.bytes, source)).toBe(true)
  })
})

describe('a non-finite number in a Set value', () => {
  const source = enc('a: 1\n')

  // Why these are refused rather than written: see assertFiniteNumbers in index.ts.
  for (const value of [Number.NaN, Infinity, -Infinity]) {
    test(`${value} is refused as UnrenderableValue`, () => {
      expect(() => editYaml(source, [{ Set: { key: 'a', value } }])).toThrow(
        expect.objectContaining({ name: 'UnrenderableValue' }),
      )
    })
  }

  test('is refused when nested inside a sequence or map', () => {
    expect(() => editYaml(source, [{ Set: { key: 'a', value: { x: [1, Number.NaN] } } }])).toThrow(
      expect.objectContaining({ name: 'UnrenderableValue' }),
    )
  })

  test('refuses before any byte is written — the batch stays atomic', () => {
    const batch: FieldEdit[] = [
      { Set: { key: 'a', value: 2 } },
      { Set: { key: 'a', value: Infinity } },
    ]
    expect(() => editYaml(source, batch)).toThrow(EditError)
  })

  test('a finite number still round-trips', () => {
    const out = editYaml(source, [{ Set: { key: 'a', value: 2 } }])
    expect(bytesToString(out.bytes)).toBe('a: 2\n')
  })
})

describe('an edit the editor cannot read', () => {
  const source = enc('a: 1\n')
  /** `depth` lists, one inside the next, around a scalar. */
  const nested = (depth: number): EditValue => {
    let value: EditValue = 1
    for (let i = 0; i < depth; i++) value = [value]
    return value
  }

  test('a Set value nested 124 levels deep is written', () => {
    expect(editYaml(source, [{ Set: { key: 'a', value: nested(124) } }]).changed).toBe(true)
  })

  test('a Set value nested 125 levels deep is refused as InvalidEdit', () => {
    expect(() => editYaml(source, [{ Set: { key: 'a', value: nested(125) } }])).toThrow(
      expect.objectContaining({ name: 'InvalidEdit', code: 'InvalidEdit' }),
    )
  })

  // The types rule these out; a plain-JavaScript caller can still send them.
  for (const [what, edit] of [
    ['a Set with no value', { Set: { key: 'a' } }],
    ['a Set whose value is undefined', { Set: { key: 'a', value: undefined } }],
    ['an unknown tag', { Replace: { key: 'a', value: 2 } }],
  ] as const) {
    test(`${what} is refused as InvalidEdit`, () => {
      expect(() => editYaml(source, [edit as unknown as FieldEdit])).toThrow(
        expect.objectContaining({ name: 'InvalidEdit' }),
      )
    })
  }
})

describe('an error that is not a refusal', () => {
  test('is rethrown as is, not wrapped in an EditError', () => {
    let thrown: unknown
    try {
      // The glue reads `source.length`, so this throws a TypeError before the
      // wasm runs, the same path a Rust panic's `RuntimeError` takes.
      editYaml(null as unknown as Uint8Array, [])
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(TypeError)
    expect(thrown).not.toBeInstanceOf(EditError)
  })
})

interface Expect {
  changed?: boolean
  bytes?: string
  single_span?: boolean
  error?: string
  error_valid_up_to?: number
  error_span_within_source?: boolean
}
interface Fixture {
  name: string
  source?: string
  source_bytes?: number[]
  edits: FieldEdit[]
  case_sensitive?: boolean
  expect: Expect
}

const fixtures = corpus as unknown as Fixture[]

describe('shared conformance corpus', () => {
  test('the corpus is non-empty', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const fx of fixtures) {
    // The wrapper has no case-sensitivity option: keys always match
    // case-insensitively, so the case-sensitive fixtures cannot be expressed
    // through it. The Rust suite runs them; this one records them as skipped.
    const runner = fx.case_sensitive ? test.skip : test
    runner(fx.name, () => runFixture(fx))
  }
})

function runFixture(fx: Fixture): void {
  const source = sourceBytes(fx)

  if (fx.expect.error !== undefined) {
    let threw: unknown
    try {
      editYaml(source, fx.edits)
    } catch (e) {
      threw = e
    }
    expect(threw).toBeInstanceOf(EditError)
    const err = threw as EditError
    expect(err.name).toBe(fx.expect.error)
    expect(err.code as string).toBe(fx.expect.error)
    if (fx.expect.error_span_within_source) {
      expect(err.span).toBeDefined()
      const span = err.span!
      expect(span.start).toBeGreaterThanOrEqual(0)
      expect(span.end).toBeGreaterThan(span.start)
      expect(span.end).toBeLessThanOrEqual(source.length)
    }
    return
  }

  const out = editYaml(source, fx.edits)
  expect(out.changed).toBe(fx.expect.changed!)
  expect(bytesToString(out.bytes)).toBe(fx.expect.bytes!)
  if (fx.expect.single_span) {
    assertSingleSpan(source, out.bytes)
  }
}

// The property assertSingleSpan enforces is only worth as much as the helper,
// so it is exercised against pairs the corpus cannot produce.
describe('assertSingleSpan', () => {
  test('accepts an output whose single edited line changed', () => {
    expect(() => assertSingleSpan(enc('a: 1\nb: 2\n'), enc('a: 9\nb: 2\n'))).not.toThrow()
  })

  test('rejects an output that differs on more than one line', () => {
    expect(() => assertSingleSpan(enc('a: 1\nb: 2\n'), enc('a: 9\nb: 9\n'))).toThrow()
  })

  test('rejects an output whose line count changed', () => {
    expect(() => assertSingleSpan(enc('a: 1\nb: 2\n'), enc('a: 1\n'))).toThrow()
  })

  test('rejects a byte-identical output — nothing was edited', () => {
    expect(() => assertSingleSpan(enc('a: 1\n'), enc('a: 1\n'))).toThrow()
  })
})

function sourceBytes(fx: Fixture): Uint8Array {
  if (fx.source !== undefined) return enc(fx.source)
  if (fx.source_bytes !== undefined) return Uint8Array.from(fx.source_bytes)
  throw new Error(`fixture ${fx.name} has neither source nor source_bytes`)
}

function bytesToString(b: Uint8Array): string {
  return new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }).decode(b)
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Assert `output` differs from `input` in exactly one line — the line count and
 * every other line are byte-identical.
 *
 * Locating the contiguous differing byte region proves nothing on its own: the
 * longest common prefix and suffix are equal by construction for ANY two byte
 * strings, so a whole-document reserialization satisfies that reading. Comparing
 * lines is what actually catches one.
 */
function assertSingleSpan(input: Uint8Array, output: Uint8Array): void {
  const inputLines = splitLines(input)
  const outputLines = splitLines(output)
  expect(outputLines.length, 'line count').toBe(inputLines.length)

  const differing: number[] = []
  for (let i = 0; i < inputLines.length; i++) {
    if (!equalBytes(inputLines[i]!, outputLines[i]!)) differing.push(i)
  }
  expect(differing, 'line indexes that differ').toHaveLength(1)
}

/** Split on `\n`, keeping each terminator, so the pieces rejoin to the input. */
function splitLines(bytes: Uint8Array): Uint8Array[] {
  const lines: Uint8Array[] = []
  let start = 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0a) {
      lines.push(bytes.subarray(start, i + 1))
      start = i + 1
    }
  }
  if (start < bytes.length) lines.push(bytes.subarray(start))
  return lines
}

describe('EditErrorCode', () => {
  // A Record over the union fails to typecheck when a code is missing or extra.
  const CODES: Record<EditErrorCode, true> = {
    InvalidEdit: true,
    InvalidUtf8: true,
    MalformedYaml: true,
    UnsupportedDocument: true,
    RootNotMapping: true,
    AmbiguousKey: true,
    MissingKey: true,
    KeyConflict: true,
    UnrenderableValue: true,
    InvalidResult: true,
  }

  // Raised by the wasm wrapper itself, for edits JSON it cannot decode.
  const WRAPPER_CODES = ['InvalidEdit']

  test("lists exactly the variants of the crate's EditError, plus InvalidEdit", () => {
    const source = readFileSync(
      join(import.meta.dir, '../../../rust/yaml-splice/src/edit.rs'),
      'utf-8',
    )
    const body = /pub enum EditError \{([\s\S]*?)\n\}/.exec(source)?.[1]
    expect(body).toBeDefined()
    const variants = [...body!.matchAll(/^    ([A-Z][A-Za-z0-9]*)\b/gm)].map((m) => m[1]!)
    expect(variants.length).toBeGreaterThan(0)
    expect([...variants, ...WRAPPER_CODES].sort()).toEqual(Object.keys(CODES).sort())
    const wrapper = readFileSync(
      join(import.meta.dir, '../../../rust/yaml-splice-wasm/src/lib.rs'),
      'utf-8',
    )
    for (const code of WRAPPER_CODES) expect(wrapper).toContain(`"${code}"`)
    // A variant missing from the wrapper's `variant_name` would reach JS under
    // the catch-all name `EditError` and be reported as `InvalidResult`.
    for (const v of variants) expect(wrapper).toContain(`EditError::${v} { .. } => "${v}"`)
  })
})
