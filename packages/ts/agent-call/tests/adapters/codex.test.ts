import { describe, expect, test } from 'vitest'

import { TMP_TOKEN } from '../../src/plan.js'
import { codexAdapter } from '../../src/adapters/codex.js'
import type { RawProcessOutput } from '../../src/adapters/types.js'

const adapter = codexAdapter()

function raw(stdout: string, files?: Record<string, string>): RawProcessOutput {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    durationMs: 10,
    timedOut: false,
    files,
  }
}

describe('codex plan', () => {
  test('minimal spec: exec, jsonl events, stdin prompt, last-message capture', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    expect(planned.argv[0]).toBe('codex')
    expect(planned.argv[1]).toBe('exec')
    expect(planned.argv).toContain('--json')
    expect(planned.argv).toContain('--skip-git-repo-check')
    expect(planned.argv[planned.argv.length - 1]).toBe('-')
    expect(planned.stdin).toBe('say hi')
    const lastMsgIdx = planned.argv.indexOf('--output-last-message')
    expect(planned.argv[lastMsgIdx + 1]).toBe(`${TMP_TOKEN}/last-message.txt`)
    expect(planned.tempFiles.map((f) => f.name)).toContain('last-message.txt')
  })

  test('permission modes map to sandbox flags', () => {
    const readOnly = adapter.plan({ prompt: 'x', permissions: { mode: 'read-only' } })
    expect(readOnly.argv.join(' ')).toContain('--sandbox read-only')

    const fullAuto = adapter.plan({ prompt: 'x', permissions: { mode: 'full-auto' } })
    expect(fullAuto.argv.join(' ')).toContain('--sandbox workspace-write')

    const bypass = adapter.plan({ prompt: 'x', permissions: { mode: 'bypass' } })
    expect(bypass.argv).toContain('--dangerously-bypass-approvals-and-sandbox')
  })

  test('tool rules are dropped with notes', () => {
    const planned = adapter.plan({
      prompt: 'x',
      permissions: { allowTools: ['Bash'], denyTools: ['Edit'] },
    })
    const fields = planned.notes.filter((n) => n.support === 'dropped').map((n) => n.field)
    expect(fields).toContain('permissions.allowTools')
    expect(fields).toContain('permissions.denyTools')
  })

  test('plugins are dropped with a note', () => {
    const planned = adapter.plan({
      prompt: 'x',
      plugins: { dirs: ['/a'], disable: ['tools@market'] },
    })
    expect(planned.argv).not.toContain('--plugin-dir')
    expect(planned.argv).not.toContain('--settings')
    expect(planned.notes).toContainEqual(
      expect.objectContaining({ field: 'plugins', support: 'dropped' }),
    )
  })

  test('resume becomes the resume subcommand', () => {
    const byId = adapter.plan({ prompt: 'x', session: { resume: 'thread-1' } })
    expect(byId.argv.slice(1, 4)).toEqual(['exec', 'resume', 'thread-1'])

    const last = adapter.plan({ prompt: 'x', session: { continueLast: true } })
    expect(last.argv.slice(1, 4)).toEqual(['exec', 'resume', '--last'])
  })

  test('schema writes a temp file for --output-schema', () => {
    const planned = adapter.plan({
      prompt: 'x',
      output: { schema: { type: 'object' } },
    })
    const idx = planned.argv.indexOf('--output-schema')
    expect(planned.argv[idx + 1]).toBe(`${TMP_TOKEN}/output-schema.json`)
    const file = planned.tempFiles.find((f) => f.name === 'output-schema.json')
    expect(file?.content).toBe('{"type":"object"}')
  })

  test('system prompt is emulated in the prompt', () => {
    const planned = adapter.plan({ prompt: 'x', systemPrompt: 'be terse' })
    expect(planned.stdin).toContain('<system>\nbe terse\n</system>')
    const n = planned.notes.find((note) => note.field === 'systemPrompt')
    expect(n?.support).toBe('emulated')
  })

  test('mcp servers render as -c overrides', () => {
    const planned = adapter.plan({
      prompt: 'x',
      mcp: { servers: { docs: { command: 'bun', args: ['mcp.ts'] } } },
    })
    const joined = planned.argv.join(' ')
    expect(joined).toContain('mcp_servers.docs.command="bun"')
    expect(joined).toContain('mcp_servers.docs.args=["mcp.ts"]')
  })

  test('effort maps to model_reasoning_effort', () => {
    const planned = adapter.plan({ prompt: 'x', effort: 'low' })
    expect(planned.argv.join(' ')).toContain('model_reasoning_effort="low"')
  })

  test('none, minimal, xhigh and max pass through natively', () => {
    for (const effort of ['none', 'minimal', 'xhigh', 'max'] as const) {
      const planned = adapter.plan({ prompt: 'x', effort })
      expect(planned.argv.join(' ')).toContain(`model_reasoning_effort="${effort}"`)
      expect(planned.notes.find((n) => n.field === 'effort')?.support).toBe('native')
    }
  })
})

describe('codex parse', () => {
  const events = [
    JSON.stringify({ type: 'thread.started', thread_id: 'th_1' }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'i1', type: 'reasoning', text: 'thinking...' },
    }),
    JSON.stringify({
      type: 'item.completed',
      item: {
        id: 'i2',
        type: 'command_execution',
        command: 'ls',
        aggregated_output: 'a.ts',
        exit_code: 0,
      },
    }),
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'i3', type: 'agent_message', text: 'all done' },
    }),
    JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 25 },
    }),
  ].join('\n')

  test('jsonl events aggregate into a result', () => {
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(planned, raw(events))
    expect(parsed.text).toBe('all done')
    expect(parsed.sessionId).toBe('th_1')
    expect(parsed.usage?.inputTokens).toBe(100)
    expect(parsed.usage?.cacheReadTokens).toBe(40)
    expect(parsed.isError).toBe(false)
  })

  test('last-message file wins as text in text mode', () => {
    const planned = adapter.plan({ prompt: 'hi', output: { format: 'text' } })
    const parsed = adapter.parseResult(
      planned,
      raw('progress noise', { 'last-message.txt': 'clean answer\n' }),
    )
    expect(parsed.text).toBe('clean answer')
  })

  test('legacy msg-shaped events still parse', () => {
    const legacy = [
      JSON.stringify({ id: '0', msg: { type: 'agent_message', message: 'legacy answer' } }),
      JSON.stringify({
        id: '1',
        msg: {
          type: 'token_count',
          info: { total_token_usage: { input_tokens: 7, output_tokens: 3 } },
        },
      }),
    ].join('\n')
    const planned = adapter.plan({ prompt: 'hi' })
    // No last-message file in this scenario: exercise the event fallback.
    const parsed = adapter.parseResult(planned, raw(legacy))
    expect(parsed.text).toBe('legacy answer')
    expect(parsed.usage?.inputTokens).toBe(7)
  })

  test("warning-level error items don't fail an answered run", () => {
    const withWarning = [
      JSON.stringify({ type: 'thread.started', thread_id: 'th_2' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'i0', type: 'error', message: '`[features].codex_hooks` is deprecated.' },
      }),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'i1', type: 'agent_message', text: 'pong' },
      }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }),
    ].join('\n')
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(planned, raw(withWarning))
    expect(parsed.text).toBe('pong')
    expect(parsed.isError).toBe(false)
    // The detail is still reported.
    expect(parsed.errorDetail).toContain('deprecated')
  })

  test('error with no answer fails the run', () => {
    const fatal = [
      JSON.stringify({ type: 'thread.started', thread_id: 'th_3' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'i0', type: 'error', message: 'auth expired' },
      }),
    ].join('\n')
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(planned, raw(fatal))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toBe('auth expired')
  })

  test('conversation lifts commands into tool call/result pairs', () => {
    const planned = adapter.plan({ prompt: 'hi' })
    const conversation = adapter.toConversation?.(planned, raw(events))
    expect(conversation?.agent).toBe('codex')
    expect(conversation?.sessionId).toBe('th_1')
    const partTypes = conversation?.messages.flatMap((m) => m.parts.map((p) => p.type))
    expect(partTypes).toEqual(['text', 'reasoning', 'tool-call', 'tool-result', 'text'])
  })
})

describe('codex conversation, other item types', () => {
  const planned = adapter.plan({ prompt: 'go' })
  const item = (value: Record<string, unknown>): string =>
    JSON.stringify({ type: 'item.completed', item: value })

  test('a failed command is a tool result with isError', () => {
    const out = item({
      id: 'c1',
      type: 'command_execution',
      command: 'false',
      aggregated_output: '',
      exit_code: 1,
    })
    const conversation = adapter.toConversation?.(planned, raw(out))
    const result = conversation?.messages
      .flatMap((m) => m.parts)
      .find((p) => p.type === 'tool-result')
    expect(result).toMatchObject({ callId: 'c1', name: 'shell', isError: true })
  })

  test('a file change is an apply_patch tool call', () => {
    const changes = [{ path: 'a.ts', kind: 'update' }]
    const conversation = adapter.toConversation?.(
      planned,
      raw(item({ id: 'f1', type: 'file_change', changes })),
    )
    expect(conversation?.messages[1]).toEqual({
      role: 'assistant',
      parts: [{ type: 'tool-call', callId: 'f1', name: 'apply_patch', input: { changes } }],
    })
  })

  test('an MCP tool call keeps the tool name and arguments', () => {
    const conversation = adapter.toConversation?.(
      planned,
      raw(item({ id: 'm1', type: 'mcp_tool_call', tool: 'search', arguments: { q: 'x' } })),
    )
    expect(conversation?.messages[1]?.parts[0]).toEqual({
      type: 'tool-call',
      callId: 'm1',
      name: 'search',
      input: { q: 'x' },
    })
  })

  test('an MCP tool call with no tool name is called mcp', () => {
    const conversation = adapter.toConversation?.(
      planned,
      raw(item({ id: 'm2', type: 'mcp_tool_call', arguments: {} })),
    )
    expect(conversation?.messages[1]?.parts[0]).toMatchObject({ type: 'tool-call', name: 'mcp' })
  })

  test('a web search is a web_search tool call', () => {
    const conversation = adapter.toConversation?.(
      planned,
      raw(item({ id: 'w1', type: 'web_search', query: 'bun test' })),
    )
    expect(conversation?.messages[1]?.parts[0]).toEqual({
      type: 'tool-call',
      callId: 'w1',
      name: 'web_search',
      input: { query: 'bun test' },
    })
  })

  test('unknown item types and non-item events add no messages', () => {
    const out = [
      item({ id: 'x', type: 'something_new' }),
      JSON.stringify({ type: 'turn.started' }),
    ].join('\n')
    const conversation = adapter.toConversation?.(planned, raw(out))
    expect(conversation?.messages).toHaveLength(1)
  })

  test('text format with no events still records the final answer', () => {
    const textPlanned = adapter.plan({ prompt: 'go', output: { format: 'text' } })
    const conversation = adapter.toConversation?.(
      textPlanned,
      raw('noise', { 'last-message.txt': 'the answer' }),
    )
    expect(conversation?.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(conversation?.raw).toEqual({ format: 'codex/jsonl', data: 'noise' })
  })

  test('a failed turn marks the conversation stop reason as error', () => {
    const out = [JSON.stringify({ type: 'turn.failed', error: { message: 'rate limited' } })].join(
      '\n',
    )
    const conversation = adapter.toConversation?.(planned, raw(out))
    expect(conversation?.stopReason).toBe('error')
  })
})

describe('codex parse, remaining branches', () => {
  test('a top-level error event fails a run with no answer', () => {
    const planned = adapter.plan({ prompt: 'x' })
    const parsed = adapter.parseResult(
      planned,
      raw(JSON.stringify({ type: 'error', message: 'boom' })),
    )
    expect(parsed).toMatchObject({ isError: true, errorDetail: 'boom' })
  })

  test('a top-level error event without a message gets a default detail', () => {
    const planned = adapter.plan({ prompt: 'x' })
    const parsed = adapter.parseResult(planned, raw(JSON.stringify({ type: 'error' })))
    expect(parsed.errorDetail).toBe('codex reported an error')
  })

  test('turn.failed without a message says the turn failed', () => {
    const planned = adapter.plan({ prompt: 'x' })
    const parsed = adapter.parseResult(planned, raw(JSON.stringify({ type: 'turn.failed' })))
    expect(parsed).toMatchObject({ isError: true, errorDetail: 'turn failed' })
  })

  test('a legacy error message is surfaced', () => {
    const planned = adapter.plan({ prompt: 'x' })
    const legacy = JSON.stringify({ id: '0', msg: { type: 'error', message: 'legacy failure' } })
    const parsed = adapter.parseResult(planned, raw(legacy))
    expect(parsed).toMatchObject({ isError: true, errorDetail: 'legacy failure' })
  })

  test('a requested schema is parsed from the answer', () => {
    const planned = adapter.plan({ prompt: 'x', output: { schema: { type: 'object' } } })
    const out = JSON.stringify({
      type: 'item.completed',
      item: { id: 'a', type: 'agent_message', text: '{"ok":true}' },
    })
    expect(adapter.parseResult(planned, raw(out)).structured).toEqual({ ok: true })
  })

  test('codex plans carry notes for dropped tool rules, budget and plugins', () => {
    const planned = adapter.plan({
      prompt: 'x',
      permissions: { allowTools: ['a'], denyTools: ['b'] },
      budgetUsd: 1,
      plugins: { dirs: ['/p'], disable: [] },
      mcp: { servers: { s: { command: 'c' } }, strict: true },
      session: { id: 'fixed' },
    })
    const dropped = planned.notes.filter((n) => n.support === 'dropped').map((n) => n.field)
    expect(dropped.sort()).toEqual(
      [
        'budgetUsd',
        'mcp.strict',
        'permissions.allowTools',
        'permissions.denyTools',
        'plugins',
        'session.id',
      ].sort(),
    )
  })

  test('TOML overrides render numbers, booleans, arrays and tables, and skip null', () => {
    const planned = adapter.plan({
      prompt: 'x',
      mcp: { servers: { s: { n: 3, b: true, a: ['x', 1], t: { k: 'v' }, z: null } } },
    })
    const joined = planned.argv.join(' ')
    expect(joined).toContain('mcp_servers.s.n=3')
    expect(joined).toContain('mcp_servers.s.b=true')
    expect(joined).toContain('mcp_servers.s.a=["x", 1]')
    expect(joined).toContain('mcp_servers.s.t={k = "v"}')
    expect(joined).not.toContain('mcp_servers.s.z')
  })
})
