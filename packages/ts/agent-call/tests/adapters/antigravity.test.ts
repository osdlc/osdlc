import { describe, expect, test } from 'vitest'

import { antigravityAdapter } from '../../src/adapters/antigravity.js'
import type { RawProcessOutput } from '../../src/adapters/types.js'

const adapter = antigravityAdapter()

function raw(stdout: string): RawProcessOutput {
  return { stdout, stderr: '', exitCode: 0, durationMs: 10, timedOut: false }
}

describe('antigravity plan', () => {
  test('minimal spec: json envelope, prompt rides -p', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    expect(planned.argv).toEqual(['agy', '--output-format', 'json', '-p', 'say hi'])
    expect(planned.stdin).toBeUndefined()
  })

  test('text format omits --output-format', () => {
    const planned = adapter.plan({ prompt: 'x', output: { format: 'text' } })
    expect(planned.argv).toEqual(['agy', '-p', 'x'])
  })

  test('permission modes map to sandbox / skip-permissions', () => {
    const readOnly = adapter.plan({ prompt: 'x', permissions: { mode: 'read-only' } })
    expect(readOnly.argv).toContain('--sandbox')

    const edits = adapter.plan({ prompt: 'x', permissions: { mode: 'edits' } })
    expect(edits.argv).not.toContain('--dangerously-skip-permissions')
    expect(edits.notes.find((n) => n.field === 'permissions.mode')?.support).toBe('dropped')

    const fullAuto = adapter.plan({ prompt: 'x', permissions: { mode: 'full-auto' } })
    expect(fullAuto.argv).toContain('--dangerously-skip-permissions')
    expect(fullAuto.notes.find((n) => n.field === 'permissions.mode')?.support).toBe('approximated')

    const bypass = adapter.plan({ prompt: 'x', permissions: { mode: 'bypass' } })
    expect(bypass.argv).toContain('--dangerously-skip-permissions')
    expect(bypass.notes.find((n) => n.field === 'permissions.mode')?.support).toBe('native')
  })

  test('none and minimal rise to low', () => {
    for (const effort of ['none', 'minimal'] as const) {
      const planned = adapter.plan({ prompt: 'x', effort })
      expect(planned.argv.join(' ')).toContain('--effort low')
      expect(planned.notes.find((n) => n.field === 'effort')?.support).toBe('approximated')
    }
  })

  test('effort is native; xhigh and max clamp to high', () => {
    const med = adapter.plan({ prompt: 'x', effort: 'medium' })
    expect(med.argv.join(' ')).toContain('--effort medium')
    for (const effort of ['xhigh', 'max'] as const) {
      const top = adapter.plan({ prompt: 'x', effort })
      expect(top.argv.join(' ')).toContain('--effort high')
      expect(top.notes.find((n) => n.field === 'effort')?.support).toBe('approximated')
    }
  })

  test('model passes through as --model', () => {
    expect(adapter.plan({ prompt: 'x', model: 'm1' }).argv.join(' ')).toContain('--model m1')
  })

  test('system prompts have no flag and are folded into the prompt', () => {
    const planned = adapter.plan({ prompt: 'q', systemPrompt: 'be terse' })
    const prompt = planned.argv[planned.argv.length - 1]
    expect(prompt).toContain('<system>\nbe terse\n</system>')
    expect(planned.env).toEqual({})
    expect(planned.notes.find((n) => n.field === 'systemPrompt')?.support).toBe('emulated')
  })

  test('context files use @ syntax; dirs are dropped', () => {
    const planned = adapter.plan({
      prompt: 'x',
      context: { files: ['src/a.ts'], dirs: ['/x'] },
    })
    expect(planned.argv[planned.argv.length - 1]).toContain('@src/a.ts')
    expect(planned.notes.find((n) => n.field === 'context.dirs')?.support).toBe('dropped')
  })

  test('resume and continue map natively, session pinning is dropped', () => {
    const resume = adapter.plan({ prompt: 'x', session: { resume: 'abc', id: 'pin' } })
    expect(resume.argv.join(' ')).toContain('--conversation abc')
    expect(resume.notes.find((n) => n.field === 'session.id')?.support).toBe('dropped')

    const last = adapter.plan({ prompt: 'x', session: { continueLast: true } })
    expect(last.argv).toContain('--continue')
  })

  test('schema is native and not repeated in the prompt', () => {
    const planned = adapter.plan({ prompt: 'x', output: { schema: { type: 'object' } } })
    expect(planned.argv).toContain('--json-schema')
    expect(planned.argv[planned.argv.length - 1]).toBe('x')
    expect(planned.notes.find((n) => n.field === 'output.schema')?.support).toBe('native')
  })
})

describe('antigravity parse', () => {
  const envelope = JSON.stringify({
    conversation_id: 'c1',
    status: 'SUCCESS',
    response: 'hello from agy',
    duration_seconds: 2,
    num_turns: 1,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      thinking_tokens: 5,
      cache_read_tokens: 30,
      total_tokens: 155,
    },
  })

  test('json envelope', () => {
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(planned, raw(envelope))
    expect(parsed.text).toBe('hello from agy')
    expect(parsed.sessionId).toBe('c1')
    expect(parsed.usage?.inputTokens).toBe(100)
    // thinking_tokens (5) are added to output, so the parts sum to total_tokens.
    expect(parsed.usage?.outputTokens).toBe(25)
    expect(parsed.usage?.cacheReadTokens).toBe(30)
    expect(parsed.usage?.totalTokens).toBe(155)
    expect(parsed.isError).toBe(false)
  })

  test('the conversation reports the planned prompt even with extra args after the flags', () => {
    const planned = adapter.plan({ prompt: 'hi', extraArgs: ['--print-timeout', '1m'] })
    const conversation = adapter.toConversation?.(planned, raw(envelope))
    expect(conversation?.messages[0]).toEqual({
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }],
    })
  })

  test('structured_output is preferred when a schema was requested', () => {
    const planned = adapter.plan({ prompt: 'hi', output: { schema: { type: 'object' } } })
    const parsed = adapter.parseResult(
      planned,
      raw(JSON.stringify({ status: 'SUCCESS', response: 'x', structured_output: { a: 1 } })),
    )
    expect(parsed.structured).toEqual({ a: 1 })
  })

  test('non-SUCCESS status and error string are errors', () => {
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(
      planned,
      raw(JSON.stringify({ status: 'ERROR', response: '', error: 'quota exceeded' })),
    )
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toBe('quota exceeded')

    const canceled = adapter.parseResult(planned, raw(JSON.stringify({ status: 'CANCELED' })))
    expect(canceled.isError).toBe(true)
    expect(canceled.errorDetail).toContain('CANCELED')
  })

  test('unparseable stdout is an error', () => {
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'hi' }), raw('not json'))
    expect(parsed.isError).toBe(true)
  })

  test('stream-json events', () => {
    const lines = [
      JSON.stringify({ event: 'init', cwd: '/w', tools: [], permission_mode: 'x', model: 'm1' }),
      JSON.stringify({
        event: 'step_update',
        conversation_id: 'c1',
        step_index: 1,
        state: 'DONE',
        step_type: 'tool',
        tool_name: 'read_file',
        tool_info: { path: 'a.ts' },
      }),
      JSON.stringify({
        event: 'step_update',
        conversation_id: 'c1',
        step_index: 2,
        state: 'ACTIVE',
        step_type: 'agent_response',
        text_delta: 'final ',
      }),
      JSON.stringify({
        event: 'step_update',
        conversation_id: 'c1',
        step_index: 2,
        state: 'ACTIVE',
        step_type: 'agent_response',
        text_delta: 'answer',
      }),
      JSON.stringify({
        event: 'result',
        conversation_id: 'c1',
        status: 'SUCCESS',
        response: 'final answer',
        usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
      }),
    ].join('\n')
    const planned = adapter.plan({ prompt: 'hi', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(lines))
    expect(parsed.text).toBe('final answer')
    expect(parsed.sessionId).toBe('c1')
    expect(parsed.model).toBe('m1')
    expect(parsed.usage?.inputTokens).toBe(5)
    expect(parsed.isError).toBe(false)

    const conversation = adapter.toConversation?.(planned, raw(lines))
    const partTypes = conversation?.messages.flatMap((m) => m.parts.map((p) => p.type))
    expect(partTypes).toEqual(['text', 'tool-call', 'text'])
  })

  test('a stream without a result event is an error but keeps streamed text', () => {
    const lines = JSON.stringify({
      event: 'step_update',
      step_type: 'agent_response',
      text_delta: 'partial',
    })
    const planned = adapter.plan({ prompt: 'hi', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(lines))
    expect(parsed.text).toBe('partial')
    expect(parsed.isError).toBe(true)
  })
})
