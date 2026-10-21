/**
 * `mapFailed` / `catchFailed` and their async twins: only `CommandFailed` is
 * intercepted; the return value and every other error pass through untouched.
 */

import { describe, expect, test } from 'vitest'

import {
  catchFailed,
  catchFailedAsync,
  CommandFailed,
  mapFailed,
  mapFailedAsync,
} from '../src/index.ts'

const failed = (): CommandFailed =>
  new CommandFailed(['git', 'x'], { exitCode: 1, stdout: 'out', stderr: 'err' })

class DomainError extends Error {}

describe('mapFailed', () => {
  test('returns the value when fn succeeds', () => {
    expect(
      mapFailed(
        () => 7,
        () => new DomainError(),
      ),
    ).toBe(7)
  })
  test('throws the mapper result for CommandFailed', () => {
    const f = failed()
    let seen: CommandFailed | undefined
    expect(() =>
      mapFailed(
        () => {
          throw f
        },
        (e) => {
          seen = e
          return new DomainError(`mapped: ${e.detail}`)
        },
      ),
    ).toThrow(new DomainError('mapped: err\nout'))
    expect(seen).toBe(f)
  })
  test('propagates other errors without calling the mapper', () => {
    const boom = new TypeError('bug')
    let called = false
    expect(() =>
      mapFailed(
        () => {
          throw boom
        },
        () => {
          called = true
          return new DomainError()
        },
      ),
    ).toThrow(boom)
    expect(called).toBe(false)
  })
})

describe('catchFailed', () => {
  test('returns fn value on success', () => {
    expect(
      catchFailed(
        () => 1,
        () => 2,
      ),
    ).toBe(1)
  })
  test('returns onFailed value for CommandFailed', () => {
    expect(
      catchFailed(
        () => {
          throw failed()
        },
        (e) => e.result.exitCode,
      ),
    ).toBe(1)
  })
  test('propagates other errors', () => {
    const boom = new Error('bug')
    expect(() =>
      catchFailed(
        () => {
          throw boom
        },
        () => 0,
      ),
    ).toThrow(boom)
  })
})

describe('async twins', () => {
  test('mapFailedAsync maps a rejected CommandFailed', async () => {
    await expect(
      mapFailedAsync(
        () => Promise.reject(failed()),
        (e) => new DomainError(e.detail),
      ),
    ).rejects.toThrow(new DomainError('err\nout'))
  })
  test('mapFailedAsync passes values and other rejections through', async () => {
    expect(
      await mapFailedAsync(
        async () => 3,
        () => new DomainError(),
      ),
    ).toBe(3)
    const boom = new Error('bug')
    await expect(
      mapFailedAsync(
        () => Promise.reject(boom),
        () => new DomainError(),
      ),
    ).rejects.toBe(boom)
  })
  test('mapFailedAsync awaits an async mapper', async () => {
    await expect(
      mapFailedAsync(
        () => Promise.reject(failed()),
        async (e) => {
          await Promise.resolve()
          return new DomainError(`late: ${e.result.exitCode}`)
        },
      ),
    ).rejects.toThrow(new DomainError('late: 1'))
  })
  test('mapFailedAsync passes a rejection from the mapper through', async () => {
    const mapperBug = new TypeError('mapper broke')
    await expect(
      mapFailedAsync(
        () => Promise.reject(failed()),
        () => Promise.reject(mapperBug),
      ),
    ).rejects.toBe(mapperBug)
  })
  test('catchFailedAsync returns sync or async handler values', async () => {
    expect(
      await catchFailedAsync(
        () => Promise.reject(failed()),
        () => 'a',
      ),
    ).toBe('a')
    expect(
      await catchFailedAsync(
        () => Promise.reject(failed()),
        async () => 'b',
      ),
    ).toBe('b')
    expect(
      await catchFailedAsync(
        async () => 'ok',
        () => 'no',
      ),
    ).toBe('ok')
    const boom = new Error('bug')
    await expect(
      catchFailedAsync(
        () => Promise.reject(boom),
        () => 'x',
      ),
    ).rejects.toBe(boom)
  })
})
