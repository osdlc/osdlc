import { describe as suite, expect, expectTypeOf, test } from 'vitest'

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
} from '../src/index.ts'

type Kind = 'a' | 'b'
const fail = (kind: Kind, extra: Partial<Failure<Kind>> = {}): Failure<Kind> => ({
  kind,
  message: `msg ${kind}`,
  ...extra,
})

suite('constructors and guards', () => {
  test('ok and err build plain objects', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 })
    expect(err('x')).toEqual({ ok: false, error: 'x' })
    expect(JSON.parse(JSON.stringify(ok({ a: 1 })))).toEqual({ ok: true, value: { a: 1 } })
  })

  test('isOk and isErr agree with ok', () => {
    expect(isOk(ok(1))).toBe(true)
    expect(isErr(ok(1))).toBe(false)
    expect(isOk(err(1))).toBe(false)
    expect(isErr(err(1))).toBe(true)
  })

  test('ok keeps a falsy value', () => {
    expect(ok(undefined)).toEqual({ ok: true, value: undefined })
    expect(isOk(ok(0))).toBe(true)
  })
})

suite('combinators', () => {
  test('map transforms a success and passes a failure through', () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4))
    const e = err('no')
    expect(map(e, () => 1)).toBe(e)
  })

  test('mapErr transforms a failure and passes a success through', () => {
    expect(mapErr(err('no'), (s) => s.length)).toEqual(err(2))
    const v = ok(1)
    expect(mapErr(v, () => 'x')).toBe(v)
  })

  test('andThen chains and short-circuits on the first failure', () => {
    const half = (n: number): Result<number, string> => (n % 2 === 0 ? ok(n / 2) : err('odd'))
    expect(andThen(ok(8), half)).toEqual(ok(4))
    expect(andThen(ok(3), half)).toEqual(err('odd'))
    let called = false
    const first = err('first')
    expect(
      andThen(first, () => {
        called = true
        return ok(1)
      }),
    ).toBe(first)
    expect(called).toBe(false)
  })

  test('unwrapOr returns the value or the fallback', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1)
    expect(unwrapOr(err('x'), 9)).toBe(9)
  })

  test('match runs exactly one arm', () => {
    const arms = { ok: (n: number) => `ok ${n}`, err: (e: string) => `err ${e}` }
    expect(match(ok(1), arms)).toBe('ok 1')
    expect(match(err('x'), arms)).toBe('err x')
  })
})

suite('unwrap', () => {
  test('returns the value of a success', () => {
    expect(unwrap(ok(5))).toBe(5)
  })

  test('throws a FailureError for a Failure, carrying it', () => {
    const failure = fail('a', { hint: 'try b' })
    try {
      unwrap(err(failure))
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(FailureError)
      expect(e).toBeInstanceOf(Error)
      expect((e as FailureError).failure).toBe(failure)
      expect((e as Error).message).toBe('msg a')
    }
  })

  test('throws an Error with the cause for any other error', () => {
    const boom = new Error('boom')
    try {
      unwrap(err(boom))
      expect.unreachable()
    } catch (e) {
      expect(e).not.toBeInstanceOf(FailureError)
      expect((e as Error).cause).toBe(boom)
    }
    expect(() => unwrap(err(7))).toThrow('unwrap on an Err: 7')
  })
})

suite('attempt', () => {
  test('wraps a return value', () => {
    expect(attempt(() => 3, String)).toEqual(ok(3))
  })

  test('maps a throw through toError', () => {
    const r = attempt(
      () => {
        throw new Error('bad')
      },
      (t): Failure<'threw'> => ({ kind: 'threw', message: (t as Error).message, cause: t }),
    )
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.message).toBe('bad')
  })

  test('attemptAsync wraps a resolved value, a rejection and a sync throw', async () => {
    expect(await attemptAsync(async () => 1, String)).toEqual(ok(1))
    expect(
      await attemptAsync(
        () => Promise.reject(new Error('r')),
        (t) => (t as Error).message,
      ),
    ).toEqual(err('r'))
    expect(
      await attemptAsync(
        () => {
          throw new Error('s')
        },
        (t) => (t as Error).message,
      ),
    ).toEqual(err('s'))
  })
})

suite('FailureError, isFailure, describe', () => {
  test('message and cause come from the failure', () => {
    const cause = new Error('root')
    const e = new FailureError({ kind: 'k', message: 'm', cause })
    expect(e.message).toBe('m')
    expect(e.cause).toBe(cause)
    expect(e.name).toBe('FailureError')
  })

  test('no cause means no cause property', () => {
    expect('cause' in new FailureError({ kind: 'k', message: 'm' })).toBe(false)
  })

  test('isFailure checks the shape', () => {
    expect(isFailure({ kind: 'k', message: 'm' })).toBe(true)
    expect(isFailure({ kind: 'k' })).toBe(false)
    expect(isFailure({ kind: 1, message: 'm' })).toBe(false)
    expect(isFailure(null)).toBe(false)
    expect(isFailure('x')).toBe(false)
    // An Error has a message but no kind.
    expect(isFailure(new Error('x'))).toBe(false)
  })

  test('describe is the message, plus the hint when there is one', () => {
    expect(describe({ kind: 'k', message: 'It broke.' })).toBe('It broke.')
    expect(describe({ kind: 'k', message: 'It broke.', hint: 'Fix it.' })).toBe('It broke. Fix it.')
    expect(describe({ kind: 'k', message: 'It broke.', hint: '' })).toBe('It broke.')
  })
})

suite('types', () => {
  test('Result narrows on ok', () => {
    const r = ok(1) as Result<number, string>
    if (r.ok) expectTypeOf(r).toEqualTypeOf<Ok<number>>()
    else expectTypeOf(r).toEqualTypeOf<Err<string>>()
    if (isOk(r)) expectTypeOf(r.value).toBeNumber()
    if (isErr(r)) expectTypeOf(r.error).toBeString()
  })

  test('E defaults to Failure', () => {
    expectTypeOf<Result<number>>().toEqualTypeOf<Result<number, Failure>>()
  })

  test('ok and err infer the literal arm types', () => {
    expectTypeOf(ok(1)).toEqualTypeOf<Ok<number>>()
    expectTypeOf(err('x')).toEqualTypeOf<Err<string>>()
  })

  test('map, mapErr and andThen reshape the arms', () => {
    const r = ok(1) as Result<number, 'e1'>
    expectTypeOf(map(r, String)).toEqualTypeOf<Result<string, 'e1'>>()
    expectTypeOf(mapErr(r, (e) => e.length)).toEqualTypeOf<Result<number, number>>()
    expectTypeOf(andThen(r, (n) => ok(String(n)) as Result<string, 'e2'>)).toEqualTypeOf<
      Result<string, 'e1' | 'e2'>
    >()
  })

  test('match returns the arms common type and types each arm', () => {
    const r = ok(1) as Result<number, Failure<Kind>>
    const out = match(r, {
      ok: (v) => {
        expectTypeOf(v).toBeNumber()
        return 'a' as const
      },
      err: (e) => {
        expectTypeOf(e.kind).toEqualTypeOf<Kind>()
        return 'b' as const
      },
    })
    expectTypeOf(out).toEqualTypeOf<'a' | 'b'>()
  })

  test('unwrap and unwrapOr', () => {
    const r = ok(1) as Result<number, string>
    expectTypeOf(unwrap(r)).toBeNumber()
    expectTypeOf(unwrapOr(r, null)).toEqualTypeOf<number | null>()
  })

  test('a switch over Failure kind is exhaustive', () => {
    const name = (f: Failure<Kind>): string => {
      switch (f.kind) {
        case 'a':
          return 'A'
        case 'b':
          return 'B'
        default: {
          expectTypeOf(f.kind).toBeNever()
          const unreachable: never = f.kind
          return unreachable
        }
      }
    }
    expect(name(fail('a'))).toBe('A')
    expect(name(fail('b'))).toBe('B')
  })

  test('attempt types the error from toError; FailureError keeps its failure type', () => {
    const r = attempt(
      () => 1,
      (): Failure<'x'> => ({ kind: 'x', message: 'm' }),
    )
    expectTypeOf(r).toEqualTypeOf<Result<number, Failure<'x'>>>()
    const e = new FailureError(fail('a'))
    expectTypeOf(e.failure).toEqualTypeOf<Failure<Kind>>()
    expectTypeOf(attemptAsync(async () => 1, String)).toEqualTypeOf<
      Promise<Result<number, string>>
    >()
  })
})
