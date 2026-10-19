import { describe, expect, test } from 'vitest'

import { adapterFor, detectAgents } from '../src/registry.js'
import { callAgent } from '../src/run.js'

// Live smoke tests: real agent calls, real tokens. Opt in with
//   AGENT_CALL_LIVE=1 pnpm test:live
// Each test skips itself if the CLI isn't installed.

const live = process.env['AGENT_CALL_LIVE'] === '1'

describe.skipIf(!live)('live smoke', () => {
  test('claude answers with metadata', { timeout: 150_000 }, async () => {
    const [claude] = await detectAgents([adapterFor('claude')])
    if (claude?.available !== true) return
    const result = await callAgent(
      adapterFor('claude'),
      {
        prompt: 'Reply with exactly the word: pong',
        model: 'haiku',
        session: { persist: false },
        timeoutMs: 120_000,
      },
      { captureConversation: true },
    )
    expect(result.ok).toBe(true)
    expect(result.text.toLowerCase()).toContain('pong')
    expect(result.sessionId).toBeDefined()
    expect(result.usage?.outputTokens).toBeGreaterThan(0)
    expect(result.conversation?.messages.length).toBeGreaterThanOrEqual(2)
  })

  test('codex answers over jsonl events', { timeout: 150_000 }, async () => {
    const [codex] = await detectAgents([adapterFor('codex')])
    if (codex?.available !== true) return
    const result = await callAgent(adapterFor('codex'), {
      prompt: 'Reply with exactly the word: pong',
      permissions: { mode: 'read-only' },
      timeoutMs: 120_000,
    })
    expect(result.ok).toBe(true)
    expect(result.text.toLowerCase()).toContain('pong')
  })

  test('opencode answers over json events', { timeout: 150_000 }, async () => {
    const [opencode] = await detectAgents([adapterFor('opencode')])
    if (opencode?.available !== true) return
    const result = await callAgent(adapterFor('opencode'), {
      prompt: 'Reply with exactly the word: pong',
      timeoutMs: 120_000,
    })
    expect(result.ok).toBe(true)
    expect(result.text.toLowerCase()).toContain('pong')
  })
  // The six agents added after the first four. Each answers with its own default model and
  // credentials; pi needs a model with credentials in the environment.
  for (const name of ['copilot', 'pi', 'qwen', 'droid', 'cursor', 'deepseek'] as const) {
    test(`${name} answers`, { timeout: 150_000 }, async () => {
      const [agent] = await detectAgents([adapterFor(name)])
      if (agent?.available !== true) return
      const result = await callAgent(adapterFor(name), {
        prompt: 'Reply with exactly the word: pong',
        permissions: { mode: 'read-only' },
        timeoutMs: 120_000,
      })
      expect(result.ok).toBe(true)
      expect(result.text.toLowerCase()).toContain('pong')
      expect(result.sessionId).toBeDefined()
    })
  }
})
