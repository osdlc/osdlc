import { describe, expect, test } from 'vitest'

import { customAdapter } from '../src/adapters/custom.js'
import { callAgent } from '../src/run.js'

// onOutput: output handed to the caller as it arrives. Real processes,
// harmless shell scripts.

const sh = (name: string, script: string) =>
  customAdapter({ name, binary: '/bin/sh', args: () => ['-c', script] })

/** Run with an onOutput that records every chunk. */
async function record(script: string, spec: { maxOutputBytes?: number } = {}) {
  const chunks: [string, 'stdout' | 'stderr'][] = []
  const result = await callAgent(
    sh('rec', script),
    { prompt: 'x', ...spec },
    { onOutput: (chunk, stream) => chunks.push([chunk, stream]) },
  )
  const joined = (stream: 'stdout' | 'stderr') =>
    chunks
      .filter(([, s]) => s === stream)
      .map(([c]) => c)
      .join('')
  return { result, chunks, joined }
}

describe('onOutput', () => {
  test('delivers chunks while the agent is still running', async () => {
    let firstAt: number | undefined
    const started = Date.now()
    await callAgent(
      sh('slow', 'echo early; sleep 0.5; echo late'),
      { prompt: 'x' },
      { onOutput: () => (firstAt ??= Date.now() - started) },
    )
    expect(firstAt).toBeDefined()
    expect(firstAt!).toBeLessThan(400)
  })

  test("each stream's chunks join to exactly what raw collects", async () => {
    const { result, joined } = await record(
      'i=0; while [ $i -lt 200 ]; do echo "line $i"; echo "err $i" >&2; i=$((i+1)); done',
    )
    expect(joined('stdout')).toBe(result.raw.stdout)
    expect(joined('stderr')).toBe(result.raw.stderr)
    expect(result.raw.stdout).toContain('line 199')
  })

  test('a character split across reads arrives whole', async () => {
    const { chunks, joined } = await record("printf 'a\\360\\237'; sleep 0.1; printf '\\231\\202b'")
    expect(joined('stdout')).toBe('a\u{1F642}b')
    for (const [chunk] of chunks) expect(chunk).not.toContain('�')
  })

  test('nothing is delivered past maxOutputBytes', async () => {
    const { result, joined } = await record('while :; do echo xxxxxxxxx; done', {
      maxOutputBytes: 100,
    })
    expect(result.error?.reason).toBe('output-limit')
    expect(joined('stdout')).toBe(result.raw.stdout)
    expect(Buffer.byteLength(joined('stdout'))).toBe(100)
  })

  test('a throw is swallowed, stops later calls, and the run carries on', async () => {
    let calls = 0
    const result = await callAgent(
      sh('throwing', 'echo one; sleep 0.1; echo two'),
      { prompt: 'x' },
      {
        onOutput: () => {
          calls++
          throw new Error('boom')
        },
      },
    )
    expect(calls).toBe(1)
    expect(result.ok).toBe(true)
    expect(result.raw.stdout).toBe('one\ntwo\n')
  })

  test('it accepts undefined, for exactOptionalPropertyTypes callers', async () => {
    const result = await callAgent(sh('plain', 'echo hi'), { prompt: 'x' }, { onOutput: undefined })
    expect(result.text).toBe('hi')
  })
})
