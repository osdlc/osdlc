/**
 * The README quick start, run. These examples use the package the way a
 * consumer does, through its name, and need no agent CLI: the built-in
 * adapters are only planned, and the run goes through `customAdapter` over
 * `node`. `tests/exports.test.ts` checks that every README code block appears
 * here and that every export is used somewhere in this directory.
 */

import { describe, expect, test } from 'vitest'

import {
  adapterFor,
  callAgent,
  customAdapter,
  planCall,
  type AgentCallSpec,
} from '@osdlc/agent-call'

describe('quick start', () => {
  test('plan a call without running it', () => {
    const spec: AgentCallSpec = {
      prompt: 'Summarize the failing tests and propose a fix.',
      permissions: { mode: 'read-only' },
      context: { files: ['src/runner.ts'] },
      timeoutMs: 120_000,
    }

    const planned = planCall(adapterFor('codex'), spec)
    expect(planned.argv.slice(0, 2)).toEqual(['codex', 'exec'])
    expect(planned.argv).toContain('read-only')
    expect(planned.stdin).toContain('src/runner.ts')
    expect(planned.notes.map((n) => [n.field, n.support])).toContainEqual([
      'context.files',
      'emulated',
    ])
  })

  test('run any one-shot CLI through the same spec', async () => {
    const shout = customAdapter({
      name: 'shout',
      binary: 'node',
      args: (_spec, prompt) => ['-e', 'console.log(process.argv[1].toUpperCase())', prompt],
    })

    const result = await callAgent(shout, { prompt: 'hello' })
    expect(result.ok).toBe(true)
    expect(result.text).toBe('HELLO')
    expect(result.exitCode).toBe(0)
  })
})
