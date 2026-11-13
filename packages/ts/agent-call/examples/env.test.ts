/**
 * Keeping variables away from the agent: `inheritEnv`, `unsetEnv` and
 * `BASELINE_ENV`. Nothing here starts an agent CLI.
 */

import { describe, expect, test } from 'vitest'

import { adapterFor, BASELINE_ENV, callAgent } from '@osdlc/agent-call'

async function review() {
  const result = await callAgent(adapterFor('codex'), {
    prompt: 'Review the change.',
    inheritEnv: [...BASELINE_ENV, 'OPENAI_API_KEY'],
    unsetEnv: ['GH_TOKEN', 'GITHUB_TOKEN'],
  })
  return result
}

describe('environment control', () => {
  test('the baseline names what a CLI needs to start', () => {
    expect(BASELINE_ENV).toContain('PATH')
    expect(typeof review).toBe('function')
  })
})
