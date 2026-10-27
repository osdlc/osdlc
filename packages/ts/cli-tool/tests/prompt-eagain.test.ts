/**
 * readLine on a non-blocking stdin. `node:fs` is mocked for the whole file,
 * so these cases live apart from the fd-based ones in prompt.test.ts.
 */

import { afterEach, describe, expect, test, vi } from 'vitest'

import { readLine } from '../src/prompt.ts'

const { readSync } = vi.hoisted(() => ({ readSync: vi.fn() }))
vi.mock('node:fs', async (original) => ({
  ...(await original<typeof import('node:fs')>()),
  readSync,
}))

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code })
}

/** A readSync that throws each of `errors` in turn, then delivers `input` a byte at a time. */
function feed(errors: NodeJS.ErrnoException[], input: string): void {
  const bytes = [...Buffer.from(input)]
  readSync.mockImplementation((_fd: number, buf: Buffer) => {
    const error = errors.shift()
    if (error !== undefined) throw error
    const next = bytes.shift()
    if (next === undefined) return 0
    buf[0] = next
    return 1
  })
}

afterEach(() => readSync.mockReset())

describe('readLine on a non-blocking fd', () => {
  test('EAGAIN waits and retries until input comes', () => {
    feed([errno('EAGAIN'), errno('EAGAIN')], 'yes\n')
    expect(readLine(0)).toBe('yes')
    expect(readSync).toHaveBeenCalledTimes(6)
  })

  test('any other read error is thrown', () => {
    feed([errno('EBADF')], 'yes\n')
    expect(() => readLine(0)).toThrow('EBADF')
  })
})
