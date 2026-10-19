import { describe, expect, test } from 'vitest'

import { cursorAdapter } from '../../src/adapters/cursor.js'
import type { RawProcessOutput } from '../../src/adapters/types.js'
import { TMP_TOKEN } from '../../src/plan.js'

const adapter = cursorAdapter()

function raw(stdout: string, stderr = '', exitCode = 0): RawProcessOutput {
  return { stdout, stderr, exitCode, durationMs: 10, timedOut: false }
}

function noteFor(planned: ReturnType<typeof adapter.plan>, field: string) {
  return planned.notes.find((n) => n.field === field)
}

describe('cursor plan', () => {
  test('minimal spec: json envelope, prompt on stdin', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    expect(planned.argv).toEqual(['agent', '-p', '--output-format', 'json'])
    expect(planned.stdin).toBe('say hi')
    expect(planned.agent).toBe('cursor')
    expect(planned.notes).toEqual([])
  })

  test('binary option', () => {
    expect(cursorAdapter({ binary: 'cursor-agent' }).plan({ prompt: 'x' }).argv[0]).toBe(
      'cursor-agent',
    )
  })

  test('output formats are passed explicitly, text included', () => {
    for (const format of ['text', 'json', 'stream-json'] as const) {
      const planned = adapter.plan({ prompt: 'x', output: { format } })
      expect(planned.argv.join(' ')).toContain(`--output-format ${format}`)
      expect(planned.outputFormat).toBe(format)
      expect(noteFor(planned, 'output.format')).toBeUndefined()
    }
    expect(adapter.plan({ prompt: 'x', output: { format: 'stream-json' } }).argv).not.toContain(
      '--stream-partial-output',
    )
  })

  test('model passes through; effort is dropped', () => {
    expect(adapter.plan({ prompt: 'x', model: 'gpt-5' }).argv.join(' ')).toContain('--model gpt-5')
    const effort = adapter.plan({ prompt: 'x', effort: 'high' })
    expect(effort.argv.join(' ')).not.toContain('high')
    expect(noteFor(effort, 'effort')?.support).toBe('dropped')
  })

  test('system prompts and the schema are folded into the prompt', () => {
    const planned = adapter.plan({
      prompt: 'q',
      systemPrompt: 'be terse',
      appendSystemPrompt: 'cite files',
      output: { schema: { type: 'object' } },
    })
    expect(planned.stdin).toContain('<system>\nbe terse\n</system>')
    expect(planned.stdin).toContain('<instructions>\ncite files\n</instructions>')
    expect(planned.stdin).toContain('validates against this JSON Schema')
    expect(planned.argv).not.toContain('--system-prompt')
    expect(noteFor(planned, 'systemPrompt')?.support).toBe('emulated')
    expect(noteFor(planned, 'appendSystemPrompt')?.support).toBe('emulated')
    expect(noteFor(planned, 'output.schema')?.support).toBe('emulated')
  })

  test('permission modes', () => {
    const readOnly = adapter.plan({ prompt: 'x', permissions: { mode: 'read-only' } })
    expect(readOnly.argv.join(' ')).toContain('--mode ask')
    expect(noteFor(readOnly, 'permissions.mode')?.support).toBe('approximated')

    // No flag: observed headless, print mode applies writes and rejects shell commands.
    const edits = adapter.plan({ prompt: 'x', permissions: { mode: 'edits' } })
    expect(edits.argv).toEqual(['agent', '-p', '--output-format', 'json'])
    expect(noteFor(edits, 'permissions.mode')?.support).toBe('native')

    const fullAuto = adapter.plan({ prompt: 'x', permissions: { mode: 'full-auto' } })
    expect(fullAuto.argv.join(' ')).toContain('--sandbox enabled')
    expect(fullAuto.argv).not.toContain('--force')

    const bypass = adapter.plan({ prompt: 'x', permissions: { mode: 'bypass' } })
    expect(bypass.argv.join(' ')).toContain('--force --sandbox disabled')
    expect(noteFor(bypass, 'permissions.mode')?.support).toBe('native')

    const def = adapter.plan({ prompt: 'x', permissions: { mode: 'default' } })
    expect(noteFor(def, 'permissions.mode')).toBeUndefined()
    // --trust leaves a lasting trust marker, so no mode passes it on its own.
    for (const planned of [readOnly, edits, fullAuto, bypass, def]) {
      expect(planned.argv).not.toContain('--trust')
    }
  })

  test('trustWorkspace opts in to --trust', () => {
    const trusting = cursorAdapter({ trustWorkspace: true })
    expect(trusting.plan({ prompt: 'x' }).argv).toEqual([
      'agent',
      '-p',
      '--trust',
      '--output-format',
      'json',
    ])
  })

  test('tool rules are dropped', () => {
    const planned = adapter.plan({
      prompt: 'x',
      permissions: { allowTools: ['Shell(git)'], denyTools: ['Shell(rm)'] },
    })
    expect(noteFor(planned, 'permissions.allowTools')?.support).toBe('dropped')
    expect(noteFor(planned, 'permissions.denyTools')?.support).toBe('dropped')
  })

  test('context: files and text in the prompt, dirs via --add-dir', () => {
    const planned = adapter.plan({
      prompt: 'x',
      context: { files: ['src/a.ts'], dirs: ['/x', '/y'], text: 'ctx' },
    })
    expect(planned.stdin).toContain('- src/a.ts')
    expect(planned.stdin).toContain('<context>\nctx\n</context>')
    expect(planned.argv.join(' ')).toContain('--add-dir /x --add-dir /y')
    expect(noteFor(planned, 'context.files')?.support).toBe('emulated')
    expect(noteFor(planned, 'context.dirs')?.support).toBe('native')
  })

  test('sessions', () => {
    const resume = adapter.plan({ prompt: 'x', session: { resume: '-abc' } })
    expect(resume.argv).toContain('--resume=-abc')

    const last = adapter.plan({ prompt: 'x', session: { continueLast: true } })
    expect(last.argv).toContain('--continue')

    const id = '0c9a065a-e2c4-494e-9199-aa208d5d7c7f'
    const pinned = adapter.plan({ prompt: 'x', session: { id } })
    expect(pinned.argv.join(' ')).toContain(`--new-session-id ${id}`)
    expect(noteFor(pinned, 'session.id')?.support).toBe('approximated')

    const ephemeral = adapter.plan({ prompt: 'x', session: { persist: false } })
    expect(noteFor(ephemeral, 'session.persist')?.support).toBe('dropped')
  })

  test('MCP servers go in a temp plugin dir, env off argv', () => {
    const planned = adapter.plan({
      prompt: 'x',
      mcp: { servers: { gh: { command: 'gh-mcp', env: { TOKEN: 'secret' } } } },
    })
    expect(planned.argv.join(' ')).toContain(`--plugin-dir ${TMP_TOKEN}`)
    expect(planned.argv.join(' ')).not.toContain('secret')
    expect(planned.tempFiles.map((f) => f.name)).toEqual(['plugin.json', 'mcp.json'])
    expect(JSON.parse(planned.tempFiles[1]?.content ?? '')).toEqual({
      mcpServers: { gh: { command: 'gh-mcp', env: { TOKEN: 'secret' } } },
    })
    expect(planned.argv).not.toContain('--approve-mcps')
    expect(noteFor(planned, 'mcp.servers')?.support).toBe('approximated')
  })

  test('plugin dirs load natively; disabling is approximated', () => {
    const native = adapter.plan({ prompt: 'x', plugins: { dirs: ['/p'], disable: [] } })
    expect(native.argv.join(' ')).toContain('--plugin-dir /p')
    expect(noteFor(native, 'plugins')?.support).toBe('native')
    const partial = adapter.plan({ prompt: 'x', plugins: { dirs: [], disable: ['a@b'] } })
    expect(noteFor(partial, 'plugins')?.support).toBe('approximated')
  })

  test('budget dropped; extraArgs last; cwd and env on the call', () => {
    const planned = adapter.plan({
      prompt: 'x',
      budgetUsd: 1,
      cwd: '/repo',
      env: { CURSOR_API_KEY: 'k' },
      extraArgs: ['--approve-mcps'],
    })
    expect(noteFor(planned, 'budgetUsd')?.support).toBe('dropped')
    expect(planned.argv[planned.argv.length - 1]).toBe('--approve-mcps')
    expect(planned.cwd).toBe('/repo')
    expect(planned.env).toEqual({ CURSOR_API_KEY: 'k' })
    expect(planned.argv.join(' ')).not.toContain('CURSOR_API_KEY')
  })
})

// Fixtures below are trimmed from real runs of agent 2026.08.11-e8db854 with
// `--endpoint` pointed at a fake Cursor backend (Connect/protobuf) that
// scripted the model side; the CLI itself produced every line, ran the tool
// and wrote the envelope. Long `args` objects are trimmed.
describe('cursor parse', () => {
  const session = 'a92469e7-e533-4af3-8cc5-c6ca2c87a0ea'
  const envelope = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 89,
    duration_api_ms: 89,
    result: 'hello from cursor',
    session_id: session,
    request_id: '12e23c54-e856-4242-b01d-d166f1a09a43',
    usage: { inputTokens: 15, outputTokens: 7, cacheReadTokens: 100, cacheWriteTokens: 5 },
  })

  test('json envelope with camelCase usage', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    const parsed = adapter.parseResult(planned, raw(`${envelope}\n`))
    expect(parsed.text).toBe('hello from cursor')
    expect(parsed.sessionId).toBe(session)
    expect(parsed.isError).toBe(false)
    expect(parsed.stopReason).toBe('success')
    // The CLI already subtracts cache reads and writes from inputTokens.
    expect(parsed.usage).toEqual({
      inputTokens: 15,
      outputTokens: 7,
      cacheReadTokens: 100,
      cacheWriteTokens: 5,
    })
    const conversation = adapter.toConversation?.(planned, raw(envelope))
    expect(conversation?.agent).toBe('cursor')
    expect(conversation?.messages).toEqual([
      { role: 'user', parts: [{ type: 'text', text: 'say hi' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'hello from cursor' }] },
    ])
  })

  test('schema answer is parsed from the result text', () => {
    const planned = adapter.plan({ prompt: 'x', output: { schema: { type: 'object' } } })
    const parsed = adapter.parseResult(
      planned,
      raw(JSON.stringify({ type: 'result', subtype: 'success', result: '{"a":1}' })),
    )
    expect(parsed.structured).toEqual({ a: 1 })
  })

  test('text output is the final message after the last tool call', () => {
    // Same run as the tool stream below: json's `result` joins every text
    // segment ("Running it.It printed hi."), text prints only the last one.
    const planned = adapter.plan({ prompt: 'run echo hi', output: { format: 'text' } })
    expect(adapter.parseResult(planned, raw('It printed hi.\n')).text).toBe('It printed hi.')
  })

  const toolStream = [
    {
      type: 'system',
      subtype: 'init',
      apiKeySource: 'env',
      cwd: '/tmp/ws',
      session_id: '44d49da4-4b70-497c-8159-9c23e68f5d9c',
      model: 'Mock Model',
      permissionMode: 'default',
    },
    {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'run echo hi' }] },
      session_id: '44d49da4-4b70-497c-8159-9c23e68f5d9c',
    },
    {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Running it.' }] },
      session_id: '44d49da4-4b70-497c-8159-9c23e68f5d9c',
      model_call_id: 'mc_1',
      timestamp_ms: 1792307171653,
    },
    {
      type: 'tool_call',
      subtype: 'started',
      call_id: 'tool_1',
      tool_call: {
        shellToolCall: { args: { command: 'echo hi', workingDirectory: '/tmp', timeout: 30000 } },
        hookAdditionalContexts: [],
      },
      model_call_id: 'mc_1',
      session_id: '44d49da4-4b70-497c-8159-9c23e68f5d9c',
      timestamp_ms: 1792307171654,
    },
    {
      type: 'tool_call',
      subtype: 'completed',
      call_id: 'tool_1',
      tool_call: {
        shellToolCall: {
          args: { command: 'echo hi', workingDirectory: '/tmp', timeout: 30000 },
          result: {
            success: {
              command: 'echo hi',
              workingDirectory: '/tmp',
              exitCode: 0,
              signal: '',
              stdout: 'hi\n',
              stderr: '',
              executionTime: 81,
            },
            sandboxPolicy: { type: 'TYPE_INSECURE_NONE' },
          },
        },
        hookAdditionalContexts: [],
      },
      model_call_id: 'mc_1',
      session_id: '44d49da4-4b70-497c-8159-9c23e68f5d9c',
      timestamp_ms: 1792307171722,
    },
    {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'It printed hi.' }] },
      session_id: '44d49da4-4b70-497c-8159-9c23e68f5d9c',
    },
    {
      type: 'result',
      subtype: 'success',
      duration_ms: 123,
      duration_api_ms: 123,
      is_error: false,
      result: 'Running it.It printed hi.',
      session_id: '44d49da4-4b70-497c-8159-9c23e68f5d9c',
      request_id: '2c07b9be-a26f-461d-8610-1fab766e5870',
      usage: { inputTokens: 15, outputTokens: 7, cacheReadTokens: 100, cacheWriteTokens: 5 },
    },
  ]
    .map((e) => JSON.stringify(e))
    .join('\n')

  test('stream-json with a tool call', () => {
    const planned = adapter.plan({ prompt: 'run echo hi', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(toolStream))
    expect(parsed.text).toBe('Running it.It printed hi.')
    expect(parsed.sessionId).toBe('44d49da4-4b70-497c-8159-9c23e68f5d9c')
    expect(parsed.model).toBe('Mock Model')
    expect(parsed.usage?.cacheReadTokens).toBe(100)
    expect(parsed.events).toHaveLength(7)
    expect(parsed.isError).toBe(false)

    const conversation = adapter.toConversation?.(planned, raw(toolStream))
    expect(conversation?.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'assistant',
      'tool',
      'assistant',
    ])
    expect(conversation?.messages[2]?.parts[0]).toEqual({
      type: 'tool-call',
      callId: 'tool_1',
      name: 'shell',
      input: { command: 'echo hi', workingDirectory: '/tmp', timeout: 30000 },
    })
    const result = conversation?.messages[3]?.parts[0]
    expect(result).toMatchObject({ type: 'tool-result', callId: 'tool_1', name: 'shell' })
    expect(result?.type === 'tool-result' && result.isError).toBe(false)
    expect(conversation?.usage?.inputTokens).toBe(15)
    expect(conversation?.raw.format).toBe('cursor/stream-json')
  })

  test('a rejected or failed tool is an error result', () => {
    // Real results: without --force a shell command comes back `rejected`;
    // with a missing working directory, `spawnError`.
    const lines = [
      {
        type: 'tool_call',
        subtype: 'completed',
        call_id: 'tool_1',
        tool_call: {
          shellToolCall: {
            args: { command: 'echo hi' },
            result: {
              rejected: {
                command: 'echo hi',
                workingDirectory: '/w',
                reason: '',
                isReadonly: false,
              },
            },
          },
        },
      },
      {
        type: 'tool_call',
        subtype: 'completed',
        call_id: 'tool_2',
        tool_call: {
          shellToolCall: {
            args: { command: 'echo hi' },
            result: {
              spawnError: {
                command: 'echo hi',
                workingDirectory: '/w',
                error: 'spawn /bin/bash ENOENT',
              },
            },
          },
        },
      },
      { type: 'result', subtype: 'success', is_error: false, result: 'done' },
    ]
      .map((e) => JSON.stringify(e))
      .join('\n')
    const planned = adapter.plan({ prompt: 'x', output: { format: 'stream-json' } })
    const conversation = adapter.toConversation?.(planned, raw(lines))
    const results = conversation?.messages.flatMap((m) => m.parts)
    expect(results?.filter((p) => p.type === 'tool-result' && p.isError === true)).toHaveLength(2)
  })

  test('thinking deltas become one reasoning part', () => {
    // Built from the CLI source (headless.ts): the fake backend sent no thinking.
    const lines = [
      { type: 'thinking', subtype: 'delta', text: 'let me ' },
      { type: 'thinking', subtype: 'delta', text: 'think' },
      { type: 'thinking', subtype: 'completed' },
      { type: 'result', subtype: 'success', is_error: false, result: 'ok' },
    ]
      .map((e) => JSON.stringify(e))
      .join('\n')
    const planned = adapter.plan({ prompt: 'x', output: { format: 'stream-json' } })
    const conversation = adapter.toConversation?.(planned, raw(lines))
    expect(conversation?.messages[1]).toEqual({
      role: 'assistant',
      parts: [{ type: 'reasoning', text: 'let me think' }],
    })
  })

  test('a failed json run prints nothing; the reason comes from stderr', () => {
    const stderr = [
      'Connection lost, reconnecting to http://127.0.0.1:8805 (attempt 1)...',
      'Retry attempt 1...',
      'RetriableError: [resource_exhausted] mock: usage limit reached',
    ].join('\n')
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'hi' }), raw('', `${stderr}\n`, 1))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toBe(
      'RetriableError: [resource_exhausted] mock: usage limit reached',
    )

    const badModel = adapter.parseResult(
      adapter.plan({ prompt: 'hi', model: 'nope-model' }),
      raw('', 'Cannot use this model: nope-model. Available models: mock-model\n', 1),
    )
    expect(badModel.errorDetail).toBe(
      'Cannot use this model: nope-model. Available models: mock-model',
    )
  })

  test('a failed stream has events but no result', () => {
    const lines = [
      {
        type: 'system',
        subtype: 'init',
        apiKeySource: 'env',
        cwd: '/tmp/ws',
        session_id: 'eb6e80e0-c391-45f8-9fe1-c280c84c7e11',
        model: 'Mock Model',
        permissionMode: 'default',
      },
      {
        type: 'connection',
        subtype: 'reconnecting',
        session_id: 'eb6e80e0-c391-45f8-9fe1-c280c84c7e11',
        timestamp_ms: 1792306967837,
        attempt: 1,
        endpoint_url: 'http://127.0.0.1:8805',
      },
      {
        type: 'retry',
        subtype: 'starting',
        session_id: 'eb6e80e0-c391-45f8-9fe1-c280c84c7e11',
        timestamp_ms: 1792306969967,
        attempt: 1,
        is_resume: false,
      },
    ]
      .map((e) => JSON.stringify(e))
      .join('\n')
    const planned = adapter.plan({ prompt: 'hi', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(
      planned,
      raw(lines, 'RetriableError: [resource_exhausted] mock: usage limit reached\n', 1),
    )
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toContain('resource_exhausted')
    expect(parsed.events).toHaveLength(3)
    expect(adapter.toConversation?.(planned, raw(lines))?.stopReason).toBe('error')
  })

  test('the workspace-trust refusal is reported from stderr', () => {
    // Real stderr of a run in an untrusted workspace without trustWorkspace.
    const stderr =
      '\n⚠ Workspace Trust Required\n\n  Do you trust the contents of this directory?\n\n' +
      '  To proceed, you can either:\n    • Pass --trust, --yolo, or -f if you trust this directory\n'
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'hi' }), raw('', stderr, 1))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toContain('--trust')
  })
})

describe('cursor output that is not an envelope', () => {
  test('json that is not an object is an error result, not an empty answer', () => {
    const planned = adapter.plan({ prompt: 'hi' })
    for (const stdout of ['42', 'null', '"text"', 'true', 'not json', '']) {
      const parsed = adapter.parseResult(planned, raw(stdout))
      expect(parsed.isError).toBe(true)
      expect(parsed.errorDetail).toContain('no parseable envelope')
    }
  })
})
