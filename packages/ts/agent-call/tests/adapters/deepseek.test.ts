import { describe, expect, test } from 'vitest'

import { deepseekAdapter } from '../../src/adapters/deepseek.js'
import type { RawProcessOutput } from '../../src/adapters/types.js'
import { TMP_TOKEN, type PlannedCall } from '../../src/plan.js'

const adapter = deepseekAdapter()

function raw(stdout: string, exitCode = 0, stderr = ''): RawProcessOutput {
  return { stdout, stderr, exitCode, durationMs: 10, timedOut: false }
}

/** The --patch overlay rows the plan writes to its temp file. */
function patchRows(planned: PlannedCall): Array<Record<string, unknown>> {
  const file = planned.tempFiles.find((f) => f.name === 'dsh-patch.yml')
  return file === undefined ? [] : (JSON.parse(file.content) as Array<Record<string, unknown>>)
}

function noteFor(planned: PlannedCall, field: string) {
  return planned.notes.find((n) => n.field === field)
}

describe('deepseek plan', () => {
  test('minimal spec: headless profile, --json events, prompt on stdin via -', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    expect(planned.agent).toBe('deepseek')
    expect(planned.argv).toEqual(['dsh', '--profile', 'headless', '--json', '-'])
    expect(planned.stdin).toBe('say hi')
    expect(planned.tempFiles).toEqual([])
    expect(planned.env).toEqual({})
    expect(noteFor(planned, 'output.format')?.support).toBe('approximated')
  })

  test('output formats: stream-json is --json unnoted, text drops the flag', () => {
    const stream = adapter.plan({ prompt: 'x', output: { format: 'stream-json' } })
    expect(stream.argv).toEqual(['dsh', '--profile', 'headless', '--json', '-'])
    expect(noteFor(stream, 'output.format')).toBeUndefined()

    const text = adapter.plan({ prompt: 'x', output: { format: 'text' } })
    expect(text.argv).toEqual(['dsh', '--profile', 'headless', '-'])
    expect(text.outputFormat).toBe('text')
    expect(noteFor(text, 'output.format')).toBeUndefined()
  })

  test('model rides the agent-default-model row of a --patch overlay, before app flags', () => {
    const planned = adapter.plan({ prompt: 'x', model: 'deepseek-v4-pro' })
    expect(planned.argv).toEqual([
      'dsh',
      '--profile',
      'headless',
      '--patch',
      `${TMP_TOKEN}/dsh-patch.yml`,
      '--json',
      '-',
    ])
    expect(patchRows(planned)).toEqual([
      {
        id: 'agent-default-model',
        config: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
      },
    ])
    expect(noteFor(planned, 'model')?.support).toBe('approximated')
  })

  test('a command prefix comes before the headless profile flags', () => {
    const planned = deepseekAdapter({ command: ['env', 'X=1', 'dsh'] }).plan({ prompt: 'x' })
    expect(planned.argv.slice(0, 6)).toEqual([
      'env',
      'X=1',
      'dsh',
      '--profile',
      'headless',
      '--json',
    ])
  })

  test('effort restates the default model; medium and xhigh clamp to dsh levels', () => {
    const high = adapter.plan({ prompt: 'x', effort: 'high' })
    expect(patchRows(high)).toEqual([
      {
        id: 'agent-default-model',
        config: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' },
      },
    ])
    expect(noteFor(high, 'effort')?.support).toBe('approximated')
    expect(noteFor(high, 'model')).toBeUndefined()

    const cases = [
      ['none', 'off'],
      ['minimal', 'low'],
      ['low', 'low'],
      ['medium', 'high'],
      ['xhigh', 'max'],
      ['max', 'max'],
    ] as const
    for (const [effort, expected] of cases) {
      const planned = adapter.plan({ prompt: 'x', model: 'm', effort })
      expect(get(patchRows(planned)[0], 'config', 'reasoningEffort')).toBe(expected)
      expect(get(patchRows(planned)[0], 'config', 'model')).toBe('m')
    }
    expect(noteFor(adapter.plan({ prompt: 'x', effort: 'xhigh' }), 'effort')?.detail).toContain(
      'reasoningEffort: max',
    )
  })

  test('system prompts ride the system-prompt row, not the prompt', () => {
    const replace = adapter.plan({ prompt: 'q', systemPrompt: 'be terse' })
    expect(patchRows(replace)).toEqual([
      {
        id: 'system-prompt',
        // The headless working-directory suffix is restated: a row's config is replaced whole.
        config: {
          includeHarnessIdentity: false,
          personaPrefix: 'be terse',
          personaSuffix: 'Your working directory is {{cwd}}.',
        },
      },
    ])
    expect(replace.stdin).toBe('q')
    expect(noteFor(replace, 'systemPrompt')?.support).toBe('approximated')

    const append = adapter.plan({ prompt: 'q', appendSystemPrompt: 'cite files' })
    expect(patchRows(append)).toEqual([
      {
        id: 'system-prompt',
        // The headless persona prefix and suffix are restated, and the text appends.
        config: {
          personaPrefix: 'You are a coding agent powered by the {{model}} model.',
          personaSuffix: 'Your working directory is {{cwd}}.\n\ncite files',
        },
      },
    ])
    expect(append.stdin).toBe('q')
    expect(noteFor(append, 'appendSystemPrompt')?.support).toBe('native')
  })

  test('permission modes ride DSH_PERMISSION_MODE', () => {
    const cases = [
      ['read-only', 'read-only', 'native'],
      ['edits', 'workspace-write', 'approximated'],
      ['full-auto', 'workspace-write', 'native'],
      ['bypass', 'danger-full-access', 'native'],
    ] as const
    for (const [mode, env, support] of cases) {
      const planned = adapter.plan({ prompt: 'x', permissions: { mode } })
      expect(planned.env['DSH_PERMISSION_MODE']).toBe(env)
      expect(planned.argv).toEqual(['dsh', '--profile', 'headless', '--json', '-'])
      expect(noteFor(planned, 'permissions.mode')?.support).toBe(support)
    }

    const def = adapter.plan({ prompt: 'x', permissions: { mode: 'default' } })
    expect(def.env).toEqual({})
    expect(noteFor(def, 'permissions.mode')).toBeUndefined()
  })

  test('a resumed session keeps its own permission, so the mode is dropped', () => {
    const planned = adapter.plan({
      prompt: 'x',
      permissions: { mode: 'read-only' },
      session: { resume: 'session-1' },
    })
    expect(planned.env['DSH_PERMISSION_MODE']).toBeUndefined()
    expect(noteFor(planned, 'permissions.mode')?.support).toBe('dropped')
  })

  test('effort alone says it pins the default model', () => {
    const planned = adapter.plan({ prompt: 'x', effort: 'low' })
    expect(noteFor(planned, 'effort')?.detail).toContain('deepseek-official/deepseek-flash')
    const withModel = adapter.plan({ prompt: 'x', effort: 'low', model: 'deepseek-pro' })
    expect(noteFor(withModel, 'effort')?.detail).not.toContain('pins')
  })

  test('tool rules, extra dirs, continueLast, session pinning, persist and budget are dropped', () => {
    const planned = adapter.plan({
      prompt: 'x',
      permissions: { allowTools: ['bash'], denyTools: ['write'] },
      context: { dirs: ['/x'] },
      session: { continueLast: true, id: 'pin', persist: false },
      plugins: { dirs: ['/p'], disable: [] },
      budgetUsd: 1,
    })
    for (const field of [
      'permissions.allowTools',
      'permissions.denyTools',
      'context.dirs',
      'session.continueLast',
      'session.id',
      'session.persist',
      'plugins',
      'budgetUsd',
    ]) {
      expect(noteFor(planned, field)?.support).toBe('dropped')
    }
    expect(planned.argv).toEqual(['dsh', '--profile', 'headless', '--json', '-'])
  })

  test('resume adopts the session with --session-id=', () => {
    const planned = adapter.plan({
      prompt: 'x',
      session: { resume: 'session-1', continueLast: true },
    })
    expect(planned.argv).toContain('--session-id=session-1')
    expect(noteFor(planned, 'session.resume')?.support).toBe('native')
    // resume wins over continueLast, which is then not noted.
    expect(noteFor(planned, 'session.continueLast')).toBeUndefined()
  })

  test('context files and text fold into the prompt; schema is emulated', () => {
    const planned = adapter.plan({
      prompt: 'q',
      context: { files: ['src/a.ts'], text: 'background' },
      output: { schema: { type: 'object' } },
    })
    expect(planned.stdin).toContain('<context>\nbackground\n</context>')
    expect(planned.stdin).toContain('- src/a.ts')
    expect(planned.stdin).toContain('{"type":"object"}')
    expect(noteFor(planned, 'context.files')?.support).toBe('emulated')
    expect(noteFor(planned, 'output.schema')?.support).toBe('emulated')
  })

  test('mcp servers become dsh-mcp-client rows in the patch file, env off argv', () => {
    const planned = adapter.plan({
      prompt: 'x',
      model: 'm',
      mcp: {
        servers: {
          echo: { command: 'node', args: ['echo.mjs'], env: { TOKEN: 'secret' } },
          web: { url: 'http://localhost:3000/mcp', headers: { Authorization: 'Bearer t' } },
          odd: { transport: 'carrier-pigeon' },
        },
        strict: true,
      },
    })
    expect(planned.argv.join(' ')).not.toContain('secret')
    expect(patchRows(planned)).toEqual([
      {
        id: 'agent-default-model',
        config: { provider: 'deepseek-official', model: 'm' },
      },
      {
        insert: [
          {
            id: 'agent-call-mcp-echo',
            name: '@deepseek-ai/dsh-mcp-client',
            config: {
              serverName: 'echo',
              transport: 'stdio',
              command: 'node',
              args: ['echo.mjs'],
              env: { TOKEN: 'secret' },
            },
          },
          {
            id: 'agent-call-mcp-web',
            name: '@deepseek-ai/dsh-mcp-client',
            config: {
              serverName: 'web',
              transport: 'streamable-http',
              url: 'http://localhost:3000/mcp',
              headers: { Authorization: 'Bearer t' },
            },
          },
        ],
      },
    ])
    expect(planned.argv.filter((a) => a === '--patch')).toHaveLength(1)
    expect(noteFor(planned, 'mcp.servers')?.support).toBe('approximated')
    expect(noteFor(planned, 'mcp.servers')?.detail).toContain('skipped (no command or url): odd')
    expect(noteFor(planned, 'mcp.strict')?.support).toBe('dropped')
  })

  test('cwd and env go on the call; extraArgs land before the stdin marker', () => {
    const planned = adapter.plan({
      prompt: 'x',
      cwd: '/repo',
      env: { DEEPSEEK_API_KEY: 'k' },
      extraArgs: ['--foo', 'bar'],
    })
    expect(planned.cwd).toBe('/repo')
    expect(planned.env).toEqual({ DEEPSEEK_API_KEY: 'k' })
    expect(planned.argv.slice(-3)).toEqual(['--foo', 'bar', '-'])
  })

  test('a custom binary is used as argv[0]', () => {
    const custom = deepseekAdapter({ binary: '/opt/dsh' })
    expect(custom.binary).toBe('/opt/dsh')
    expect(custom.plan({ prompt: 'x' }).argv[0]).toBe('/opt/dsh')
  })
})

function get(value: unknown, ...path: string[]): unknown {
  let current = value
  for (const key of path) current = (current as Record<string, unknown> | undefined)?.[key]
  return current
}

// Fixtures captured from dsh 0.2.0-rc.2 (`dsh --profile headless [--json] -`)
// against a mock Anthropic Messages server (DEEPSEEK_BASE_URL); cwd paths trimmed.
const JSON_RUN = [
  '{"type":"session","sessionId":"session-08799e37-384c-484c-a85e-e5af3d3729ff","cwd":"/work"}',
  '{"type":"status","phase":"turn_start","turn":1}',
  '{"type":"status","phase":"step_start","turn":1,"step":1}',
  '{"type":"text","text":"pong"}',
  '{"type":"status","phase":"step_end","turn":1,"step":1,"usage":{"inputTokens":11,"outputTokens":3,"cacheReadTokens":0,"cacheWriteTokens":0,"totalTokens":14}}',
  '{"type":"status","phase":"turn_end","turn":1,"reason":{"kind":"completed"}}',
  '{"type":"final","text":"pong"}',
].join('\n')

// A bash tool call (workspace-write default), then the answer in step 2.
const TOOL_RUN = [
  '{"type":"session","sessionId":"session-04a1d71a-3e57-4d45-856e-b9d04f45c080","cwd":"/work"}',
  '{"type":"status","phase":"turn_start","turn":1}',
  '{"type":"status","phase":"step_start","turn":1,"step":1}',
  '{"type":"tool_call","callId":"toolu_1","tool":"bash","input":{"command":"echo hi > made.txt && echo ok","description":"Write a file"}}',
  '{"type":"tool_result","callId":"toolu_1","status":"completed","result":"ok\\n"}',
  '{"type":"status","phase":"step_end","turn":1,"step":1,"usage":{"inputTokens":11,"outputTokens":3,"cacheReadTokens":0,"cacheWriteTokens":0,"totalTokens":14}}',
  '{"type":"status","phase":"step_start","turn":1,"step":2}',
  '{"type":"text","text":"done"}',
  '{"type":"status","phase":"step_end","turn":1,"step":2,"usage":{"inputTokens":11,"outputTokens":3,"cacheReadTokens":0,"cacheWriteTokens":0,"totalTokens":14}}',
  '{"type":"status","phase":"turn_end","turn":1,"reason":{"kind":"completed"}}',
  '{"type":"final","text":"done"}',
].join('\n')

// DSH_PERMISSION_MODE=read-only and the model asks to escalate: headless has no
// approval channel, so the call is denied at once and the run completes.
const DENIED_RUN = [
  '{"type":"session","sessionId":"session-d9844e10-f3f0-43aa-9d99-9e28c7cf626d","cwd":"/work"}',
  '{"type":"status","phase":"turn_start","turn":1}',
  '{"type":"status","phase":"step_start","turn":1,"step":1}',
  '{"type":"tool_call","callId":"toolu_1","tool":"bash","input":{"command":"echo hi > made.txt && echo ok","description":"Write a file","sandbox_permissions":"workspace-write","justification":"need to write"}}',
  '{"type":"tool_result","callId":"toolu_1","status":"error","result":"Error: sandbox escalation to \\"workspace-write\\" requires approval, but no approval channel is available"}',
  '{"type":"status","phase":"step_end","turn":1,"step":1,"usage":{"inputTokens":11,"outputTokens":3,"cacheReadTokens":0,"cacheWriteTokens":0,"totalTokens":14}}',
  '{"type":"status","phase":"step_start","turn":1,"step":2}',
  '{"type":"text","text":"done"}',
  '{"type":"status","phase":"step_end","turn":1,"step":2,"usage":{"inputTokens":11,"outputTokens":3,"cacheReadTokens":0,"cacheWriteTokens":0,"totalTokens":14}}',
  '{"type":"status","phase":"turn_end","turn":1,"reason":{"kind":"completed"}}',
  '{"type":"final","text":"done"}',
].join('\n')

// The model streamed a thinking block before its answer.
const THINKING_RUN = [
  '{"type":"session","sessionId":"session-19c75d2b-0e70-4bd4-ae66-e503ee9481e1","cwd":"/work"}',
  '{"type":"status","phase":"turn_start","turn":1}',
  '{"type":"status","phase":"step_start","turn":1,"step":1}',
  '{"type":"thinking","text":"The user wants a greeting."}',
  '{"type":"text","text":"hello there"}',
  '{"type":"status","phase":"step_end","turn":1,"step":1,"usage":{"inputTokens":20,"outputTokens":9,"cacheReadTokens":5,"totalTokens":34}}',
  '{"type":"status","phase":"turn_end","turn":1,"reason":{"kind":"completed"}}',
  '{"type":"final","text":"hello there"}',
].join('\n')

// The provider answered HTTP 400: an in-turn failure ends with an empty
// `final` and no `error` event; dsh exits 1.
const PROVIDER_ERROR_RUN = [
  '{"type":"session","sessionId":"session-bb8e1bb5-65d9-4718-8252-e495d2dbfd5a","cwd":"/work"}',
  '{"type":"status","phase":"turn_start","turn":1}',
  '{"type":"status","phase":"step_start","turn":1,"step":1}',
  '{"type":"status","phase":"step_end","turn":1,"step":1}',
  '{"type":"status","phase":"turn_end","turn":1,"reason":{"kind":"error","error":{"message":"mock: model not found","code":"INVALID_REQUEST","status":400}}}',
  '{"type":"final","text":""}',
].join('\n')

// An unknown --session-id fails outside a turn: one `error` event, no `final`.
const BAD_SESSION_RUN =
  '{"type":"error","message":"session \\"session-nope\\" does not exist; omit --session-id to start a new Session"}\n'

describe('deepseek parse', () => {
  test('json events: final text, session id, summed usage, stop reason', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    const parsed = adapter.parseResult(planned, raw(JSON_RUN))
    expect(parsed.text).toBe('pong')
    expect(parsed.sessionId).toBe('session-08799e37-384c-484c-a85e-e5af3d3729ff')
    expect(parsed.usage).toEqual({
      inputTokens: 11,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 14,
    })
    expect(parsed.stopReason).toBe('completed')
    expect(parsed.isError).toBe(false)
    expect(parsed.events).toHaveLength(7)
    expect(parsed.costUsd).toBeUndefined()
  })

  test('usage sums over steps', () => {
    const planned = adapter.plan({ prompt: 'make a file' })
    const parsed = adapter.parseResult(planned, raw(TOOL_RUN))
    expect(parsed.text).toBe('done')
    expect(parsed.usage?.inputTokens).toBe(22)
    expect(parsed.usage?.outputTokens).toBe(6)
    expect(parsed.usage?.totalTokens).toBe(28)
  })

  test('a step without a cache-write count leaves it undefined', () => {
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'hi' }), raw(THINKING_RUN))
    expect(parsed.usage).toEqual({
      inputTokens: 20,
      outputTokens: 9,
      cacheReadTokens: 5,
      cacheWriteTokens: undefined,
      totalTokens: 34,
    })
  })

  test('an in-turn failure is an error from the turn_end reason', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    const parsed = adapter.parseResult(planned, raw(PROVIDER_ERROR_RUN, 1))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toBe('INVALID_REQUEST: mock: model not found')
    expect(parsed.stopReason).toBe('error')
    expect(parsed.text).toBe('')
  })

  test('an unsupported effort fails in-turn too', () => {
    // Captured with reasoningEffort "medium" patched in directly (the adapter clamps it).
    const stdout = [
      '{"type":"session","sessionId":"session-59f598b8-ccbc-4286-848f-57ea2f57835e","cwd":"/work"}',
      '{"type":"status","phase":"turn_start","turn":1}',
      '{"type":"status","phase":"step_start","turn":1,"step":1}',
      '{"type":"status","phase":"step_end","turn":1,"step":1}',
      '{"type":"status","phase":"turn_end","turn":1,"reason":{"kind":"error","error":{"message":"provider \\"deepseek-official\\" model \\"deepseek-flash\\" does not support reasoning effort \\"medium\\"","code":"UNSUPPORTED_REASONING_EFFORT"}}}',
      '{"type":"final","text":""}',
    ].join('\n')
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'x' }), raw(stdout, 1))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toMatch(/^UNSUPPORTED_REASONING_EFFORT: /)
    expect(parsed.usage).toBeUndefined()
  })

  test('an out-of-turn error event is an error', () => {
    const planned = adapter.plan({ prompt: 'x', session: { resume: 'session-nope' } })
    const parsed = adapter.parseResult(planned, raw(BAD_SESSION_RUN, 1))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toBe(
      'session "session-nope" does not exist; omit --session-id to start a new Session',
    )
    expect(parsed.sessionId).toBeUndefined()
  })

  test('a stream without turn_end is an error', () => {
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'x' }), raw(JSON_RUN.split('\n')[0]!))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toContain('turn_end')
  })

  test('the last text event stands in when final is missing', () => {
    const truncated = JSON_RUN.split('\n').slice(0, 6).join('\n')
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'x' }), raw(truncated))
    expect(parsed.text).toBe('pong')
    expect(parsed.isError).toBe(false)
  })

  test('schema answers are parsed into structured', () => {
    const stdout = JSON_RUN.replace(/"pong"/g, '"{\\"a\\":1}"')
    const planned = adapter.plan({ prompt: 'x', output: { schema: { type: 'object' } } })
    expect(adapter.parseResult(planned, raw(stdout)).structured).toEqual({ a: 1 })
  })

  test('text: stdout is the answer; reasoning on stderr is not', () => {
    const planned = adapter.plan({ prompt: 'say hi', output: { format: 'text' } })
    const parsed = adapter.parseResult(
      planned,
      raw('hello there\n', 0, 'dsh: reasoning:\nThe user wants a greeting.\n'),
    )
    expect(parsed.text).toBe('hello there')
    expect(parsed.isError).toBeUndefined()
  })

  test('text: exit 1 takes the dsh: diagnostic from stderr', () => {
    const planned = adapter.plan({ prompt: 'x', output: { format: 'text' } })
    const parsed = adapter.parseResult(
      planned,
      raw(
        '',
        1,
        'dsh: session "session-nope" does not exist; omit --session-id to start a new Session\n',
      ),
    )
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toBe(
      'session "session-nope" does not exist; omit --session-id to start a new Session',
    )
  })
})

describe('deepseek conversation', () => {
  test('steps become assistant messages with tool results under tool', () => {
    const planned = adapter.plan({ prompt: 'make a file' })
    const conversation = adapter.toConversation?.(planned, raw(TOOL_RUN))
    expect(conversation?.agent).toBe('deepseek')
    expect(conversation?.sessionId).toBe('session-04a1d71a-3e57-4d45-856e-b9d04f45c080')
    expect(conversation?.stopReason).toBe('completed')
    expect(conversation?.raw.format).toBe('deepseek/json-events')
    expect(conversation?.messages).toEqual([
      { role: 'user', parts: [{ type: 'text', text: 'make a file' }] },
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            callId: 'toolu_1',
            name: 'bash',
            input: { command: 'echo hi > made.txt && echo ok', description: 'Write a file' },
          },
        ],
      },
      {
        role: 'tool',
        parts: [{ type: 'tool-result', callId: 'toolu_1', output: 'ok\n', isError: false }],
      },
      { role: 'assistant', parts: [{ type: 'text', text: 'done' }] },
    ])
  })

  test('a denied tool call is an errored tool result', () => {
    const planned = adapter.plan({ prompt: 'x', permissions: { mode: 'read-only' } })
    const conversation = adapter.toConversation?.(planned, raw(DENIED_RUN))
    const result = conversation?.messages.find((m) => m.role === 'tool')?.parts[0]
    expect(result).toMatchObject({ type: 'tool-result', isError: true })
  })

  test('thinking becomes a reasoning part', () => {
    const conversation = adapter.toConversation?.(adapter.plan({ prompt: 'hi' }), raw(THINKING_RUN))
    expect(conversation?.messages[1]).toEqual({
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'The user wants a greeting.' },
        { type: 'text', text: 'hello there' },
      ],
    })
  })

  test('a failed run reports stopReason error', () => {
    const conversation = adapter.toConversation?.(
      adapter.plan({ prompt: 'x' }),
      raw(PROVIDER_ERROR_RUN, 1),
    )
    expect(conversation?.stopReason).toBe('error')
    expect(conversation?.messages).toHaveLength(1)
  })

  test('text format reads reasoning sections off stderr', () => {
    const planned = adapter.plan({ prompt: 'hi', output: { format: 'text' } })
    const conversation = adapter.toConversation?.(
      planned,
      raw('hello there\n', 0, 'dsh: reasoning:\nThe user wants a greeting.\n'),
    )
    expect(conversation?.raw.format).toBe('deepseek/text')
    expect(conversation?.messages[1]).toEqual({
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'The user wants a greeting.' },
        { type: 'text', text: 'hello there' },
      ],
    })
  })
})
