/**
 * Results, failures and conversations. The agents here are `node` scripts, so
 * no agent CLI is needed.
 */

import { describe, expect, test } from 'vitest'

import {
  assistantText,
  callAgent,
  customAdapter,
  CONVERSATION_SCHEMA,
  toolCalls,
  type AgentAdapter,
  type AgentCallSpec,
  type AgentResult,
  type CallError,
  type CallOptions,
  type Conversation,
  type ConversationMessage,
  type Part,
  type Role,
  type Usage,
} from '@osdlc/agent-call'

const node = (script: string): AgentAdapter =>
  customAdapter({ name: 'node-script', binary: 'node', args: () => ['-e', script] })

describe('AgentResult', () => {
  test('a good run has the text, the exit code and the plan that ran', async () => {
    const result: AgentResult = await callAgent(node('console.log("fine")'), { prompt: 'x' })
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.text).toBe('fine')
    expect(result.exitCode).toBe(0)
    expect(result.raw.stdout).toBe('fine\n')
    expect(result.planned.agent).toBe('node-script')
  })
})

describe('CallError', () => {
  /** Handle the reasons you know and keep a default branch: new ones may be added. */
  function describeFailure(error: CallError): string {
    switch (error.reason) {
      case 'spawn-failed':
        return 'could not start'
      case 'timeout':
        return 'too slow'
      case 'nonzero-exit':
        return 'failed'
      default:
        return `failed: ${error.reason}`
    }
  }

  test('a missing binary is spawn-failed', async () => {
    const missing = customAdapter({ name: 'gone', binary: 'no-such-cli-xyz', args: () => [] })
    const result = await callAgent(missing, { prompt: 'x' })
    expect(result.ok).toBe(false)
    expect(result.error?.reason).toBe('spawn-failed')
    expect(describeFailure(result.error!)).toBe('could not start')
  })

  test('a nonzero exit is nonzero-exit, with the stderr in the detail', async () => {
    const result = await callAgent(node('console.error("bad flag"); process.exit(2)'), {
      prompt: 'x',
    })
    expect(result.error?.reason).toBe('nonzero-exit')
    expect(result.error?.detail).toContain('bad flag')
    expect(result.exitCode).toBe(2)
  })

  test('timeoutMs kills a slow run and reports timeout', async () => {
    const result = await callAgent(node('setTimeout(() => {}, 30000)'), {
      prompt: 'x',
      timeoutMs: 200,
    })
    expect(result.error?.reason).toBe('timeout')
    expect(describeFailure(result.error!)).toBe('too slow')
  })

  test('an agent-reported failure is agent-error', async () => {
    const reports = customAdapter({
      name: 'reports',
      binary: 'node',
      args: () => ['-e', 'console.log("quota exceeded")'],
      parse: (stdout) => ({ text: stdout.trim(), isError: true, errorDetail: 'quota exceeded' }),
    })
    const result = await callAgent(reports, { prompt: 'x' })
    expect(result.error).toEqual({ reason: 'agent-error', detail: 'quota exceeded' })
    expect(describeFailure(result.error!)).toBe('failed: agent-error')
  })
})

describe('CallOptions', () => {
  test('a signal stops the run, and undefined fields are accepted', async () => {
    const controller = new AbortController()
    const options: CallOptions = { signal: controller.signal, captureConversation: undefined }
    const pending = callAgent(node('setTimeout(() => {}, 30000)'), { prompt: 'x' }, options)
    setTimeout(() => controller.abort(), 100)
    const result = await pending
    expect(result.ok).toBe(false)
    expect(result.error?.reason).toBe('timeout')

    const unset: CallOptions = { signal: undefined }
    const again = await callAgent(node('console.log("ok")'), { prompt: 'x' }, unset)
    expect(again.ok).toBe(true)
  })
})

describe('conversations', () => {
  /** An adapter that lifts its transcript into the conversation model. */
  const recording: AgentAdapter = {
    ...customAdapter({
      name: 'recording',
      binary: 'node',
      args: () => ['-e', 'console.log("done")'],
    }),
    toConversation(planned, raw): Conversation {
      const usage: Usage = { inputTokens: 10, outputTokens: 2 }
      const role: Role = 'assistant'
      const parts: Part[] = [
        { type: 'tool-call', callId: 'c1', name: 'search', input: { q: 'bun' } },
        { type: 'text', text: raw.stdout.trim() },
      ]
      const messages: ConversationMessage[] = [
        { role: 'user', parts: [{ type: 'text', text: planned.argv.join(' ') }] },
        { role, parts },
        { role: 'tool', parts: [{ type: 'tool-result', callId: 'c1', output: 'found' }] },
      ]
      return {
        schema: CONVERSATION_SCHEMA,
        agent: 'recording',
        messages,
        usage,
        raw: { format: 'recording/text', data: raw.stdout },
      }
    },
  }

  test('captureConversation attaches the normalized transcript', async () => {
    const adapter = recording
    const spec: AgentCallSpec = { prompt: 'Which files changed?' }

    const result = await callAgent(adapter, spec, { captureConversation: true })
    const conversation = result.conversation!
    const answer = assistantText(conversation)
    const calls = toolCalls(conversation)

    expect(conversation.schema).toBe('agent-conversation/1')
    expect(answer).toBe('done')
    expect(calls.map((c) => c.name)).toEqual(['search'])
    expect(JSON.parse(JSON.stringify(conversation))).toEqual(conversation)
  })

  test('without captureConversation there is none', async () => {
    const result = await callAgent(recording, { prompt: 'x' })
    expect(result.conversation).toBeUndefined()
  })
})
