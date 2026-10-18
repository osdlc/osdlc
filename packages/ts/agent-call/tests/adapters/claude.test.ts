import { describe, expect, test } from 'vitest'

import { claudeAdapter, claudePluginArgv } from '../../src/adapters/claude.js'
import type { RawProcessOutput } from '../../src/adapters/types.js'

const adapter = claudeAdapter()

function raw(stdout: string): RawProcessOutput {
  return { stdout, stderr: '', exitCode: 0, durationMs: 10, timedOut: false }
}

describe('claude plan', () => {
  test('resume binds the id with the = form', () => {
    const planned = adapter.plan({ prompt: 'x', session: { resume: '-abc' } })
    expect(planned.argv).toContain('--resume=-abc')
    expect(planned.argv).not.toContain('--resume')
  })

  test('plugins map to --plugin-dir and a disabling --settings', () => {
    const plugins = { dirs: ['/a', '/b'], disable: ['tools@market'] }
    const expected = [
      '--plugin-dir',
      '/a',
      '--plugin-dir',
      '/b',
      '--settings',
      '{"enabledPlugins":{"tools@market":false}}',
    ]
    expect(claudePluginArgv(plugins)).toEqual(expected)
    expect(claudePluginArgv({ dirs: ['/a'], disable: [] })).toEqual(['--plugin-dir', '/a'])

    const planned = adapter.plan({ prompt: 'x', plugins })
    expect(planned.argv.join(' ')).toContain(expected.join(' '))
    expect(planned.notes).toContainEqual(
      expect.objectContaining({ field: 'plugins', support: 'native' }),
    )
  })

  test('minimal spec defaults to the json envelope with prompt on stdin', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    expect(planned.argv).toEqual(['claude', '-p', '--output-format', 'json'])
    expect(planned.stdin).toBe('say hi')
    expect(planned.outputFormat).toBe('json')
  })

  test('full spec maps natively', () => {
    const planned = adapter.plan({
      prompt: 'do the thing',
      model: 'opus',
      effort: 'high',
      systemPrompt: 'you are terse',
      appendSystemPrompt: 'always cite files',
      permissions: {
        mode: 'edits',
        allowTools: ['Bash(git *)', 'Edit'],
        denyTools: ['WebFetch'],
      },
      context: { dirs: ['/tmp/a', '/tmp/b'], text: 'background info' },
      session: { id: 'u-u-i-d', persist: false },
      budgetUsd: 2.5,
      extraArgs: ['--verbose'],
    })
    const joined = planned.argv.join(' ')
    expect(joined).toContain('--model opus')
    expect(joined).toContain('--effort high')
    expect(adapter.plan({ prompt: 'x', effort: 'xhigh' }).argv.join(' ')).toContain(
      '--effort xhigh',
    )
    for (const effort of ['none', 'minimal'] as const) {
      const low = adapter.plan({ prompt: 'x', effort })
      expect(low.argv.join(' ')).toContain('--effort low')
      expect(low.notes.find((n) => n.field === 'effort')?.support).toBe('approximated')
    }
    expect(joined).toContain('--system-prompt you are terse')
    expect(joined).toContain('--append-system-prompt always cite files')
    expect(joined).toContain('--permission-mode acceptEdits')
    expect(joined).toContain('--allowedTools Bash(git *),Edit')
    expect(joined).toContain('--disallowedTools WebFetch')
    expect(joined).toContain('--add-dir /tmp/a')
    expect(joined).toContain('--add-dir /tmp/b')
    expect(joined).toContain('--session-id u-u-i-d')
    expect(joined).toContain('--no-session-persistence')
    expect(joined).toContain('--max-budget-usd 2.5')
    expect(joined).toContain('--verbose')
    expect(planned.stdin).toContain('<context>\nbackground info\n</context>')
    expect(planned.stdin).toContain('do the thing')
    // System prompts are native — must NOT be folded into the prompt.
    expect(planned.stdin).not.toContain('you are terse')
  })

  test('read-only maps to plan mode; bypass to skip-permissions', () => {
    const readOnly = adapter.plan({
      prompt: 'x',
      permissions: { mode: 'read-only' },
    })
    expect(readOnly.argv.join(' ')).toContain('--permission-mode plan')

    const bypass = adapter.plan({ prompt: 'x', permissions: { mode: 'bypass' } })
    expect(bypass.argv).toContain('--dangerously-skip-permissions')
  })

  test('schema is native and upgrades text to json', () => {
    const schema = { type: 'object' as const }
    const planned = adapter.plan({
      prompt: 'x',
      output: { format: 'text', schema },
    })
    expect(planned.outputFormat).toBe('json')
    expect(planned.argv.join(' ')).toContain('--json-schema')
    const upgrade = planned.notes.find((n) => n.field === 'output.format')
    expect(upgrade?.support).toBe('approximated')
    // Native schema: no emulation instruction appended to the prompt.
    expect(planned.stdin).not.toContain('JSON Schema')
  })

  test('stream-json adds --verbose', () => {
    const planned = adapter.plan({
      prompt: 'x',
      output: { format: 'stream-json' },
    })
    expect(planned.argv).toContain('--verbose')
  })

  test('context files are emulated with a preamble and noted', () => {
    const planned = adapter.plan({
      prompt: 'x',
      context: { files: ['src/a.ts', 'src/b.ts'] },
    })
    expect(planned.stdin).toContain('- src/a.ts')
    const fileNote = planned.notes.find((n) => n.field === 'context.files')
    expect(fileNote?.support).toBe('emulated')
  })

  test('mcp servers ride --mcp-config', () => {
    const planned = adapter.plan({
      prompt: 'x',
      mcp: {
        servers: { docs: { command: 'bun', args: ['run', 'mcp.ts'] } },
        strict: true,
      },
    })
    const idx = planned.argv.indexOf('--mcp-config')
    expect(idx).toBeGreaterThan(-1)
    expect(planned.argv[idx + 1]).toBe('__AGENT_CALL_TMP__/mcp.json')
    expect(planned.tempFiles).toHaveLength(1)
    expect(JSON.parse(planned.tempFiles[0]!.content)).toEqual({
      mcpServers: { docs: { command: 'bun', args: ['run', 'mcp.ts'] } },
    })
    expect(planned.argv).toContain('--strict-mcp-config')
  })
})

describe('claude parse', () => {
  const envelope = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'hello there',
    session_id: 'abc-123',
    total_cost_usd: 0.0042,
    num_turns: 1,
    duration_ms: 2000,
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: 2,
    },
  })

  test('json envelope', () => {
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(planned, raw(envelope))
    expect(parsed.text).toBe('hello there')
    expect(parsed.sessionId).toBe('abc-123')
    expect(parsed.costUsd).toBeCloseTo(0.0042)
    expect(parsed.usage?.inputTokens).toBe(10)
    expect(parsed.usage?.cacheReadTokens).toBe(5)
    expect(parsed.isError).toBe(false)
  })

  test('error envelope surfaces isError', () => {
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(
      planned,
      raw(
        JSON.stringify({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          result: 'boom',
          session_id: 's',
        }),
      ),
    )
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toBe('boom')
  })

  test('structured output prefers structured_output, falls back to parsing text', () => {
    const schema = { type: 'object' as const }
    const planned = adapter.plan({ prompt: 'hi', output: { schema } })
    const withField = adapter.parseResult(
      planned,
      raw(JSON.stringify({ type: 'result', result: '{}', structured_output: { a: 1 } })),
    )
    expect(withField.structured).toEqual({ a: 1 })

    const fromText = adapter.parseResult(
      planned,
      raw(JSON.stringify({ type: 'result', result: '```json\n{"b":2}\n```' })),
    )
    expect(fromText.structured).toEqual({ b: 2 })
  })

  test('stream-json without a result event reports an error, not empty success', () => {
    const lines = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'partial' }] },
    })
    const planned = adapter.plan({ prompt: 'x', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(lines))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toContain('no result event')
    expect(parsed.events).toHaveLength(1)
  })

  test('stream-json events and conversation', () => {
    const lines = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 's1',
        model: 'claude-fable-5',
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-fable-5',
          content: [
            { type: 'text', text: 'let me check' },
            { type: 'tool_use', id: 't1', name: 'Read', input: { file: 'a.ts' } },
          ],
        },
      }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'file body', is_error: false },
          ],
        },
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: 'done',
        session_id: 's1',
        total_cost_usd: 0.01,
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
    ].join('\n')

    const planned = adapter.plan({ prompt: 'hi', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(lines))
    expect(parsed.text).toBe('done')
    expect(parsed.events).toHaveLength(4)

    const conversation = adapter.toConversation?.(planned, raw(lines))
    expect(conversation?.model).toBe('claude-fable-5')
    expect(conversation?.sessionId).toBe('s1')
    const roles = conversation?.messages.map((m) => m.role)
    expect(roles).toEqual(['user', 'assistant', 'tool'])
    const assistant = conversation?.messages[1]
    expect(assistant?.parts.map((p) => p.type)).toEqual(['text', 'tool-call'])
  })
})

describe('claude mcp secrets', () => {
  test('server env stays out of argv', () => {
    const planned = adapter.plan({
      prompt: 'x',
      mcp: { servers: { docs: { command: 'bun', env: { TOKEN: 'sekrit-value' } } } },
    })
    expect(planned.argv.join(' ')).not.toContain('sekrit-value')
    expect(planned.tempFiles[0]?.content).toContain('sekrit-value')
  })
})
