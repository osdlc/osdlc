import { describe, expect, test } from 'vitest'

import { assistantText, toolCalls } from '../../src/conversation.js'
import { piAdapter } from '../../src/adapters/pi.js'
import type { RawProcessOutput } from '../../src/adapters/types.js'
import { TMP_TOKEN } from '../../src/plan.js'

const adapter = piAdapter()

function raw(stdout: string, stderr = '', exitCode = 0): RawProcessOutput {
  return { stdout, stderr, exitCode, durationMs: 10, timedOut: false }
}

function noteFor(planned: ReturnType<typeof adapter.plan>, field: string) {
  return planned.notes.find((n) => n.field === field)
}

describe('pi plan', () => {
  test('minimal spec: json event stream, prompt on stdin', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    expect(planned.argv).toEqual(['pi', '--mode', 'json'])
    expect(planned.stdin).toBe('say hi')
    expect(planned.agent).toBe('pi')
    expect(noteFor(planned, 'output.format')?.support).toBe('approximated')
  })

  test('binary override', () => {
    expect(piAdapter({ binary: '/opt/pi' }).plan({ prompt: 'x' }).argv[0]).toBe('/opt/pi')
  })

  test('text uses -p; stream-json shares --mode json without a note', () => {
    const text = adapter.plan({ prompt: 'x', output: { format: 'text' } })
    expect(text.argv).toEqual(['pi', '-p'])
    expect(text.notes).toEqual([])

    const stream = adapter.plan({ prompt: 'x', output: { format: 'stream-json' } })
    expect(stream.argv).toEqual(['pi', '--mode', 'json'])
    expect(noteFor(stream, 'output.format')).toBeUndefined()
  })

  test('model passes through; effort is --thinking for every level', () => {
    expect(adapter.plan({ prompt: 'x', model: 'mock/m1' }).argv.join(' ')).toContain(
      '--model mock/m1',
    )
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
      const planned = adapter.plan({ prompt: 'x', effort })
      expect(planned.argv.join(' ')).toContain(`--thinking ${effort}`)
      expect(noteFor(planned, 'effort')?.support).toBe('native')
    }
  })

  test('system prompts travel in temp files, not argv or the prompt', () => {
    const planned = adapter.plan({
      prompt: 'q',
      systemPrompt: 'be terse',
      appendSystemPrompt: 'cite files',
    })
    const args = planned.argv.join(' ')
    expect(args).toContain(`--system-prompt ${TMP_TOKEN}/system-prompt.md`)
    expect(args).toContain(`--append-system-prompt ${TMP_TOKEN}/append-system-prompt.md`)
    expect(args).not.toContain('be terse')
    expect(planned.tempFiles).toEqual([
      { name: 'system-prompt.md', content: 'be terse' },
      { name: 'append-system-prompt.md', content: 'cite files' },
    ])
    expect(planned.stdin).toBe('q')
    expect(noteFor(planned, 'systemPrompt')?.support).toBe('native')
    expect(noteFor(planned, 'appendSystemPrompt')?.support).toBe('native')
  })

  test('permission modes are tool selections', () => {
    const readOnly = adapter.plan({ prompt: 'x', permissions: { mode: 'read-only' } })
    expect(readOnly.argv.join(' ')).toContain('--tools read,grep,find,ls')
    expect(noteFor(readOnly, 'permissions.mode')?.support).toBe('approximated')

    const edits = adapter.plan({ prompt: 'x', permissions: { mode: 'edits' } })
    expect(edits.argv.join(' ')).toContain('--tools read,grep,find,ls,edit,write')
    expect(edits.argv.join(' ')).not.toContain('bash')
    expect(noteFor(edits, 'permissions.mode')?.support).toBe('approximated')

    const all = '--tools +read,+bash,+edit,+write,+grep,+find,+ls'
    const fullAuto = adapter.plan({ prompt: 'x', permissions: { mode: 'full-auto' } })
    expect(fullAuto.argv.join(' ')).toContain(all)
    expect(noteFor(fullAuto, 'permissions.mode')?.support).toBe('approximated')

    const bypass = adapter.plan({ prompt: 'x', permissions: { mode: 'bypass' } })
    expect(bypass.argv.join(' ')).toContain(all)
    expect(noteFor(bypass, 'permissions.mode')?.support).toBe('native')

    const standard = adapter.plan({ prompt: 'x', permissions: { mode: 'default' } })
    expect(standard.argv).toEqual(['pi', '--mode', 'json'])
    expect(noteFor(standard, 'permissions.mode')).toBeUndefined()
  })

  test('allowTools merge into the one --tools list; denyTools are --exclude-tools', () => {
    const alone = adapter.plan({ prompt: 'x', permissions: { allowTools: ['grep', '+ls'] } })
    expect(alone.argv.join(' ')).toContain('--tools +grep,+ls')
    expect(noteFor(alone, 'permissions.allowTools')?.support).toBe('approximated')

    const readOnly = adapter.plan({
      prompt: 'x',
      permissions: { mode: 'read-only', allowTools: ['bash', '+codemode'] },
    })
    expect(readOnly.argv.filter((a) => a === '--tools')).toHaveLength(1)
    // pi rejects a list mixing plain names with +name entries.
    expect(readOnly.argv.join(' ')).toContain('--tools read,grep,find,ls,bash,codemode')

    const bypass = adapter.plan({
      prompt: 'x',
      permissions: { mode: 'bypass', allowTools: ['codemode'] },
    })
    expect(bypass.argv.join(' ')).toContain('+ls,+codemode')

    const deny = adapter.plan({ prompt: 'x', permissions: { denyTools: ['bash', 'mcp__*'] } })
    expect(deny.argv.join(' ')).toContain('--exclude-tools bash,mcp__*')
    expect(noteFor(deny, 'permissions.denyTools')?.support).toBe('native')
  })

  test('context files are @path args; text is a preamble; dirs are dropped', () => {
    const planned = adapter.plan({
      prompt: 'x',
      context: { files: ['src/a.ts'], dirs: ['/x'], text: 'background' },
    })
    expect(planned.argv).toContain('@src/a.ts')
    expect(planned.stdin).toBe('<context>\nbackground\n</context>\n\nx')
    expect(noteFor(planned, 'context.files')?.support).toBe('native')
    expect(noteFor(planned, 'context.dirs')?.support).toBe('dropped')
  })

  test('schema is emulated in the prompt', () => {
    const planned = adapter.plan({ prompt: 'x', output: { schema: { type: 'object' } } })
    expect(planned.stdin).toContain('validates against this JSON Schema')
    expect(noteFor(planned, 'output.schema')?.support).toBe('emulated')
  })

  test('sessions: resume, continue, pinned id, no persistence', () => {
    const resume = adapter.plan({ prompt: 'x', session: { resume: 'abc' } })
    expect(resume.argv.join(' ')).toContain('--session abc')

    const last = adapter.plan({ prompt: 'x', session: { continueLast: true } })
    expect(last.argv).toContain('--continue')

    const pinned = adapter.plan({ prompt: 'x', session: { id: 'my-id', persist: false } })
    expect(pinned.argv.join(' ')).toContain('--session-id my-id')
    expect(pinned.argv).toContain('--no-session')
    expect(noteFor(pinned, 'session.id')?.support).toBe('native')
    expect(noteFor(pinned, 'session.persist')?.support).toBe('native')

    // pi refuses --session-id with --session, and --no-session would drop the resume.
    const both = adapter.plan({
      prompt: 'x',
      session: { resume: 'abc', id: 'pin', persist: false },
    })
    expect(both.argv).not.toContain('--session-id')
    expect(both.argv).not.toContain('--no-session')
    expect(noteFor(both, 'session.id')?.support).toBe('dropped')
    expect(noteFor(both, 'session.persist')?.support).toBe('dropped')
  })

  test('mcp, plugins and budget are dropped; cwd, env and extraArgs pass through', () => {
    const planned = adapter.plan({
      prompt: 'x',
      mcp: { servers: { docs: { command: 'docs-mcp', env: { TOKEN: 's3cret' } } } },
      plugins: { dirs: ['/p'], disable: [] },
      budgetUsd: 1,
      cwd: '/repo',
      env: { A: '1' },
      extraArgs: ['--no-context-files'],
    })
    expect(noteFor(planned, 'mcp.servers')?.support).toBe('dropped')
    expect(noteFor(planned, 'plugins')?.support).toBe('dropped')
    expect(noteFor(planned, 'budgetUsd')?.support).toBe('dropped')
    expect(planned.argv.join(' ')).not.toContain('s3cret')
    expect(planned.argv[planned.argv.length - 1]).toBe('--no-context-files')
    expect(planned.cwd).toBe('/repo')
    expect(planned.env).toEqual({ A: '1' })
  })
})

// Fixtures captured from pi 1.3.0 `--mode json` against a local OpenAI-compatible
// mock provider (models.json). Trimmed: the leading system message (prompt
// sections and tool schemas), message_start/message_update deltas, turn_end and
// agent_end copies of messages, and the session cwd are left out.
const SIMPLE = [
  '{"type":"session","version":3,"id":"01a14dce-5fdd-74c9-8f43-7b0b34f0b33e","timestamp":"2026-10-18T06:58:53.022Z","cwd":"/w"}',
  '{"type":"agent_start"}',
  '{"type":"turn_start"}',
  '{"type":"message_end","message":{"role":"user","content":[{"type":"text","text":"say hi"}],"timestamp":1792306733118}}',
  '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"pong"}],"api":"openai-completions","provider":"mock","model":"mock-model","usage":{"input":11,"output":3,"cacheRead":0,"cacheWrite":0,"reasoning":0,"totalTokens":14,"cost":{"input":0.000033,"output":0.000045,"cacheRead":0,"cacheWrite":0,"total":0.000078}},"stopReason":"stop","timestamp":1792306733151,"responseId":"chatcmpl-mock","rawStopReason":"stop","durationMs":57,"thinkingLevel":"medium"}}',
  '{"type":"agent_settled","aborted":false}',
].join('\n')

const TOOL_RUN = [
  '{"type":"session","version":3,"id":"01a14dcb-1cd5-7380-8d0d-0af3d525733c","timestamp":"2026-10-18T06:55:19.254Z","cwd":"/w"}',
  '{"type":"agent_start"}',
  '{"type":"turn_start"}',
  '{"type":"message_end","message":{"role":"user","content":[{"type":"text","text":"run echo"}],"timestamp":1792306519336}}',
  '{"type":"message_end","message":{"role":"assistant","content":[{"type":"toolCall","id":"call_1","name":"bash","arguments":{"command":"echo hi-from-tool"}}],"api":"openai-completions","provider":"mock","model":"mock-model","usage":{"input":11,"output":3,"cacheRead":0,"cacheWrite":0,"reasoning":0,"totalTokens":14,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"toolUse","timestamp":1792306519359,"responseId":"chatcmpl-mock","rawStopReason":"tool_calls","durationMs":47,"thinkingLevel":"medium"}}',
  '{"type":"tool_execution_start","toolCallId":"call_1","toolName":"bash","args":{"command":"echo hi-from-tool"}}',
  '{"type":"tool_execution_end","toolCallId":"call_1","toolName":"bash","result":{"content":[{"type":"text","text":"hi-from-tool\\n"}],"structuredContent":{"output":"hi-from-tool\\n","truncated":false,"exit_code":0,"wall_time_seconds":0}},"isError":false,"durationMs":11}',
  '{"type":"message_end","message":{"role":"toolResult","toolCallId":"call_1","toolName":"bash","content":[{"type":"text","text":"hi-from-tool\\n"}],"isError":false,"durationMs":11,"timestamp":1792306519422}}',
  '{"type":"turn_start"}',
  '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"done"}],"api":"openai-completions","provider":"mock","model":"mock-model","usage":{"input":11,"output":3,"cacheRead":0,"cacheWrite":0,"reasoning":0,"totalTokens":14,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"stop","timestamp":1792306519425,"responseId":"chatcmpl-mock","rawStopReason":"stop","durationMs":7,"thinkingLevel":"medium"}}',
  '{"type":"agent_settled","aborted":false}',
].join('\n')

// A tool pi did not enable (bash under --tools read,grep,find,ls): the call
// comes back as an error result, and the run goes on.
const DISABLED_TOOL_RESULT =
  '{"type":"message_end","message":{"role":"toolResult","toolCallId":"call_1","toolName":"bash","content":[{"type":"text","text":"Tool bash not found"}],"details":{},"isError":true,"timestamp":1792306526767}}'

/** An unreachable provider: pi retries three times (attempts 2 and 3 trimmed), then gives up and still exits 0. */
const assistantError = (ts: number) =>
  `{"type":"message_end","message":{"role":"assistant","content":[],"api":"openai-completions","provider":"broken","model":"mock-model","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"error","timestamp":${ts},"errorMessage":"Connection error.","durationMs":2,"thinkingLevel":"off"}}`
const PROVIDER_ERROR = [
  '{"type":"session","version":3,"id":"01a14dcb-86f8-7440-9d71-0a41092489e5","timestamp":"2026-10-18T06:55:46.425Z","cwd":"/w"}',
  '{"type":"agent_start"}',
  '{"type":"turn_start"}',
  '{"type":"message_end","message":{"role":"user","content":[{"type":"text","text":"hi"}],"timestamp":1792306546489}}',
  assistantError(1792306546509),
  '{"type":"auto_retry_start","attempt":1,"maxAttempts":3,"delayMs":2000,"errorMessage":"Connection error."}',
  '{"type":"agent_start"}',
  assistantError(1792306548533),
  '{"type":"agent_end","messages":[],"willRetry":false}',
  '{"type":"auto_retry_end","success":false,"attempt":3,"finalError":"Connection error."}',
  '{"type":"agent_settled","aborted":false}',
].join('\n')

describe('pi parse', () => {
  test('json events aggregate into text, session, usage and cost', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    const parsed = adapter.parseResult(planned, raw(SIMPLE))
    expect(parsed.text).toBe('pong')
    expect(parsed.sessionId).toBe('01a14dce-5fdd-74c9-8f43-7b0b34f0b33e')
    expect(parsed.model).toBe('mock-model')
    expect(parsed.stopReason).toBe('stop')
    expect(parsed.usage).toEqual({
      inputTokens: 11,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 14,
    })
    expect(parsed.costUsd).toBeCloseTo(0.000078)
    expect(parsed.isError).toBe(false)
    expect(parsed.events).toHaveLength(6)
  })

  test('usage sums over the model calls of a tool run; text is the final answer', () => {
    const planned = adapter.plan({ prompt: 'run echo', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(TOOL_RUN))
    expect(parsed.text).toBe('done')
    expect(parsed.usage?.inputTokens).toBe(22)
    expect(parsed.usage?.totalTokens).toBe(28)
    expect(parsed.isError).toBe(false)
  })

  test('a provider error exits 0 but is an error, with the final retry reason', () => {
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(planned, raw(PROVIDER_ERROR))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toBe('Connection error.')
    expect(parsed.stopReason).toBe('error')
    expect(parsed.text).toBe('')
  })

  test('a startup failure has no events and reports stderr', () => {
    // Captured: `pi --mode json --model nosuch/zzz` exits 1 with only this on stderr.
    const planned = adapter.plan({ prompt: 'hi', model: 'nosuch/zzz' })
    const parsed = adapter.parseResult(
      planned,
      raw(
        '',
        'Error: Model "nosuch/zzz" not found. Use --list-models to see available models.\n',
        1,
      ),
    )
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toContain('Model "nosuch/zzz" not found')
  })

  test('an aborted run is an error', () => {
    // Built from the documented agent_settled shape; not captured.
    const planned = adapter.plan({ prompt: 'say hi' })
    const parsed = adapter.parseResult(
      planned,
      raw(SIMPLE.replace('"aborted":false', '"aborted":true')),
    )
    expect(parsed.isError).toBe(true)
  })

  test('text format is the printed answer', () => {
    // Captured: `printf 'say hi' | pi -p` prints `pong`.
    const planned = adapter.plan({ prompt: 'say hi', output: { format: 'text' } })
    expect(adapter.parseResult(planned, raw('pong\n')).text).toBe('pong')
  })

  test('schema answers are parsed into structured', () => {
    const planned = adapter.plan({ prompt: 'x', output: { schema: { type: 'object' } } })
    const parsed = adapter.parseResult(
      planned,
      raw(SIMPLE.replace('"text":"pong"', '"text":"{\\"a\\":1}"')),
    )
    expect(parsed.structured).toEqual({ a: 1 })
  })
})

describe('pi conversation', () => {
  test('tool calls and results come from message_end events', () => {
    const planned = adapter.plan({ prompt: 'run echo' })
    const conversation = adapter.toConversation?.(planned, raw(TOOL_RUN))
    expect(conversation?.agent).toBe('pi')
    expect(conversation?.sessionId).toBe('01a14dcb-1cd5-7380-8d0d-0af3d525733c')
    expect(conversation?.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ])
    expect(conversation?.messages[0]?.timestamp).toBe(new Date(1792306519336).toISOString())
    expect(toolCalls(conversation!)).toEqual([
      {
        type: 'tool-call',
        callId: 'call_1',
        name: 'bash',
        input: { command: 'echo hi-from-tool' },
      },
    ])
    expect(conversation?.messages[2]?.parts[0]).toEqual({
      type: 'tool-result',
      callId: 'call_1',
      name: 'bash',
      output: 'hi-from-tool\n',
      isError: false,
    })
    expect(assistantText(conversation!)).toBe('done')
    expect(conversation?.usage?.totalTokens).toBe(28)
    expect(conversation?.stopReason).toBe('stop')
    expect(conversation?.raw.format).toBe('pi/jsonl')
  })

  test('a disabled tool surfaces as an error result', () => {
    const planned = adapter.plan({ prompt: 'run echo', permissions: { mode: 'read-only' } })
    const conversation = adapter.toConversation?.(planned, raw(DISABLED_TOOL_RESULT))
    expect(conversation?.messages[0]?.parts[0]).toMatchObject({
      type: 'tool-result',
      output: 'Tool bash not found',
      isError: true,
    })
  })

  test('thinking blocks become reasoning parts', () => {
    // Built from the documented ThinkingContent shape; the mock emits no thinking.
    const line =
      '{"type":"message_end","message":{"role":"assistant","content":[{"type":"thinking","thinking":"plan it"},{"type":"text","text":"ok"}],"model":"m","usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0,"totalTokens":2,"cost":{"total":0}},"stopReason":"stop","timestamp":1}}'
    const conversation = adapter.toConversation?.(adapter.plan({ prompt: 'x' }), raw(line))
    expect(conversation?.messages[0]?.parts.map((p) => p.type)).toEqual(['reasoning', 'text'])
  })

  test('errors and text runs still record the exchange', () => {
    const errored = adapter.toConversation?.(adapter.plan({ prompt: 'hi' }), raw(PROVIDER_ERROR))
    expect(errored?.stopReason).toBe('error')
    expect(errored?.messages.map((m) => m.role)).toEqual(['user'])

    const planned = adapter.plan({ prompt: 'say hi', output: { format: 'text' } })
    const text = adapter.toConversation?.(planned, raw('pong\n'))
    expect(text?.messages).toEqual([
      { role: 'user', parts: [{ type: 'text', text: 'say hi' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'pong' }] },
    ])
    expect(text?.raw).toEqual({ format: 'pi/text', data: 'pong\n' })
  })
})
