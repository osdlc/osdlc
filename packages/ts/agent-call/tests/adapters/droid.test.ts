import { describe, expect, test } from 'vitest'

import { droidAdapter } from '../../src/adapters/droid.js'
import type { RawProcessOutput } from '../../src/adapters/types.js'

const adapter = droidAdapter()

function raw(stdout: string, exitCode: number | null = 0, stderr = ''): RawProcessOutput {
  return { stdout, stderr, exitCode, durationMs: 10, timedOut: false }
}

function noteFor(planned: { notes: { field: string; support: string }[] }, field: string) {
  return planned.notes.find((n) => n.field === field)
}

describe('droid plan', () => {
  test('minimal spec: exec with the json envelope, prompt on stdin', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    expect(planned.argv).toEqual(['droid', 'exec', '--output-format', 'json'])
    expect(planned.stdin).toBe('say hi')
    expect(planned.prompt).toBeUndefined()
    expect(planned.agent).toBe('droid')
    expect(planned.outputFormat).toBe('json')
    expect(planned.notes).toEqual([])
  })

  test('each output format is passed explicitly, with no notes', () => {
    for (const format of ['text', 'json', 'stream-json'] as const) {
      const planned = adapter.plan({ prompt: 'x', output: { format } })
      expect(planned.argv.join(' ')).toContain(`--output-format ${format}`)
      expect(planned.outputFormat).toBe(format)
      expect(noteFor(planned, 'output.format')).toBeUndefined()
    }
  })

  test('binary override', () => {
    expect(droidAdapter({ binary: '/opt/droid' }).plan({ prompt: 'x' }).argv[0]).toBe('/opt/droid')
  })

  test('model passes through as --model, custom: BYOK ids included', () => {
    const planned = adapter.plan({ prompt: 'x', model: 'custom:my-model' })
    expect(planned.argv.join(' ')).toContain('--model custom:my-model')
  })

  test('effort passes through natively, xhigh and max included', () => {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max'] as const) {
      const planned = adapter.plan({ prompt: 'x', effort })
      expect(planned.argv.join(' ')).toContain(`--reasoning-effort ${effort}`)
      expect(noteFor(planned, 'effort')?.support).toBe('native')
    }
  })

  test('permission modes map to the autonomy levels', () => {
    const def = adapter.plan({ prompt: 'x', permissions: { mode: 'default' } })
    expect(def.argv).toEqual(['droid', 'exec', '--output-format', 'json'])
    expect(noteFor(def, 'permissions.mode')).toBeUndefined()

    // No flag at all: droid exec is read-only by default.
    const readOnly = adapter.plan({ prompt: 'x', permissions: { mode: 'read-only' } })
    expect(readOnly.argv).toEqual(['droid', 'exec', '--output-format', 'json'])
    expect(noteFor(readOnly, 'permissions.mode')?.support).toBe('native')

    const edits = adapter.plan({ prompt: 'x', permissions: { mode: 'edits' } })
    expect(edits.argv.join(' ')).toContain('--auto low')
    expect(noteFor(edits, 'permissions.mode')?.support).toBe('approximated')

    const fullAuto = adapter.plan({ prompt: 'x', permissions: { mode: 'full-auto' } })
    expect(fullAuto.argv.join(' ')).toContain('--auto medium')
    expect(noteFor(fullAuto, 'permissions.mode')?.support).toBe('approximated')

    const bypass = adapter.plan({ prompt: 'x', permissions: { mode: 'bypass' } })
    expect(bypass.argv).toContain('--skip-permissions-unsafe')
    // droid refuses --auto together with --skip-permissions-unsafe.
    expect(bypass.argv).not.toContain('--auto')
    expect(noteFor(bypass, 'permissions.mode')?.support).toBe('native')
  })

  test('tool rules map to --add-tools / --remove-tools', () => {
    const planned = adapter.plan({
      prompt: 'x',
      permissions: { allowTools: ['Create', 'Edit'], denyTools: ['Execute'] },
    })
    const joined = planned.argv.join(' ')
    expect(joined).toContain('--add-tools Create,Edit')
    expect(joined).toContain('--remove-tools Execute')
    expect(noteFor(planned, 'permissions.allowTools')?.support).toBe('approximated')
    expect(noteFor(planned, 'permissions.denyTools')?.support).toBe('approximated')
  })

  test('appendSystemPrompt is native; systemPrompt is folded into the prompt', () => {
    const planned = adapter.plan({
      prompt: 'q',
      systemPrompt: 'be terse',
      appendSystemPrompt: 'cite files',
    })
    expect(planned.argv.join(' ')).toContain('--append-system-prompt-file __AGENT_CALL_TMP__/')
    // The text rides a temp file, not argv.
    expect(planned.argv.join(' ')).not.toContain('cite files')
    expect(planned.tempFiles.map((f) => f.content)).toContain('cite files')
    expect(planned.stdin).toContain('<system>\nbe terse\n</system>')
    expect(planned.stdin).not.toContain('cite files')
    expect(noteFor(planned, 'systemPrompt')?.support).toBe('emulated')
    expect(noteFor(planned, 'appendSystemPrompt')?.support).toBe('native')
  })

  test('context: files and text become a preamble; dirs are dropped', () => {
    const planned = adapter.plan({
      prompt: 'x',
      context: { files: ['src/a.ts'], dirs: ['/x'], text: 'background' },
    })
    expect(planned.stdin).toContain('<context>\nbackground\n</context>')
    expect(planned.stdin).toContain('- src/a.ts')
    // -f/--file reads the prompt itself, so it is never used for context files.
    expect(planned.argv).not.toContain('--file')
    expect(noteFor(planned, 'context.files')?.support).toBe('emulated')
    expect(noteFor(planned, 'context.dirs')?.support).toBe('dropped')
  })

  test('schema is emulated in the prompt', () => {
    const planned = adapter.plan({ prompt: 'x', output: { schema: { type: 'object' } } })
    expect(planned.stdin).toContain('{"type":"object"}')
    expect(noteFor(planned, 'output.schema')?.support).toBe('emulated')
  })

  test('sessions: resume and id ride --session-id; continueLast and persist are dropped', () => {
    const resume = adapter.plan({ prompt: 'x', session: { resume: 'abc' } })
    expect(resume.argv.join(' ')).toContain('--session-id abc')
    expect(noteFor(resume, 'session.resume')?.support).toBe('native')

    const pinned = adapter.plan({ prompt: 'x', session: { id: 'pin-1' } })
    expect(pinned.argv.join(' ')).toContain('--session-id pin-1')
    expect(noteFor(pinned, 'session.id')?.support).toBe('approximated')

    const both = adapter.plan({ prompt: 'x', session: { resume: 'abc', id: 'pin-1' } })
    expect(both.argv.filter((a) => a === '--session-id')).toHaveLength(1)
    expect(both.argv).not.toContain('pin-1')
    expect(noteFor(both, 'session.id')?.support).toBe('dropped')

    const last = adapter.plan({ prompt: 'x', session: { continueLast: true, persist: false } })
    expect(last.argv).not.toContain('--session-id')
    expect(noteFor(last, 'session.continueLast')?.support).toBe('dropped')
    expect(noteFor(last, 'session.persist')?.support).toBe('dropped')
  })

  test('mcp, plugins and budget are dropped', () => {
    const planned = adapter.plan({
      prompt: 'x',
      mcp: { servers: { echo: { command: 'node', env: { TOKEN: 'secret' } } } },
      plugins: { dirs: ['/p'], disable: [] },
      budgetUsd: 1,
    })
    expect(planned.argv.join(' ')).not.toContain('secret')
    expect(noteFor(planned, 'mcp.servers')?.support).toBe('dropped')
    expect(noteFor(planned, 'plugins')?.support).toBe('dropped')
    expect(noteFor(planned, 'budgetUsd')?.support).toBe('dropped')
  })

  test('cwd and env go on the planned call; extraArgs are appended last', () => {
    const planned = adapter.plan({
      prompt: 'x',
      cwd: '/repo',
      env: { FACTORY_API_KEY: 'fk-1' },
      timeoutMs: 1000,
      extraArgs: ['--tag', 'ci'],
    })
    expect(planned.cwd).toBe('/repo')
    expect(planned.argv).not.toContain('--cwd')
    expect(planned.env).toEqual({ FACTORY_API_KEY: 'fk-1' })
    expect(planned.argv.slice(-2)).toEqual(['--tag', 'ci'])
    expect(planned.notes).toEqual([])
  })
})

// Fixtures captured from real `droid exec` 0.244.0 runs against a local fake
// model server (BYOK custom model, `-m custom:mock-model`). Paths are
// shortened to /work and the init event's tool list is trimmed.

const JSON_OK =
  '{"type":"result","subtype":"success","is_error":false,"duration_ms":1674,"num_turns":2,"result":"the file says hello-file","session_id":"c6de4d48-447d-457c-89d5-902deff8b4d0","usage":{"input_tokens":22,"output_tokens":6,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"factory_credits":0,"ttft_ms":34}}\n'

// `--auto low` and a command that needs medium: the run ends early, exit 1.
const JSON_DENIED =
  '{"type":"result","subtype":"failure","is_error":true,"duration_ms":1439,"num_turns":0,"result":"Exec ended early: insufficient permission to proceed. Re-run with --auto medium or --auto high. For destructive commands, use --skip-permissions-unsafe.","session_id":"da462f33-da1c-4c23-97ad-05e042771dd9","usage":{"input_tokens":11,"output_tokens":3,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"factory_credits":0,"ttft_ms":11}}\n'

// The model server is down.
const JSON_CONNECTION_ERROR =
  '{"type":"result","subtype":"failure","is_error":true,"duration_ms":1413,"num_turns":0,"result":"Connection error.","session_id":"df98eae0-43af-4d69-86b9-e11ab4d1348d","usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"factory_credits":0}}\n'

const STREAM_TOOL = [
  '{"type":"system","subtype":"init","cwd":"/work/proj","session_id":"48584e8e-3432-4f94-9f92-5417f7f780e0","tools":["Read","LS","Execute","Edit","Create"],"model":"custom:Mock-0","reasoning_effort":"none"}',
  '{"type":"message","role":"user","id":"5e7ae5fe-fb69-45bc-a919-352294b53963","text":"read notes.txt","timestamp":1792306345235,"session_id":"48584e8e-3432-4f94-9f92-5417f7f780e0"}',
  '{"type":"tool_call","id":"call_1","messageId":"f5f60763-65c3-4d7b-9d14-64438023d7f8","toolId":"Read","toolName":"Read","parameters":{"file_path":"/work/proj/notes.txt"},"timestamp":1792306346036,"session_id":"48584e8e-3432-4f94-9f92-5417f7f780e0"}',
  '{"type":"tool_result","id":"call_1","messageId":"c51d82b0-9af7-40db-a7f8-063b57a091ba","toolId":"Read","isError":false,"value":"hello-file\\n","timestamp":1792306346066,"session_id":"48584e8e-3432-4f94-9f92-5417f7f780e0"}',
  '{"type":"message","role":"assistant","id":"4a0c7aa4-4c7d-4b37-b854-02a1042f872d","text":"the file says hello-file","timestamp":1792306346101,"session_id":"48584e8e-3432-4f94-9f92-5417f7f780e0"}',
  '{"type":"completion","finalText":"the file says hello-file","numTurns":2,"durationMs":1688,"session_id":"48584e8e-3432-4f94-9f92-5417f7f780e0","timestamp":1792306346127,"usage":{"input_tokens":22,"output_tokens":6,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"factory_credits":0,"ttft_ms":10}}',
].join('\n')

// Default (read-only) posture: Create is withheld, the tool call fails and the
// run still completes.
const STREAM_TOOL_REFUSED = [
  '{"type":"system","subtype":"init","cwd":"/work/proj","session_id":"1bb486a2-6d7c-4257-a4dd-b3522458c7c3","tools":["Read","LS","Execute","Edit","Create"],"model":"custom:Mock-0","reasoning_effort":"none"}',
  '{"type":"message","role":"user","id":"6691c887-3a3d-4c02-9df1-b6d9912d5f87","text":"create new.txt","timestamp":1792306377592,"session_id":"1bb486a2-6d7c-4257-a4dd-b3522458c7c3"}',
  '{"type":"tool_call","id":"call_1","messageId":"eca620f3-b50c-41cd-b32d-c735b77d8e13","toolId":"Create","toolName":"Create","parameters":{"file_path":"/work/proj/new.txt","content":"created"},"timestamp":1792306378309,"session_id":"1bb486a2-6d7c-4257-a4dd-b3522458c7c3"}',
  '{"type":"tool_result","id":"call_1","messageId":"dddba210-6b92-4d91-aab3-386d7aa6f96c","toolId":"Create","isError":true,"error":{"type":"tool_error","message":"Error: Tool Create is not permitted in this exec session. Available tools: Read, LS, Execute, Grep, Glob, WebSearch, FetchUrl, StageSettingsChanges, ToolSearch, and Skill."},"timestamp":1792306378332,"session_id":"1bb486a2-6d7c-4257-a4dd-b3522458c7c3"}',
  '{"type":"message","role":"assistant","id":"eadc7ef6-207e-49c0-9a84-78141f97551d","text":"done","timestamp":1792306378370,"session_id":"1bb486a2-6d7c-4257-a4dd-b3522458c7c3"}',
  '{"type":"completion","finalText":"done","numTurns":2,"durationMs":1507,"session_id":"1bb486a2-6d7c-4257-a4dd-b3522458c7c3","timestamp":1792306378389,"usage":{"input_tokens":22,"output_tokens":6,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"factory_credits":0,"ttft_ms":10.5}}',
].join('\n')

// The model server is down: no completion event, exit 1.
const STREAM_CONNECTION_ERROR = [
  '{"type":"system","subtype":"init","cwd":"/work/proj","session_id":"7e20ecdc-4205-440d-816a-4d0dcc495c4b","tools":["Read","LS","Execute","Edit","Create"],"model":"custom:Mock-0","reasoning_effort":"none"}',
  '{"type":"message","role":"user","id":"8b9fedcc-7518-483f-92c9-2f36f720d3b5","text":"hi","timestamp":1792306465236,"session_id":"7e20ecdc-4205-440d-816a-4d0dcc495c4b"}',
  '{"type":"error","source":"agent_loop","message":"Connection error.","timestamp":1792306465970,"session_id":"7e20ecdc-4205-440d-816a-4d0dcc495c4b"}',
  '{"type":"error","source":"cli","message":"Connection error.","timestamp":1792306465986,"session_id":"7e20ecdc-4205-440d-816a-4d0dcc495c4b"}',
].join('\n')

describe('droid parse', () => {
  test('json envelope', () => {
    const planned = adapter.plan({ prompt: 'read notes.txt' })
    const parsed = adapter.parseResult(planned, raw(JSON_OK))
    expect(parsed.text).toBe('the file says hello-file')
    expect(parsed.sessionId).toBe('c6de4d48-447d-457c-89d5-902deff8b4d0')
    expect(parsed.usage).toEqual({
      inputTokens: 22,
      outputTokens: 6,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(parsed.stopReason).toBe('success')
    expect(parsed.isError).toBe(false)
  })

  test('json failure envelopes are errors', () => {
    const planned = adapter.plan({ prompt: 'install', permissions: { mode: 'edits' } })
    const denied = adapter.parseResult(planned, raw(JSON_DENIED, 1))
    expect(denied.isError).toBe(true)
    expect(denied.errorDetail).toContain('insufficient permission')
    expect(denied.stopReason).toBe('failure')

    const down = adapter.parseResult(planned, raw(JSON_CONNECTION_ERROR, 1))
    expect(down.isError).toBe(true)
    expect(down.errorDetail).toBe('Connection error.')
  })

  test('a flag error leaves stdout empty and is an error', () => {
    // Captured: `droid exec -m no-such-model -o json` exits 1 with stderr only.
    const planned = adapter.plan({ prompt: 'x', model: 'no-such-model' })
    const parsed = adapter.parseResult(
      planned,
      raw('', 1, 'Invalid model: no-such-model\n\nAvailable built-in models:\n  auto, ...\n'),
    )
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toContain('no parseable envelope')
  })

  test('text output is the final answer', () => {
    const planned = adapter.plan({ prompt: 'read notes.txt', output: { format: 'text' } })
    const parsed = adapter.parseResult(planned, raw('the file says hello-file\n'))
    expect(parsed.text).toBe('the file says hello-file')
    expect(parsed.isError).toBeUndefined()
  })

  test('schema answers are parsed from the text', () => {
    const planned = adapter.plan({ prompt: 'x', output: { schema: { type: 'object' } } })
    const envelope = JSON.stringify({ ...JSON.parse(JSON_OK), result: '{"a":1}' })
    expect(adapter.parseResult(planned, raw(envelope)).structured).toEqual({ a: 1 })

    const streamed = adapter.plan({
      prompt: 'x',
      output: { format: 'stream-json', schema: { type: 'object' } },
    })
    const stream = STREAM_TOOL.replaceAll('the file says hello-file', '{\\"a\\":2}')
    expect(adapter.parseResult(streamed, raw(stream)).structured).toEqual({ a: 2 })
  })

  test('stream-json with a tool call', () => {
    const planned = adapter.plan({ prompt: 'read notes.txt', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(STREAM_TOOL))
    expect(parsed.text).toBe('the file says hello-file')
    expect(parsed.sessionId).toBe('48584e8e-3432-4f94-9f92-5417f7f780e0')
    expect(parsed.model).toBe('custom:Mock-0')
    expect(parsed.usage?.inputTokens).toBe(22)
    expect(parsed.usage?.outputTokens).toBe(6)
    expect(parsed.events).toHaveLength(6)
    expect(parsed.isError).toBe(false)
  })

  test('stream-json without a completion event is an error', () => {
    const planned = adapter.plan({ prompt: 'hi', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(STREAM_CONNECTION_ERROR, 1))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toBe('Connection error.')
    expect(parsed.sessionId).toBe('7e20ecdc-4205-440d-816a-4d0dcc495c4b')

    const truncated = adapter.parseResult(planned, raw(STREAM_TOOL.split('\n')[0]!, null))
    expect(truncated.isError).toBe(true)
    expect(truncated.errorDetail).toContain('without a completion event')
  })
})

describe('droid conversation', () => {
  test('stream-json lifts tool calls and results', () => {
    const planned = adapter.plan({ prompt: 'read notes.txt', output: { format: 'stream-json' } })
    const conversation = adapter.toConversation?.(planned, raw(STREAM_TOOL))
    expect(conversation?.agent).toBe('droid')
    expect(conversation?.model).toBe('custom:Mock-0')
    expect(conversation?.durationMs).toBe(1688)
    expect(conversation?.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ])
    expect(conversation?.messages[1]?.parts[0]).toEqual({
      type: 'tool-call',
      callId: 'call_1',
      name: 'Read',
      input: { file_path: '/work/proj/notes.txt' },
    })
    expect(conversation?.messages[2]?.parts[0]).toEqual({
      type: 'tool-result',
      callId: 'call_1',
      name: 'Read',
      output: 'hello-file\n',
      isError: false,
    })
    expect(conversation?.messages[1]?.timestamp).toBe(new Date(1792306346036).toISOString())
    expect(conversation?.raw.format).toBe('droid/stream-json')
  })

  test('a refused tool call surfaces as an error result', () => {
    const planned = adapter.plan({ prompt: 'create new.txt', output: { format: 'stream-json' } })
    const conversation = adapter.toConversation?.(planned, raw(STREAM_TOOL_REFUSED))
    const result = conversation?.messages.find((m) => m.role === 'tool')?.parts[0]
    expect(result).toMatchObject({ type: 'tool-result', isError: true })
    expect(result?.type === 'tool-result' && String(result.output)).toContain('not permitted')
  })

  test('reasoning events become reasoning parts', () => {
    // Built from the stream writer in the 0.244.0 binary: the fake model
    // server sends no reasoning, so this event was not captured from a run.
    const stream = [
      '{"type":"reasoning","id":"m1","text":"thinking it over","timestamp":1792306346000,"session_id":"s1"}',
      '{"type":"message","role":"assistant","id":"m1","text":"ok","timestamp":1792306346001,"session_id":"s1"}',
      '{"type":"completion","finalText":"ok","numTurns":1,"durationMs":5,"session_id":"s1","timestamp":1792306346002,"usage":{"input_tokens":1,"output_tokens":1,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"factory_credits":0}}',
    ].join('\n')
    const planned = adapter.plan({ prompt: 'x', output: { format: 'stream-json' } })
    const conversation = adapter.toConversation?.(planned, raw(stream))
    expect(conversation?.messages.flatMap((m) => m.parts.map((p) => p.type))).toEqual([
      'text',
      'reasoning',
      'text',
    ])
  })

  test('json reports the prompt and the final answer', () => {
    const planned = adapter.plan({ prompt: 'read notes.txt' })
    const conversation = adapter.toConversation?.(planned, raw(JSON_OK))
    expect(conversation?.messages).toEqual([
      { role: 'user', parts: [{ type: 'text', text: 'read notes.txt' }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'the file says hello-file' }] },
    ])
    expect(conversation?.sessionId).toBe('c6de4d48-447d-457c-89d5-902deff8b4d0')
  })
})
