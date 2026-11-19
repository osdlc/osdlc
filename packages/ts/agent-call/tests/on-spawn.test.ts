import { describe, expect, test } from 'vitest'

import { customAdapter } from '../src/adapters/custom.js'
import { callAgent } from '../src/run.js'

// onSpawn: the pid and argv, handed to the caller once the process starts.

const sh = (script: string) =>
  customAdapter({ name: 'spawned', binary: '/bin/sh', args: () => ['-c', script] })

describe('onSpawn', () => {
  test('is called once, with the running pid and the argv', async () => {
    const calls: { pid: number; argv: readonly string[] }[] = []
    const result = await callAgent(
      sh('echo $$'),
      { prompt: 'x' },
      { onSpawn: (info) => calls.push(info) },
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]!.argv.slice(0, 2)).toEqual(['/bin/sh', '-c'])
    expect(Number.isInteger(calls[0]!.pid)).toBe(true)
    expect(result.raw.stdout.trim()).toBe(String(calls[0]!.pid))
  })

  test('a throw is swallowed and the run carries on', async () => {
    const result = await callAgent(
      sh('echo ok'),
      { prompt: 'x' },
      {
        onSpawn: () => {
          throw new Error('boom')
        },
      },
    )
    expect(result.raw.stdout.trim()).toBe('ok')
  })

  test('is not called when the run is aborted before it starts', async () => {
    const controller = new AbortController()
    controller.abort()
    let called = false
    await callAgent(
      sh('echo ok'),
      { prompt: 'x' },
      { signal: controller.signal, onSpawn: () => (called = true) },
    )
    expect(called).toBe(false)
  })

  test('an abort raised inside the callback stops the run', async () => {
    const controller = new AbortController()
    const result = await callAgent(
      sh('sleep 30'),
      { prompt: 'x' },
      { signal: controller.signal, onSpawn: () => controller.abort() },
    )
    expect(result.error?.reason).toBe('timeout')
  })
})
