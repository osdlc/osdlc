/**
 * `parseOutput`. The envelopes and expected fields follow the usage parser
 * tests in solutions/ontological/lib/services/usage/headless.test.ts, which
 * read claude, codex and cursor output a caller spawned itself. No test runs a
 * CLI.
 */

import { describe, expect, test } from 'vitest'

import { callAgent, customAdapter, parseOutput, adapterFor } from '../src/index.js'

const claudeEnvelope = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  session_id: 'sess-abc',
  total_cost_usd: 0.05,
  result: 'hi',
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 10,
    cache_creation_input_tokens: 4,
  },
  modelUsage: {
    'claude-haiku-5': { inputTokens: 20, outputTokens: 10 },
    'claude-sonnet-5': {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 10,
      cacheCreationInputTokens: 4,
    },
  },
})

describe('claude json', () => {
  test('maps answer, session, cost, tokens and the dominant model', () => {
    expect(parseOutput('claude', claudeEnvelope, 'json')).toMatchObject({
      text: 'hi',
      sessionId: 'sess-abc',
      costUsd: 0.05,
      model: 'claude-sonnet-5',
      isError: false,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 4 },
    })
  })

  test('tolerates whitespace around the envelope and a missing modelUsage', () => {
    const stdout = `\n  ${JSON.stringify({ result: 'x', session_id: 's', model: 'ignored' })}  \n`
    const parsed = parseOutput('claude', stdout, 'json')
    expect(parsed).toMatchObject({ text: 'x', sessionId: 's' })
    expect(parsed.model).toBeUndefined()
  })

  test('agrees with parseResult on every field but model', async () => {
    const adapter = adapterFor('claude')
    const planned = adapter.plan({ prompt: 'x', output: { format: 'json' } })
    const raw = { stdout: claudeEnvelope, stderr: '', exitCode: 0, durationMs: 0, timedOut: false }
    const { model, ...rest } = parseOutput(adapter, claudeEnvelope, 'json')
    const { model: none, ...expected } = adapter.parseResult(planned, raw)
    expect(none).toBeUndefined()
    expect(model).toBe('claude-sonnet-5')
    expect(rest).toEqual(expected)
  })

  test('reads a structured answer when a schema is given', () => {
    const stdout = JSON.stringify({ result: '{"a":1}', is_error: false })
    expect(
      parseOutput('claude', stdout, 'json', { schema: { type: 'object' } }).structured,
    ).toEqual({
      a: 1,
    })
  })
})

describe('codex --json', () => {
  test('maps session and tokens from the JSONL events', () => {
    const stdout = [
      { type: 'thread.started', thread_id: 't-1' },
      { type: 'item.completed', item: { type: 'agent_message', text: 'done' } },
      {
        type: 'turn.completed',
        usage: { input_tokens: 200, output_tokens: 80, cached_input_tokens: 30 },
      },
    ]
      .map((e) => JSON.stringify(e))
      .join('\n')
    expect(parseOutput('codex', stdout, 'json')).toMatchObject({
      text: 'done',
      sessionId: 't-1',
      usage: { inputTokens: 200, outputTokens: 80, cacheReadTokens: 30 },
    })
  })

  test('reads the legacy token_count shape and skips malformed lines', () => {
    const stdout = [
      '{"type":"trunc',
      JSON.stringify({
        msg: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 5, output_tokens: 6, cached_input_tokens: 1 },
          },
        },
      }),
    ].join('\n')
    expect(parseOutput('codex', stdout, 'json').usage).toMatchObject({
      inputTokens: 5,
      outputTokens: 6,
      cacheReadTokens: 1,
    })
  })
})

describe('cursor json', () => {
  test('maps session and camelCase tokens', () => {
    const stdout = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'ok',
      session_id: 'c-1',
      usage: { inputTokens: 7, outputTokens: 8, cacheReadTokens: 9, cacheWriteTokens: 10 },
    })
    expect(parseOutput('cursor', stdout, 'json')).toMatchObject({
      text: 'ok',
      sessionId: 'c-1',
      usage: { inputTokens: 7, outputTokens: 8, cacheReadTokens: 9, cacheWriteTokens: 10 },
    })
  })
})

describe('text and stream-json', () => {
  test('text is the trimmed stdout', () => {
    expect(parseOutput('claude', ' hello \n', 'text').text).toBe('hello')
  })

  test('stream-json returns the events and the final result', () => {
    const stdout = [
      { type: 'system', model: 'claude-sonnet-5' },
      { type: 'result', is_error: false, result: 'fin', session_id: 's' },
    ]
      .map((e) => JSON.stringify(e))
      .join('\n')
    const parsed = parseOutput('claude', stdout, 'stream-json')
    expect(parsed).toMatchObject({ text: 'fin', sessionId: 's', model: 'claude-sonnet-5' })
    expect(parsed.events).toHaveLength(2)
  })
})

describe('malformed output', () => {
  test.each(['claude', 'codex', 'cursor', 'qwen', 'droid', 'opencode'] as const)(
    '%s: empty and malformed stdout never throw',
    (agent) => {
      for (const format of ['json', 'stream-json', 'text'] as const) {
        for (const stdout of ['', 'not json at all', '{"type":"trunc', '[1,', 'null', '42']) {
          const parsed = parseOutput(agent, stdout, format)
          expect(typeof parsed.text).toBe('string')
        }
      }
    },
  )

  test('unparseable json is reported as an error with no fields', () => {
    expect(parseOutput('claude', '', 'json')).toMatchObject({ text: '', isError: true })
    expect(parseOutput('claude', '', 'json').sessionId).toBeUndefined()
  })

  test('an unknown agent name or a throwing adapter gives empty text', () => {
    expect(parseOutput('nope' as never, '{}', 'json')).toEqual({ text: '' })
    const adapter = {
      ...customAdapter({ name: 'stub', binary: 'x', args: () => [] }),
      parseResult: () => {
        throw new Error('bad')
      },
    }
    expect(parseOutput(adapter, '{}', 'json')).toEqual({ text: '' })
  })

  test('callAgent still parses a run the same way', async () => {
    const adapter = customAdapter({
      name: 'stub',
      binary: 'node',
      args: () => ['-e', 'console.log("hi")'],
    })
    const result = await callAgent(adapter, { prompt: 'x' })
    expect(result.text).toBe(parseOutput(adapter, 'hi\n', 'text').text)
  })
})
