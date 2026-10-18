import { describe, expect, test } from 'vitest'

import {
  assistantText,
  CONVERSATION_SCHEMA,
  toolCalls,
  type Conversation,
} from '../src/conversation.js'

function conversation(messages: Conversation['messages']): Conversation {
  return {
    schema: CONVERSATION_SCHEMA,
    agent: 'test',
    messages,
    raw: { format: 'test', data: null },
  }
}

describe('CONVERSATION_SCHEMA', () => {
  test('names the data model and its version', () => {
    expect(CONVERSATION_SCHEMA).toBe('agent-conversation/1')
  })
})

describe('assistantText', () => {
  test('joins the text parts of assistant messages with newlines', () => {
    const c = conversation([
      { role: 'user', parts: [{ type: 'text', text: 'question' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'first' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'second' }] },
    ])
    expect(assistantText(c)).toBe('first\nsecond')
  })

  test('skips other roles, other part types and empty text', () => {
    const c = conversation([
      { role: 'tool', parts: [{ type: 'text', text: 'from a tool' }] },
      {
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'thinking' },
          { type: 'text', text: '' },
          { type: 'tool-call', name: 'shell', input: {} },
          { type: 'text', text: 'answer' },
        ],
      },
    ])
    expect(assistantText(c)).toBe('answer')
  })

  test('is empty for a conversation with no assistant text', () => {
    expect(assistantText(conversation([]))).toBe('')
  })
})

describe('toolCalls', () => {
  test('returns every tool call in order, across messages and roles', () => {
    const c = conversation([
      {
        role: 'assistant',
        parts: [{ type: 'tool-call', callId: '1', name: 'a', input: { x: 1 } }],
      },
      {
        role: 'tool',
        parts: [{ type: 'tool-result', callId: '1', name: 'a', output: 'ok' }],
      },
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'between' },
          { type: 'tool-call', name: 'b', input: null },
        ],
      },
    ])
    expect(toolCalls(c).map((call) => call.name)).toEqual(['a', 'b'])
    expect(toolCalls(c)[0]?.input).toEqual({ x: 1 })
  })

  test('is empty when the run made no tool calls', () => {
    expect(
      toolCalls(conversation([{ role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }])),
    ).toEqual([])
  })
})
