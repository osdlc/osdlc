import { describe, expect, test } from 'vitest'

import { qwenAdapter } from '../../src/adapters/qwen.js'
import type { RawProcessOutput } from '../../src/adapters/types.js'
import { TMP_TOKEN } from '../../src/plan.js'

const adapter = qwenAdapter()

function raw(stdout: string, exitCode = 0): RawProcessOutput {
  return { stdout, stderr: '', exitCode, durationMs: 10, timedOut: false }
}

function supportOf(notes: { field: string; support: string }[], field: string): string | undefined {
  return notes.find((n) => n.field === field)?.support
}

describe('qwen plan', () => {
  test('minimal spec: json event array, prompt on stdin', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    expect(planned.argv).toEqual(['qwen', '--output-format', 'json'])
    expect(planned.stdin).toBe('say hi')
    expect(planned.outputFormat).toBe('json')
    expect(planned.notes).toEqual([])
  })

  test('every output format is passed through without a note', () => {
    for (const format of ['text', 'json', 'stream-json'] as const) {
      const planned = adapter.plan({ prompt: 'x', output: { format } })
      expect(planned.argv).toEqual(['qwen', '--output-format', format])
      expect(planned.notes).toEqual([])
    }
  })

  test('model, system prompts, dirs and schema map natively', () => {
    const planned = adapter.plan({
      prompt: 'q',
      model: 'qwen3-coder-plus',
      systemPrompt: 'be terse',
      appendSystemPrompt: 'cite files',
      context: { dirs: ['/a', '/b'], text: 'background' },
      output: { schema: { type: 'object' } },
      extraArgs: ['--max-session-turns', '3'],
    })
    const joined = planned.argv.join(' ')
    expect(joined).toContain('--model qwen3-coder-plus')
    expect(joined).toContain('--system-prompt be terse')
    expect(joined).toContain('--append-system-prompt cite files')
    expect(joined).toContain('--include-directories /a --include-directories /b')
    expect(joined).toContain('--json-schema {"type":"object"}')
    expect(planned.argv.slice(-2)).toEqual(['--max-session-turns', '3'])
    // Native fields are not repeated in the prompt; context.text still is.
    expect(planned.stdin).toBe('<context>\nbackground\n</context>\n\nq')
    for (const field of ['systemPrompt', 'appendSystemPrompt', 'context.dirs', 'output.schema']) {
      expect(supportOf(planned.notes, field)).toBe('native')
    }
  })

  test('effort rides a temp settings file named by QWEN_CODE_SYSTEM_DEFAULTS_PATH', () => {
    for (const effort of ['low', 'xhigh', 'max'] as const) {
      const planned = adapter.plan({ prompt: 'x', effort, env: { A: '1' } })
      expect(planned.argv).toEqual(['qwen', '--output-format', 'json'])
      expect(planned.env).toEqual({
        A: '1',
        QWEN_CODE_SYSTEM_DEFAULTS_PATH: `${TMP_TOKEN}/qwen-system-defaults.json`,
      })
      expect(planned.tempFiles).toEqual([
        {
          name: 'qwen-system-defaults.json',
          content: JSON.stringify({ model: { reasoningEffort: effort } }),
        },
      ])
      expect(supportOf(planned.notes, 'effort')).toBe('approximated')
    }
  })

  test('permission modes map to --approval-mode', () => {
    expect(adapter.plan({ prompt: 'x', permissions: { mode: 'default' } }).argv).toEqual([
      'qwen',
      '--output-format',
      'json',
    ])

    const readOnly = adapter.plan({ prompt: 'x', permissions: { mode: 'read-only' } })
    expect(readOnly.argv.join(' ')).toContain('--approval-mode plan')
    expect(supportOf(readOnly.notes, 'permissions.mode')).toBe('approximated')

    const edits = adapter.plan({ prompt: 'x', permissions: { mode: 'edits' } })
    expect(edits.argv.join(' ')).toContain('--approval-mode auto-edit')
    expect(supportOf(edits.notes, 'permissions.mode')).toBe('native')

    const fullAuto = adapter.plan({ prompt: 'x', permissions: { mode: 'full-auto' } })
    expect(fullAuto.argv.join(' ')).toContain(
      '--approval-mode auto-edit --allowed-tools run_shell_command --allowed-tools web_fetch',
    )
    expect(supportOf(fullAuto.notes, 'permissions.mode')).toBe('approximated')

    const bypass = adapter.plan({ prompt: 'x', permissions: { mode: 'bypass' } })
    expect(bypass.argv.join(' ')).toContain('--approval-mode yolo')
    expect(supportOf(bypass.notes, 'permissions.mode')).toBe('native')
  })

  test('tool rules repeat their flag once per pattern', () => {
    const planned = adapter.plan({
      prompt: 'x',
      permissions: { allowTools: ['run_shell_command(git *)', 'edit'], denyTools: ['web_fetch'] },
    })
    const joined = planned.argv.join(' ')
    expect(joined).toContain('--allowed-tools run_shell_command(git *) --allowed-tools edit')
    expect(joined).toContain('--exclude-tools web_fetch')
    expect(supportOf(planned.notes, 'permissions.allowTools')).toBe('native')
    expect(supportOf(planned.notes, 'permissions.denyTools')).toBe('native')
  })

  test('context files use @path syntax in the prompt', () => {
    const planned = adapter.plan({ prompt: 'x', context: { files: ['src/a.ts'] } })
    expect(planned.stdin).toContain('@src/a.ts')
    expect(supportOf(planned.notes, 'context.files')).toBe('emulated')
  })

  test('sessions: id, resume with the = form, continue, no recording', () => {
    const pinned = adapter.plan({
      prompt: 'x',
      session: { id: '123e4567-e89b-42d3-a456-426614174000', persist: false },
    })
    expect(pinned.argv.join(' ')).toContain('--session-id 123e4567-e89b-42d3-a456-426614174000')
    expect(pinned.argv.join(' ')).toContain('--chat-recording false')
    expect(supportOf(pinned.notes, 'session.id')).toBe('native')
    expect(supportOf(pinned.notes, 'session.persist')).toBe('approximated')

    const resume = adapter.plan({ prompt: 'x', session: { resume: '-abc', continueLast: true } })
    expect(resume.argv).toContain('--resume=-abc')
    expect(resume.argv).not.toContain('--continue')

    const last = adapter.plan({ prompt: 'x', session: { continueLast: true } })
    expect(last.argv).toContain('--continue')
    expect(supportOf(last.notes, 'session.continueLast')).toBe('native')
  })

  test('MCP servers go to a temp --mcp-config file; strict limits to their names', () => {
    const servers = { demo: { command: 'node', env: { TOKEN: 's3cret' } }, web: { url: 'u' } }
    const planned = adapter.plan({ prompt: 'x', mcp: { servers, strict: true } })
    expect(planned.argv.join(' ')).toContain(
      `--mcp-config ${TMP_TOKEN}/mcp.json --allowed-mcp-server-names demo --allowed-mcp-server-names web`,
    )
    expect(planned.argv.join(' ')).not.toContain('s3cret')
    expect(planned.tempFiles).toEqual([
      { name: 'mcp.json', content: JSON.stringify({ mcpServers: servers }) },
    ])
    expect(supportOf(planned.notes, 'mcp.servers')).toBe('native')
  })

  test('budget and plugins are dropped', () => {
    const planned = adapter.plan({
      prompt: 'x',
      budgetUsd: 1,
      plugins: { dirs: ['/p'], disable: [] },
    })
    expect(planned.argv).toEqual(['qwen', '--output-format', 'json'])
    expect(supportOf(planned.notes, 'budgetUsd')).toBe('dropped')
    expect(supportOf(planned.notes, 'plugins')).toBe('dropped')
  })

  test('cwd and env go on the planned call', () => {
    const planned = adapter.plan({ prompt: 'x', cwd: '/w', env: { OPENAI_MODEL: 'm' } })
    expect(planned.cwd).toBe('/w')
    expect(planned.env).toEqual({ OPENAI_MODEL: 'm' })
  })

  test('a custom binary is argv[0]', () => {
    expect(qwenAdapter({ binary: '/opt/qwen' }).plan({ prompt: 'x' }).argv[0]).toBe('/opt/qwen')
  })
})

// Fixtures captured from qwen 0.25.2 (`--auth-type openai`, pointed at a fake
// OpenAI-compatible server through OPENAI_BASE_URL). Trimmed: the init event's
// tools/slash_commands/agents/cwd lists, the result's `stats`, and the
// stream's `stream_event` goal_state line are dropped; paths are shortened.
const INIT = (id: string) =>
  `{"type":"system","subtype":"init","uuid":"${id}","session_id":"${id}","model":"mock-model","permission_mode":"auto","qwen_code_version":"0.25.2"}`

const JSON_RUN = `[${[
  INIT('c0728de0-8042-4452-a32e-5c38b9aaa29d'),
  '{"type":"assistant","uuid":"eb18fe62-816e-46b3-8b8d-ff4964337743","session_id":"c0728de0-8042-4452-a32e-5c38b9aaa29d","parent_tool_use_id":null,"message":{"id":"eb18fe62-816e-46b3-8b8d-ff4964337743","type":"message","role":"assistant","model":"mock-model","content":[{"type":"text","text":"hello from qwen"}],"stop_reason":null,"usage":{"input_tokens":11,"output_tokens":3,"cache_read_input_tokens":0,"total_tokens":14}}}',
  '{"type":"result","subtype":"success","uuid":"f1b13ff0-98f8-44d2-8913-f8240a02a784","session_id":"c0728de0-8042-4452-a32e-5c38b9aaa29d","is_error":false,"duration_ms":418,"duration_api_ms":218,"num_turns":1,"result":"hello from qwen","usage":{"input_tokens":22,"output_tokens":6,"cache_read_input_tokens":0,"total_tokens":28},"permission_denials":[]}',
].join(',')}]`

const STREAM_TOOL_RUN = [
  INIT('9cbdcc3d-6286-45b3-8693-e2c8de4203d7'),
  '{"type":"assistant","uuid":"7c8f0af9-5ba6-4ee1-a390-c76950f3dd08","session_id":"9cbdcc3d-6286-45b3-8693-e2c8de4203d7","parent_tool_use_id":null,"message":{"id":"7c8f0af9-5ba6-4ee1-a390-c76950f3dd08","type":"message","role":"assistant","model":"mock-model","content":[{"type":"tool_use","id":"call_1","name":"read_file","input":{"file_path":"/work/a.txt"}}],"stop_reason":"tool_use","usage":{"input_tokens":11,"output_tokens":3,"cache_read_input_tokens":0,"total_tokens":14}}}',
  '{"type":"user","uuid":"a6018f9b-cf9c-49ac-aed9-a71cd0f3caec","session_id":"9cbdcc3d-6286-45b3-8693-e2c8de4203d7","parent_tool_use_id":null,"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"call_1","is_error":false,"content":"hello\\n"}]}}',
  '{"type":"assistant","uuid":"7d0dbedd-0b69-48e9-a27b-3d5cb6a92548","session_id":"9cbdcc3d-6286-45b3-8693-e2c8de4203d7","parent_tool_use_id":null,"message":{"id":"7d0dbedd-0b69-48e9-a27b-3d5cb6a92548","type":"message","role":"assistant","model":"mock-model","content":[{"type":"text","text":"the file says hello"}],"stop_reason":null,"usage":{"input_tokens":11,"output_tokens":3,"cache_read_input_tokens":0,"total_tokens":14}}}',
  '{"type":"result","subtype":"success","uuid":"70d202ef-c95d-424a-9ea6-0f712820ab56","session_id":"9cbdcc3d-6286-45b3-8693-e2c8de4203d7","is_error":false,"duration_ms":516,"duration_api_ms":266,"num_turns":2,"result":"the file says hello","usage":{"input_tokens":33,"output_tokens":9,"cache_read_input_tokens":0,"total_tokens":42},"permission_denials":[]}',
].join('\n')

// Default approval mode, headless: the shell call is declined, not prompted for.
const STREAM_DENIED_RUN = [
  INIT('de04d049-5dfc-4f4f-840c-501f46f91608'),
  '{"type":"assistant","uuid":"4278d6af-7788-47ab-aa39-129db5bd8dbd","session_id":"de04d049-5dfc-4f4f-840c-501f46f91608","parent_tool_use_id":null,"message":{"id":"4278d6af-7788-47ab-aa39-129db5bd8dbd","type":"message","role":"assistant","model":"mock-model","content":[{"type":"tool_use","id":"call_1","name":"run_shell_command","input":{"command":"echo hi > made.txt"}}],"stop_reason":"tool_use","usage":{"input_tokens":11,"output_tokens":3,"cache_read_input_tokens":0,"total_tokens":14}}}',
  '{"type":"user","uuid":"e547fb27-2f40-44a9-99e3-d09a801efa79","session_id":"de04d049-5dfc-4f4f-840c-501f46f91608","parent_tool_use_id":null,"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"call_1","is_error":true,"content":"Qwen Code requires permission to use \\"run_shell_command\\", but that permission was declined. Matching deny rule: \\"run_shell_command\\"."}]}}',
  '{"type":"assistant","uuid":"6079c712-b732-4497-90d8-91b99226e811","session_id":"de04d049-5dfc-4f4f-840c-501f46f91608","parent_tool_use_id":null,"message":{"id":"6079c712-b732-4497-90d8-91b99226e811","type":"message","role":"assistant","model":"mock-model","content":[{"type":"text","text":"pong"}],"stop_reason":null,"usage":{"input_tokens":11,"output_tokens":3,"cache_read_input_tokens":0,"total_tokens":14}}}',
  '{"type":"result","subtype":"success","uuid":"48c50558-6564-4644-afee-1f1503957ffd","session_id":"de04d049-5dfc-4f4f-840c-501f46f91608","is_error":false,"duration_ms":351,"duration_api_ms":211,"num_turns":2,"result":"pong","usage":{"input_tokens":33,"output_tokens":9,"cache_read_input_tokens":0,"total_tokens":42},"permission_denials":[{"tool_name":"run_shell_command","tool_use_id":"call_1","tool_input":{"command":"echo hi > made.txt"}}]}',
].join('\n')

// The model endpoint refused the connection; qwen exits 1.
const JSON_ERROR_RUN = `[${[
  INIT('b80f3319-efe3-4e78-8f1f-e66a1df72f40'),
  '{"type":"assistant","uuid":"54192018-896a-4aac-8fe2-a55e89015bf6","session_id":"b80f3319-efe3-4e78-8f1f-e66a1df72f40","parent_tool_use_id":null,"message":{"id":"54192018-896a-4aac-8fe2-a55e89015bf6","type":"message","role":"assistant","model":"mock-model","content":[{"type":"text","text":"[API Error: Connection error. (cause: fetch failed)]"}],"stop_reason":null,"usage":{"input_tokens":0,"output_tokens":0}}}',
  '{"type":"result","subtype":"error_during_execution","uuid":"7d9d5301-88fa-43e7-9de0-790c2b4d9228","session_id":"b80f3319-efe3-4e78-8f1f-e66a1df72f40","is_error":true,"duration_ms":3285,"duration_api_ms":0,"num_turns":1,"usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0},"permission_denials":[],"error":{"message":"[API Error: Connection error. (cause: fetch failed)]"}}',
].join(',')}]`

const JSON_SCHEMA_RUN = `[${[
  INIT('825a9fa5-a0b4-4b9d-a40a-3cacdf035671'),
  '{"type":"assistant","uuid":"ba9a76e7-c9fd-4974-8bd6-8aa426d51401","session_id":"825a9fa5-a0b4-4b9d-a40a-3cacdf035671","parent_tool_use_id":null,"message":{"id":"ba9a76e7-c9fd-4974-8bd6-8aa426d51401","type":"message","role":"assistant","model":"mock-model","content":[{"type":"tool_use","id":"call_1","name":"structured_output","input":{"answer":"forty-two"}}],"stop_reason":"tool_use","usage":{"input_tokens":11,"output_tokens":3,"cache_read_input_tokens":0,"total_tokens":14}}}',
  '{"type":"user","uuid":"c8157e25-4c32-46d2-9666-b3b7438f0b02","session_id":"825a9fa5-a0b4-4b9d-a40a-3cacdf035671","parent_tool_use_id":null,"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"call_1","is_error":false,"content":"Structured output accepted."}]}}',
  '{"type":"result","subtype":"success","uuid":"571bc72a-63c4-487a-90ac-4ca16cf02515","session_id":"825a9fa5-a0b4-4b9d-a40a-3cacdf035671","is_error":false,"duration_ms":261,"duration_api_ms":203,"num_turns":1,"result":"{\\"answer\\":\\"forty-two\\"}","usage":{"input_tokens":11,"output_tokens":3,"cache_read_input_tokens":0,"total_tokens":14},"permission_denials":[],"structured_result":{"answer":"forty-two"}}',
].join(',')}]`

// --json-schema set, but the model answered in plain text.
const JSON_SCHEMA_MISSED = `[${[
  INIT('8f803f23-1ce6-46e8-b5db-ede2555f7f00'),
  '{"type":"result","subtype":"error_during_execution","uuid":"8c76d40a-549a-47a3-a8b3-87c21118839a","session_id":"8f803f23-1ce6-46e8-b5db-ede2555f7f00","is_error":true,"duration_ms":426,"duration_api_ms":246,"num_turns":1,"usage":{"input_tokens":22,"output_tokens":6,"cache_read_input_tokens":0,"total_tokens":28},"permission_denials":[],"error":{"message":"Model produced plain text instead of calling the structured_output tool as required by --json-schema after 1 turn(s). Output preview (4 chars): \\"pong\\"."}}',
].join(',')}]`

describe('qwen parse', () => {
  test('json: the last event of the array is the result envelope', () => {
    const planned = adapter.plan({ prompt: 'say hello' })
    const parsed = adapter.parseResult(planned, raw(JSON_RUN))
    expect(parsed.text).toBe('hello from qwen')
    expect(parsed.sessionId).toBe('c0728de0-8042-4452-a32e-5c38b9aaa29d')
    expect(parsed.model).toBe('mock-model')
    expect(parsed.usage).toEqual({
      inputTokens: 22,
      outputTokens: 6,
      cacheReadTokens: 0,
      cacheWriteTokens: undefined,
    })
    expect(parsed.stopReason).toBe('success')
    expect(parsed.isError).toBe(false)
  })

  test('text: stdout is the answer', () => {
    const planned = adapter.plan({ prompt: 'say hello', output: { format: 'text' } })
    expect(adapter.parseResult(planned, raw('hello from qwen\n')).text).toBe('hello from qwen')

    const schema = adapter.plan({
      prompt: 'q',
      output: { format: 'text', schema: { type: 'object' } },
    })
    expect(adapter.parseResult(schema, raw('{"answer":"forty-two"}\n')).structured).toEqual({
      answer: 'forty-two',
    })
  })

  test('stream-json with a tool call', () => {
    const planned = adapter.plan({ prompt: 'read a.txt', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(STREAM_TOOL_RUN))
    expect(parsed.text).toBe('the file says hello')
    expect(parsed.sessionId).toBe('9cbdcc3d-6286-45b3-8693-e2c8de4203d7')
    expect(parsed.usage?.inputTokens).toBe(33)
    expect(parsed.events).toHaveLength(5)
    expect(parsed.isError).toBe(false)

    const conversation = adapter.toConversation?.(planned, raw(STREAM_TOOL_RUN))
    expect(conversation?.agent).toBe('qwen')
    expect(conversation?.model).toBe('mock-model')
    expect(conversation?.raw.format).toBe('qwen/stream-json')
    expect(conversation?.messages).toEqual([
      { role: 'user', parts: [{ type: 'text', text: 'read a.txt' }] },
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            callId: 'call_1',
            name: 'read_file',
            input: { file_path: '/work/a.txt' },
          },
        ],
      },
      {
        role: 'tool',
        parts: [{ type: 'tool-result', callId: 'call_1', output: 'hello\n', isError: false }],
      },
      { role: 'assistant', parts: [{ type: 'text', text: 'the file says hello' }] },
    ])
  })

  test('a tool declined headless is a failed tool result, not a failed run', () => {
    const planned = adapter.plan({ prompt: 'run it', output: { format: 'stream-json' } })
    const parsed = adapter.parseResult(planned, raw(STREAM_DENIED_RUN))
    expect(parsed.isError).toBe(false)
    const conversation = adapter.toConversation?.(planned, raw(STREAM_DENIED_RUN))
    const result = conversation?.messages
      .flatMap((m) => m.parts)
      .find((p) => p.type === 'tool-result')
    expect(result).toMatchObject({ type: 'tool-result', callId: 'call_1', isError: true })
  })

  test('json conversation comes from the event array', () => {
    const planned = adapter.plan({ prompt: 'say hello' })
    const conversation = adapter.toConversation?.(planned, raw(JSON_RUN))
    expect(conversation?.sessionId).toBe('c0728de0-8042-4452-a32e-5c38b9aaa29d')
    expect(conversation?.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(conversation?.raw.format).toBe('qwen/json')
  })

  test('an error envelope reports error.message', () => {
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(planned, raw(JSON_ERROR_RUN, 1))
    expect(parsed.isError).toBe(true)
    expect(parsed.text).toBe('')
    expect(parsed.stopReason).toBe('error_during_execution')
    expect(parsed.errorDetail).toBe('[API Error: Connection error. (cause: fetch failed)]')
  })

  test('the schema answer comes from structured_result', () => {
    const planned = adapter.plan({ prompt: 'q', output: { schema: { type: 'object' } } })
    const parsed = adapter.parseResult(planned, raw(JSON_SCHEMA_RUN))
    expect(parsed.structured).toEqual({ answer: 'forty-two' })
    expect(parsed.text).toBe('{"answer":"forty-two"}')

    const missed = adapter.parseResult(planned, raw(JSON_SCHEMA_MISSED, 1))
    expect(missed.isError).toBe(true)
    expect(missed.errorDetail).toContain('instead of calling the structured_output tool')
  })

  test('a stream without a result event is an error', () => {
    const planned = adapter.plan({ prompt: 'hi', output: { format: 'stream-json' } })
    const truncated = STREAM_TOOL_RUN.split('\n').slice(0, 2).join('\n')
    const parsed = adapter.parseResult(planned, raw(truncated))
    expect(parsed.isError).toBe(true)
    expect(parsed.errorDetail).toContain('no result event')
  })

  test('unparseable json stdout is an error', () => {
    const parsed = adapter.parseResult(adapter.plan({ prompt: 'hi' }), raw('not json'))
    expect(parsed.isError).toBe(true)
  })
})
