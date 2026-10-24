import { describe, expect, test } from 'vitest'

import { copilotAdapter } from '../../src/adapters/copilot.js'
import type { RawProcessOutput } from '../../src/adapters/types.js'
import { TMP_TOKEN } from '../../src/plan.js'

const adapter = copilotAdapter()

function raw(stdout: string, files?: Record<string, string>): RawProcessOutput {
  return { stdout, stderr: '', exitCode: 0, durationMs: 10, timedOut: false, files }
}

function noteFor(planned: ReturnType<typeof adapter.plan>, field: string) {
  return planned.notes.find((n) => n.field === field)
}

describe('copilot plan', () => {
  test('minimal spec: json events, usage file, prompt on stdin', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    expect(planned.agent).toBe('copilot')
    expect(planned.argv).toEqual([
      'copilot',
      '--output-format',
      'json',
      '--usage-output-file',
      `${TMP_TOKEN}/usage.json`,
    ])
    expect(planned.stdin).toBe('say hi')
    expect(planned.prompt).toBeUndefined()
    expect(planned.tempFiles).toEqual([{ name: 'usage.json', content: '', readBack: true }])
    expect(noteFor(planned, 'output.format')?.support).toBe('approximated')
  })

  test('text is silent (no stats footer); stream-json is the same events, not noted', () => {
    const text = adapter.plan({ prompt: 'x', output: { format: 'text' } })
    expect(text.argv).toContain('-s')
    expect(text.argv).not.toContain('--output-format')
    expect(text.notes).toEqual([])

    const stream = adapter.plan({ prompt: 'x', output: { format: 'stream-json' } })
    expect(stream.argv.join(' ')).toContain('--output-format json')
    expect(stream.outputFormat).toBe('stream-json')
    expect(stream.notes).toEqual([])
  })

  test('model passes through as --model', () => {
    expect(adapter.plan({ prompt: 'x', model: 'gpt-5.4' }).argv.join(' ')).toContain(
      '--model gpt-5.4',
    )
  })

  test('every effort level passes through as --reasoning-effort', () => {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
      const planned = adapter.plan({ prompt: 'x', effort })
      expect(planned.argv.join(' ')).toContain(`--reasoning-effort ${effort}`)
      expect(noteFor(planned, 'effort')?.support).toBe('native')
    }
  })

  test('none and minimal pass through: copilot 1.0.98 takes both', () => {
    for (const effort of ['none', 'minimal'] as const) {
      const planned = adapter.plan({ prompt: 'x', effort })
      expect(planned.argv.join(' ')).toContain(`--reasoning-effort ${effort}`)
      expect(noteFor(planned, 'effort')?.support).toBe('native')
    }
  })

  test('system prompt is folded into the prompt', () => {
    const planned = adapter.plan({ prompt: 'q', systemPrompt: 'be terse' })
    expect(planned.stdin).toContain('<system>\nbe terse\n</system>')
    expect(noteFor(planned, 'systemPrompt')?.support).toBe('emulated')
  })

  test('appended system prompt becomes a custom-instructions file', () => {
    const planned = adapter.plan({ prompt: 'q', appendSystemPrompt: 'cite files' })
    expect(planned.stdin).toBe('q')
    expect(planned.env['COPILOT_CUSTOM_INSTRUCTIONS_DIRS']).toBe(TMP_TOKEN)
    expect(planned.tempFiles).toContainEqual({
      name: 'agent-call.instructions.md',
      content: 'cite files\n',
    })
    expect(noteFor(planned, 'appendSystemPrompt')?.support).toBe('approximated')

    // A caller's own directories are kept after the adapter's.
    const merged = adapter.plan({
      prompt: 'q',
      appendSystemPrompt: 'x',
      env: { COPILOT_CUSTOM_INSTRUCTIONS_DIRS: '/team' },
    })
    expect(merged.env['COPILOT_CUSTOM_INSTRUCTIONS_DIRS']).toBe(`${TMP_TOKEN},/team`)
  })

  test('permission modes map to tool rules; default adds nothing', () => {
    const base = adapter.plan({ prompt: 'x' }).argv
    expect(adapter.plan({ prompt: 'x', permissions: { mode: 'default' } }).argv).toEqual(base)

    const readOnly = adapter.plan({ prompt: 'x', permissions: { mode: 'read-only' } })
    expect(readOnly.argv).toContain('--deny-tool=write')
    expect(noteFor(readOnly, 'permissions.mode')?.support).toBe('approximated')

    const edits = adapter.plan({ prompt: 'x', permissions: { mode: 'edits' } })
    expect(edits.argv).toContain('--allow-tool=write')
    expect(edits.argv).not.toContain('--allow-all-tools')
    expect(noteFor(edits, 'permissions.mode')?.support).toBe('native')

    const fullAuto = adapter.plan({ prompt: 'x', permissions: { mode: 'full-auto' } })
    expect(fullAuto.argv).toContain('--allow-all-tools')
    expect(noteFor(fullAuto, 'permissions.mode')?.support).toBe('approximated')

    const bypass = adapter.plan({ prompt: 'x', permissions: { mode: 'bypass' } })
    expect(bypass.argv).toContain('--allow-all')
    expect(noteFor(bypass, 'permissions.mode')?.support).toBe('native')
  })

  test('tool rules bind one pattern per flag', () => {
    const planned = adapter.plan({
      prompt: 'x',
      permissions: { allowTools: ['shell(git:*)', 'write'], denyTools: ['shell(git push)'] },
    })
    expect(planned.argv).toContain('--allow-tool=shell(git:*)')
    expect(planned.argv).toContain('--allow-tool=write')
    expect(planned.argv).toContain('--deny-tool=shell(git push)')
    expect(noteFor(planned, 'permissions.allowTools')?.support).toBe('native')
    expect(noteFor(planned, 'permissions.denyTools')?.support).toBe('native')
  })

  test('context: files listed in the preamble, dirs via --add-dir, text prepended', () => {
    const planned = adapter.plan({
      prompt: 'x',
      context: { files: ['src/a.ts'], dirs: ['/extra'], text: 'background' },
    })
    expect(planned.stdin).toContain('- src/a.ts')
    expect(planned.stdin).toContain('<context>\nbackground\n</context>')
    expect(planned.argv.join(' ')).toContain('--add-dir /extra')
    expect(noteFor(planned, 'context.files')?.support).toBe('emulated')
    expect(noteFor(planned, 'context.dirs')?.support).toBe('native')
  })

  test('schema is emulated in the prompt', () => {
    const planned = adapter.plan({ prompt: 'x', output: { schema: { type: 'object' } } })
    expect(planned.stdin).toContain('Respond with ONLY a JSON value')
    expect(noteFor(planned, 'output.schema')?.support).toBe('emulated')
  })

  test('sessions: resume, continue and id are native; persist:false is dropped', () => {
    const resume = adapter.plan({ prompt: 'x', session: { resume: 'abc' } })
    expect(resume.argv).toContain('--resume=abc')

    const last = adapter.plan({ prompt: 'x', session: { continueLast: true } })
    expect(last.argv).toContain('--continue')

    const pinned = adapter.plan({
      prompt: 'x',
      session: { id: '0cb916db-26aa-40f2-86b5-1ba81b225fd2' },
    })
    expect(pinned.argv).toContain('--session-id=0cb916db-26aa-40f2-86b5-1ba81b225fd2')
    expect(noteFor(pinned, 'session.id')?.support).toBe('native')

    const ephemeral = adapter.plan({ prompt: 'x', session: { persist: false } })
    expect(noteFor(ephemeral, 'session.persist')?.support).toBe('dropped')
  })

  test('MCP servers go through a temp file, keeping env secrets off argv', () => {
    const servers = { gh: { command: 'gh-mcp', env: { TOKEN: 'secret' } } }
    const planned = adapter.plan({ prompt: 'x', mcp: { servers, strict: true } })
    expect(planned.argv.join(' ')).toContain(`--additional-mcp-config @${TMP_TOKEN}/mcp.json`)
    expect(planned.argv.join(' ')).not.toContain('secret')
    expect(planned.tempFiles).toContainEqual({
      name: 'mcp.json',
      content: JSON.stringify({ mcpServers: servers }),
    })
    expect(planned.argv).toContain('--disable-builtin-mcps')
    expect(noteFor(planned, 'mcp.servers')?.support).toBe('native')
    expect(noteFor(planned, 'mcp.strict')?.support).toBe('approximated')
  })

  test('plugin dirs load with --plugin-dir; disable has no flag', () => {
    const planned = adapter.plan({ prompt: 'x', plugins: { dirs: ['/p'], disable: ['a@b'] } })
    expect(planned.argv.join(' ')).toContain('--plugin-dir /p')
    expect(noteFor(planned, 'plugins')?.support).toBe('approximated')
  })

  test('budget is dropped (AI credits are not dollars)', () => {
    const planned = adapter.plan({ prompt: 'x', budgetUsd: 1 })
    expect(planned.argv.join(' ')).not.toContain('--max-ai-credits')
    expect(noteFor(planned, 'budgetUsd')?.support).toBe('dropped')
  })

  test('extraArgs append last; cwd and env ride the plan; timeout is not a flag', () => {
    const planned = adapter.plan({
      prompt: 'x',
      extraArgs: ['--no-auto-update'],
      cwd: '/w',
      env: { COPILOT_GITHUB_TOKEN: 't' },
      timeoutMs: 1000,
    })
    expect(planned.argv[planned.argv.length - 1]).toBe('--no-auto-update')
    expect(planned.cwd).toBe('/w')
    expect(planned.env).toEqual({ COPILOT_GITHUB_TOKEN: 't' })
    expect(planned.notes).toHaveLength(1) // output.format only
  })
})

// Fixtures captured from copilot 1.0.98 (`--output-format json`) in BYOK mode
// against a local mock model server, trimmed to the events the parser reads
// plus a little surrounding noise. Ids are as captured.
const USAGE_REPORT = JSON.stringify({
  totalPremiumRequestCost: 0,
  totalNanoAiu: 0,
  aiCreditsStatus: 'unavailable',
  currentModel: 'gpt-4.1',
  modelMetrics: {
    'gpt-4.1': {
      requests: { count: 1, cost: 0 },
      usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 },
      totalNanoAiu: 0,
      aiCreditsStatus: 'unavailable',
    },
  },
})

const PLAIN_RUN = [
  '{"type":"session.tools_updated","data":{"model":"gpt-4.1"},"ephemeral":true,"id":"33de5d3a-f84f-48e5-969b-5d2d54e8098c","timestamp":"2026-10-18T06:51:44.833Z"}',
  '{"type":"user.message","data":{"content":"say hi\\n","transformedContent":"<current_datetime>2026-10-18T06:59:04.628+00:00</current_datetime>\\n\\nsay hi","messageId":"cfa422d6-6e66-4164-aace-473404a25580","turnId":"0"},"id":"8b8abc6e-0fdf-41ce-9678-820a704df5f0","timestamp":"2026-10-18T06:59:04.628Z"}',
  '{"type":"assistant.message_delta","data":{"messageId":"18350c64-6be5-4e70-b5a1-82cfa7c01434","deltaContent":"hello from copilot"},"ephemeral":true,"id":"4686ec4a-e885-4040-8408-171308e29793","timestamp":"2026-10-18T06:59:04.676Z"}',
  '{"type":"assistant.message","data":{"messageId":"18350c64-6be5-4e70-b5a1-82cfa7c01434","model":"gpt-4.1","content":"hello from copilot","toolRequests":[],"turnId":"0","apiCallId":"chatcmpl-mock"},"id":"28da6912-50b4-48f8-9c4d-582f34fb7e1a","timestamp":"2026-10-18T06:59:04.677Z"}',
  '{"type":"assistant.turn_end","data":{"turnId":"0"},"id":"04400658-db7b-4db4-812b-2375d472a2d7","timestamp":"2026-10-18T06:59:04.680Z"}',
  '{"type":"result","timestamp":"2026-10-18T06:59:04.692Z","sessionId":"3b6f9664-aff5-413c-8c3c-c3510aa21ec0","exitCode":0,"usage":{"premiumRequests":0,"totalApiDurationMs":29,"sessionDurationMs":221,"codeChanges":{"linesAdded":0,"linesRemoved":0,"filesModified":[]}}}',
].join('\n')

// The mock answered the first turn with a bash tool call, run under --allow-all-tools.
const TOOL_RUN = [
  '{"type":"user.message","data":{"content":"run echo hi\\n","turnId":"0"},"id":"b750be78-59ea-4f45-ad6c-b1806384296d","timestamp":"2026-10-18T06:54:13.134Z"}',
  '{"type":"assistant.message","data":{"messageId":"6bd23b0d-8ed9-44a9-a3cd-2c3f38fb15ae","model":"gpt-4.1","content":"","toolRequests":[{"toolCallId":"call_1","name":"bash","arguments":{"command":"echo hi","description":"Print hi"},"type":"function","intentionSummary":"Print hi","toolTitle":"Running command"}],"turnId":"0","apiCallId":"chatcmpl-mock"},"id":"128a75a7-47e7-4d98-b1ea-7effc0533a6d","timestamp":"2026-10-18T06:54:13.221Z"}',
  '{"type":"tool.execution_start","data":{"toolCallId":"call_1","toolName":"bash","arguments":{"command":"echo hi","description":"Print hi"},"turnId":"0","model":"gpt-4.1","toolTitle":"Running command"},"id":"8e7d3194-ccf9-45ba-9bf8-c7a09a9d0219","timestamp":"2026-10-18T06:54:13.228Z"}',
  '{"type":"tool.execution_partial_result","data":{"toolCallId":"call_1","partialOutput":"hi\\n"},"ephemeral":true,"id":"5ee89247-9c72-4790-add3-f0c1ae9a881c","timestamp":"2026-10-18T06:54:13.278Z"}',
  '{"type":"tool.execution_complete","data":{"toolCallId":"call_1","model":"gpt-4.1","turnId":"0","shellExecution":{"exitCode":0},"success":true,"result":{"content":"hi\\n<shellId: 0 completed with exit code 0>","detailedContent":"hi\\n<shellId: 0 completed with exit code 0>"}},"id":"eab03048-d14f-4015-ad92-9fde78c937b5","timestamp":"2026-10-18T06:54:13.289Z"}',
  '{"type":"assistant.message","data":{"messageId":"49a43a34-c75a-40ad-89a5-c31f5810bcce","model":"gpt-4.1","content":"done: hi","toolRequests":[],"turnId":"1","apiCallId":"chatcmpl-mock"},"id":"4b4747ee-9396-4a77-8cf0-de4804e7b611","timestamp":"2026-10-18T06:54:13.312Z"}',
  '{"type":"result","timestamp":"2026-10-18T06:54:13.334Z","sessionId":"0b17fb09-1be2-42fe-8fa2-a3cdcc869404","exitCode":0,"usage":{"premiumRequests":0,"totalApiDurationMs":47,"sessionDurationMs":332,"codeChanges":{"linesAdded":0,"linesRemoved":0,"filesModified":[]}}}',
].join('\n')

// No allow flag: the CLI denies the write-like shell call instead of prompting.
const DENIED_TOOL =
  '{"type":"tool.execution_complete","data":{"toolCallId":"call_1","model":"gpt-4.1","turnId":"0","success":false,"error":{"message":"Permission denied because no interactive user response was available. Retry in an interactive session so the user can approve it, or try an alternative that does not require this permission.","code":"denied"}},"id":"72f68cc7-037f-409d-9c33-cf56c71d2131","timestamp":"2026-10-18T06:54:27.451Z"}'

// The model server answered every request with HTTP 500.
const ERROR_RUN = [
  '{"type":"model.call_failure","data":{"model":"gpt-4.1","statusCode":500,"retryAttempt":5,"failureKind":"api","isByok":true,"errorMessage":"{\\"message\\":\\"mock upstream exploded\\",\\"type\\":\\"server_error\\"}"},"ephemeral":true,"id":"4419941b-83f6-476c-9c53-ff0eb13c0dc6","timestamp":"2026-10-18T06:55:26.118Z"}',
  '{"type":"session.error","data":{"errorType":"query","message":"Failed to get response from the AI model; retried 5 times (total retry wait time: 14.88 seconds) Last error: 500 mock upstream exploded","statusCode":500},"id":"5c6c90d4-8a68-4771-86df-7aeb638000cc","timestamp":"2026-10-18T06:55:26.123Z"}',
  '{"type":"result","timestamp":"2026-10-18T06:55:26.133Z","sessionId":"4a469827-23fd-4fb4-aa54-63689b368788","exitCode":1,"usage":{"premiumRequests":0,"totalApiDurationMs":0,"sessionDurationMs":15637,"codeChanges":{"linesAdded":0,"linesRemoved":0,"filesModified":[]}}}',
].join('\n')

describe('copilot parse', () => {
  test('json events: last assistant message, result session id, usage from the report file', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    const parsed = adapter.parseResult(planned, raw(PLAIN_RUN, { 'usage.json': USAGE_REPORT }))
    expect(parsed.text).toBe('hello from copilot')
    expect(parsed.sessionId).toBe('3b6f9664-aff5-413c-8c3c-c3510aa21ec0')
    expect(parsed.model).toBe('gpt-4.1')
    expect(parsed.usage).toEqual({
      inputTokens: 11,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    // `cost` and nano-AIU are billing multipliers, not dollars.
    expect(parsed.costUsd).toBeUndefined()
    expect(parsed.isError).toBe(false)
    expect(parsed.events).toHaveLength(6)
  })

  test('usage sums across models and is absent without the report', () => {
    const report = JSON.stringify({
      modelMetrics: {
        a: { usage: { inputTokens: 10, outputTokens: 2 } },
        b: { usage: { inputTokens: 5, outputTokens: 1, cacheReadTokens: 4 } },
      },
    })
    const planned = adapter.plan({ prompt: 'x' })
    expect(adapter.parseResult(planned, raw(PLAIN_RUN, { 'usage.json': report })).usage).toEqual({
      inputTokens: 15,
      outputTokens: 3,
      cacheReadTokens: 4,
    })
    expect(adapter.parseResult(planned, raw(PLAIN_RUN)).usage).toBeUndefined()
  })

  test('text output (captured with -s) is the answer; usage still comes from the file', () => {
    const planned = adapter.plan({ prompt: 'x', output: { format: 'text' } })
    const parsed = adapter.parseResult(
      planned,
      raw('hello from copilot\n\n', { 'usage.json': USAGE_REPORT }),
    )
    expect(parsed.text).toBe('hello from copilot')
    expect(parsed.usage?.inputTokens).toBe(11)
    expect(parsed.model).toBe('gpt-4.1')
  })

  test('schema answers are parsed into structured', () => {
    const planned = adapter.plan({ prompt: 'x', output: { schema: { type: 'object' } } })
    const parsed = adapter.parseResult(
      planned,
      raw(PLAIN_RUN.replaceAll('hello from copilot', '{\\"answer\\":42}')),
    )
    expect(parsed.structured).toEqual({ answer: 42 })
  })

  test('session.error and a nonzero result exitCode are errors', () => {
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'x' }), raw(ERROR_RUN))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toContain('500 mock upstream exploded')
    expect(parsed.text).toBe('')
    expect(parsed.sessionId).toBe('4a469827-23fd-4fb4-aa54-63689b368788')
  })

  test('a blocked outcome is an error (shape from the CLI source)', () => {
    const line = JSON.stringify({
      type: 'result',
      sessionId: 's',
      exitCode: 0,
      outcome: 'blocked',
      blocker: 'session limits reached',
    })
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'x' }), raw(line))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toContain('session limits reached')
  })

  test('a stream without a result event is an error but keeps the text', () => {
    const truncated = PLAIN_RUN.split('\n').slice(0, 4).join('\n')
    const planned = adapter.plan({ prompt: 'x', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(truncated))
    expect(parsed.text).toBe('hello from copilot')
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toContain('no result event')
  })

  test('sub-agent messages do not become the answer', () => {
    const sub = JSON.stringify({
      type: 'assistant.message',
      data: { content: 'sub-agent chatter', parentToolCallId: 'call_9', toolRequests: [] },
    })
    const lines = PLAIN_RUN.split('\n')
    lines.splice(lines.length - 1, 0, sub)
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'x' }), raw(lines.join('\n')))
    expect(parsed.text).toBe('hello from copilot')
  })
})

describe('copilot conversation', () => {
  test('tool calls and results are lifted from the event stream', () => {
    const planned = adapter.plan({ prompt: 'run echo hi', output: { format: 'stream-json' } })
    const conversation = adapter.toConversation?.(
      planned,
      raw(TOOL_RUN, { 'usage.json': USAGE_REPORT }),
    )
    expect(conversation?.agent).toBe('copilot')
    expect(conversation?.sessionId).toBe('0b17fb09-1be2-42fe-8fa2-a3cdcc869404')
    expect(conversation?.model).toBe('gpt-4.1')
    expect(conversation?.usage?.outputTokens).toBe(3)
    expect(conversation?.raw.format).toBe('copilot/jsonl')
    expect(conversation?.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ])
    expect(conversation?.messages[0]?.parts).toEqual([{ type: 'text', text: 'run echo hi' }])
    expect(conversation?.messages[1]?.parts).toEqual([
      {
        type: 'tool-call',
        callId: 'call_1',
        name: 'bash',
        input: { command: 'echo hi', description: 'Print hi' },
      },
    ])
    expect(conversation?.messages[2]?.parts).toEqual([
      {
        type: 'tool-result',
        callId: 'call_1',
        name: 'bash',
        output: 'hi\n<shellId: 0 completed with exit code 0>',
        isError: false,
      },
    ])
    expect(conversation?.messages[3]?.parts).toEqual([{ type: 'text', text: 'done: hi' }])
  })

  test('a denied tool call is an error result', () => {
    const conversation = adapter.toConversation?.(adapter.plan({ prompt: 'x' }), raw(DENIED_TOOL))
    const result = conversation?.messages[1]?.parts[0]
    expect(result).toMatchObject({ type: 'tool-result', callId: 'call_1', isError: true })
    expect(result?.type === 'tool-result' && String(result.output)).toContain('Permission denied')
  })

  test('reasoning events become reasoning parts (shape from the event schema)', () => {
    const lines = [
      JSON.stringify({
        type: 'assistant.reasoning',
        data: { reasoningId: 'r1', content: 'thinking it over' },
      }),
      PLAIN_RUN,
    ].join('\n')
    const conversation = adapter.toConversation?.(adapter.plan({ prompt: 'x' }), raw(lines))
    expect(conversation?.messages[1]?.parts).toEqual([
      { type: 'reasoning', text: 'thinking it over' },
    ])
  })

  test('text format records the prompt and the final answer', () => {
    const planned = adapter.plan({ prompt: 'x', output: { format: 'text' } })
    const conversation = adapter.toConversation?.(planned, raw('hello from copilot\n\n'))
    expect(conversation?.messages).toEqual([
      { role: 'user', parts: [{ type: 'text', text: 'x' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'hello from copilot' }] },
    ])
    expect(conversation?.raw.data).toBe('hello from copilot\n\n')
  })
})
