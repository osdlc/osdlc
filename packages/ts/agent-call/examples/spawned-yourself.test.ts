/**
 * For a caller that spawned the agent CLI itself: say why a run failed, and
 * parse its output. Fixed strings stand in for the CLI's output, so no agent
 * is needed.
 */

import { expect, test } from 'vitest'

import {
  callAgent,
  classifyFailure,
  customAdapter,
  parseOutput,
  type FailureCause,
  type FailureOutput,
} from '@osdlc/agent-call'

test('classifyFailure says why a run you spawned failed', () => {
  const output: FailureOutput = {
    stdout: '',
    stderr: 'Claude AI usage limit reached|1791374400',
    exitCode: 1,
  }
  const cause = classifyFailure('claude', output)
  expect(cause).toEqual({
    kind: 'rate-limit',
    resetAt: '2026-10-07T12:00:00.000Z',
    limit: 'usage limit',
  })
})

test('a cause is auth, rate-limit or quota', () => {
  const describeCause = (cause: FailureCause | undefined): string => {
    switch (cause?.kind) {
      case 'auth':
        return 'sign in again'
      case 'rate-limit':
        return `wait until ${cause.resetAt ?? 'later'} (${cause.limit})`
      case 'quota':
        return 'top up the account'
      default:
        return 'unknown'
    }
  }
  expect(describeCause({ kind: 'quota' })).toBe('top up the account')
  expect(describeCause(undefined)).toBe('unknown')
})

test('parseOutput reads the output of a CLI you spawned', () => {
  const stdout = JSON.stringify({ result: 'hi', session_id: 's-1', total_cost_usd: 0.01 })
  const parsed = parseOutput('claude', stdout, 'json')
  expect(parsed).toMatchObject({ text: 'hi', sessionId: 's-1', costUsd: 0.01 })
  expect(parseOutput('claude', '', 'json').text).toBe('')
})

test('callAgent puts the cause on the error', async () => {
  const adapter = {
    ...customAdapter({
      name: 'stub',
      binary: 'node',
      args: () => ['-e', 'console.error("Invalid API key · Please run /login"); process.exit(1)'],
    }),
    classifyFailure: (output: FailureOutput) => classifyFailure('claude', output),
  }
  const result = await callAgent(adapter, { prompt: 'x' })
  expect(result.error?.reason).toBe('nonzero-exit')
  expect(result.error?.cause).toEqual({ kind: 'auth' })
})
