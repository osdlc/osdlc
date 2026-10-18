import { describe, expect, test } from 'vitest'

import { customAdapter } from '../src/adapters/custom.js'
import { callAgent } from '../src/run.js'
import { incompleteUtf8Tail } from '../src/spawn.js'

// maxOutputBytes: a per-stream cap that stops the process group like a
// timeout. Real processes, harmless shell scripts.

const sh = (name: string, script: string) =>
  customAdapter({ name, binary: '/bin/sh', args: () => ['-c', script] })

describe('maxOutputBytes', () => {
  test('stdout past the cap stops the run with output-limit and truncated output', async () => {
    const started = Date.now()
    const result = await callAgent(sh('flood', 'while :; do echo xxxxxxxxx; done'), {
      prompt: 'x',
      maxOutputBytes: 1000,
    })
    expect(Date.now() - started).toBeLessThan(5000)
    expect(result.ok).toBe(false)
    expect(result.error?.reason).toBe('output-limit')
    expect(result.error?.detail).toContain('stdout')
    expect(result.error?.detail).toContain('1000')
    expect(result.raw.outputLimit).toBe('stdout')
    expect(result.raw.timedOut).toBe(false)
    expect(Buffer.byteLength(result.raw.stdout)).toBe(1000)
  })

  test('stderr has its own cap and is named as the cause', async () => {
    const result = await callAgent(sh('noisy', 'echo ok; while :; do echo eeee >&2; done'), {
      prompt: 'x',
      maxOutputBytes: 64,
    })
    expect(result.error?.reason).toBe('output-limit')
    expect(result.raw.outputLimit).toBe('stderr')
    expect(result.raw.stdout).toBe('ok\n')
    expect(Buffer.byteLength(result.raw.stderr)).toBe(64)
  })

  test('the cut backs off to a character boundary', async () => {
    // 'a' then two 4-byte emoji: a cap of 6 bytes falls inside the second.
    const result = await callAgent(
      sh('emoji', "printf 'a\\360\\237\\231\\202\\360\\237\\231\\202'; sleep 5"),
      { prompt: 'x', maxOutputBytes: 6 },
    )
    expect(result.error?.reason).toBe('output-limit')
    expect(result.raw.stdout).toBe('a\u{1F642}')
  })

  test('the cut holds when the split character straddles two reads', async () => {
    const result = await callAgent(
      sh('straddle', "printf 'ab\\360\\237'; sleep 0.1; printf '\\231\\202cd'; sleep 5"),
      { prompt: 'x', maxOutputBytes: 4 },
    )
    expect(result.error?.reason).toBe('output-limit')
    expect(result.raw.stdout).toBe('ab')
  })

  test('output exactly at the cap is not a failure', async () => {
    const result = await callAgent(sh('exact', "printf '12345'"), {
      prompt: 'x',
      maxOutputBytes: 5,
    })
    expect(result.ok).toBe(true)
    expect(result.text).toBe('12345')
  })

  test('Infinity means no cap', async () => {
    const result = await callAgent(sh('big', "printf '%05000d' 0"), {
      prompt: 'x',
      maxOutputBytes: Infinity,
    })
    expect(result.ok).toBe(true)
    expect(result.text).toHaveLength(5000)
  })

  test('an invalid cap rejects before anything runs', async () => {
    for (const bad of [0, -1, Number.NaN]) {
      await expect(
        callAgent(sh('never', 'exit 0'), { prompt: 'x', maxOutputBytes: bad }),
      ).rejects.toThrow(RangeError)
    }
    const notANumber = '10' as unknown as number
    await expect(
      callAgent(sh('never', 'exit 0'), { prompt: 'x', maxOutputBytes: notANumber }),
    ).rejects.toThrow(TypeError)
  })

  test('a fractional cap rounds up', async () => {
    const result = await callAgent(sh('flood', 'while :; do echo xxxxxxxxx; done'), {
      prompt: 'x',
      maxOutputBytes: 9.2,
    })
    expect(result.error?.reason).toBe('output-limit')
    expect(result.raw.stdout).toBe('xxxxxxxxx\n')
  })

  test('a timeout that came first stays the cause', async () => {
    const result = await callAgent(
      sh('slow', "trap '' TERM; sleep 0.3; while :; do echo xxxxxxxxx; done"),
      { prompt: 'x', timeoutMs: 100, maxOutputBytes: 100 },
    )
    expect(result.error?.reason).toBe('timeout')
    // The cap still cut the output during the kill grace, and says so.
    expect(result.raw.outputLimit).toBe('stdout')
    expect(Buffer.byteLength(result.raw.stdout)).toBe(100)
  }, 15_000)
})

describe('incompleteUtf8Tail', () => {
  test('counts the bytes of a trailing partial character', () => {
    const emoji = Buffer.from('\u{1F642}')
    expect(incompleteUtf8Tail(Buffer.from('abc'))).toBe(0)
    expect(incompleteUtf8Tail(emoji)).toBe(0)
    for (const n of [1, 2, 3]) expect(incompleteUtf8Tail(emoji.subarray(0, n))).toBe(n)
    expect(incompleteUtf8Tail(Buffer.from('é').subarray(0, 1))).toBe(1)
    expect(incompleteUtf8Tail(Buffer.alloc(0))).toBe(0)
  })
})
