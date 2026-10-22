import { expect, test } from 'vitest'

import {
  andThen,
  attempt,
  attemptAsync,
  describe,
  err,
  type Err,
  type Failure,
  FailureError,
  isErr,
  isFailure,
  isOk,
  map,
  mapErr,
  match,
  ok,
  type Ok,
  type Result,
  unwrap,
  unwrapOr,
} from '@osdlc/result'

// The README's example: a layer with its own failure kinds.
type ParseKind = 'empty' | 'not-a-number'
type ParseFailure = Failure<ParseKind>

function parsePort(text: string): Result<number, ParseFailure> {
  if (text.trim() === '') return err({ kind: 'empty', message: 'No port was given.' })
  const n = Number(text)
  if (!Number.isInteger(n)) {
    return err({
      kind: 'not-a-number',
      message: `"${text}" is not a port number.`,
      hint: 'Use a whole number such as 8080.',
    })
  }
  return ok(n)
}

test('ok, err, and narrowing on `ok`', () => {
  const r = parsePort('8080')
  const value: Ok<number> | Err<ParseFailure> = r
  expect(value).toEqual({ ok: true, value: 8080 })
  expect(isOk(r) && r.value).toBe(8080)
  expect(isErr(parsePort('x'))).toBe(true)
})

test('match, map, mapErr, andThen, unwrapOr', () => {
  const text = match(parsePort('x'), {
    ok: (n) => `port ${n}`,
    err: (f) => describe(f),
  })
  expect(text).toBe('"x" is not a port number. Use a whole number such as 8080.')
  expect(map(parsePort('80'), (n) => n + 1)).toEqual(ok(81))
  expect(mapErr(parsePort(''), (f) => f.kind)).toEqual(err('empty'))
  expect(andThen(parsePort('80'), (n) => parsePort(String(n * 2)))).toEqual(ok(160))
  expect(unwrapOr(parsePort('x'), 3000)).toBe(3000)
})

test('an exhaustive switch over kind', () => {
  const advice = (f: ParseFailure): string => {
    switch (f.kind) {
      case 'empty':
        return 'ask again'
      case 'not-a-number':
        return 'show the hint'
      default: {
        const unreachable: never = f.kind
        return unreachable
      }
    }
  }
  const r = parsePort('x')
  expect(!r.ok && advice(r.error)).toBe('show the hint')
})

test('attempt, attemptAsync, unwrap and FailureError', async () => {
  const toFailure = (cause: unknown): Failure<'bad-json'> => ({
    kind: 'bad-json',
    message: 'The text is not JSON.',
    cause,
  })
  expect(attempt(() => JSON.parse('{"a":1}') as unknown, toFailure)).toEqual(ok({ a: 1 }))
  const bad = attempt(() => JSON.parse('{') as unknown, toFailure)
  expect(isErr(bad)).toBe(true)
  expect(await attemptAsync(async () => 1, toFailure)).toEqual(ok(1))

  try {
    unwrap(bad)
    expect.unreachable()
  } catch (e) {
    expect(e).toBeInstanceOf(FailureError)
    expect(isFailure((e as FailureError).failure)).toBe(true)
    expect((e as FailureError).cause).toBeInstanceOf(SyntaxError)
  }
})
