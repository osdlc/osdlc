import { describe, expect, test } from 'vitest'

import {
  normalizeHook,
  normalizeHookText,
  rawNumber,
  rawString,
  rawValue,
} from '../src/hook-payload.ts'

const common = {
  session_id: 'c7b1d2a0-0000-4000-8000-000000000001',
  transcript_path: '/home/u/.claude/projects/p/c7b1.jsonl',
  cwd: '/work/repo',
  permission_mode: 'default',
}

/** One recorded payload per event Claude Code reports, body fields as documented. */
const FIXTURES: Record<string, Record<string, unknown>> = {
  SessionStart: { source: 'startup', model: 'claude-sonnet-5-5' },
  UserPromptSubmit: { prompt_id: 'p-1', prompt: 'fix the bug' },
  PostToolUse: {
    tool_name: 'Read',
    tool_input: { file_path: '/work/repo/a.ts' },
    tool_use_id: 'toolu_1',
    tool_response: { content: 'x' },
    duration_ms: 12,
  },
  PostToolUseFailure: {
    tool_name: 'Bash',
    tool_input: { command: 'false' },
    tool_use_id: 'toolu_2',
    error: 'exit 1',
  },
  Notification: { message: 'needs permission', notification_type: 'permission_prompt' },
  Stop: { stop_hook_active: false, last_assistant_message: 'done' },
  SubagentStart: { agent_id: 'a-1', agent_type: 'Explore' },
  SubagentStop: {
    agent_id: 'a-1',
    agent_type: 'Explore',
    agent_transcript_path: '/t/a-1.jsonl',
    last_assistant_message: 'found it',
  },
  PreCompact: { trigger: 'auto' },
  PostModelSwitch: { from_model: 'a', to_model: 'b' },
  SessionEnd: { reason: 'prompt_input_exit' },
}

describe('normalizeHook', () => {
  for (const [event, body] of Object.entries(FIXTURES)) {
    test(`${event}: envelope fields are lifted and the body stays in raw`, () => {
      const payload = { ...common, hook_event_name: event, ...body }
      const envelope = normalizeHook('claude', payload)
      expect(envelope).toMatchObject({
        harness: 'claude',
        event,
        sessionId: common.session_id,
        cwd: common.cwd,
        transcriptPath: common.transcript_path,
        missing: [],
      })
      expect(envelope.raw).toEqual(payload)
      if ('prompt_id' in body) expect(envelope.promptId).toBe('p-1')
    })
  }

  test('lists the envelope fields a payload lacks', () => {
    const envelope = normalizeHook('claude', { hook_event_name: 'Stop', cwd: '/w' })
    expect(envelope).toMatchObject({ event: 'Stop', sessionId: null, transcriptPath: null })
    expect(envelope.missing).toEqual(['session_id', 'transcript_path'])
  })

  test('an event this version does not know is still normalized with its name', () => {
    const envelope = normalizeHook('claude', { ...common, hook_event_name: 'FutureEvent', x: 1 })
    expect(envelope).toMatchObject({ event: 'FutureEvent', missing: [] })
    expect(envelope.raw?.['x']).toBe(1)
  })

  test.each([null, 3, 'text', [1], undefined])('a non-object payload (%p) never throws', (bad) => {
    expect(normalizeHook('claude', bad)).toMatchObject({
      event: 'unknown',
      sessionId: null,
      raw: null,
      missing: ['event', 'session_id', 'cwd', 'transcript_path'],
    })
  })

  test('text that is not JSON is a payload-less envelope', () => {
    expect(normalizeHookText('claude', '{not json')).toMatchObject({ event: 'unknown', raw: null })
    expect(normalizeHookText('claude', '')).toMatchObject({ event: 'unknown', raw: null })
  })

  test('typed readers return undefined for a missing or mistyped field', () => {
    const envelope = normalizeHook('claude', { hook_event_name: 'x', a: 'str', n: 4, bad: {} })
    expect(rawString(envelope, 'a')).toBe('str')
    expect(rawString(envelope, 'n')).toBeUndefined()
    expect(rawNumber(envelope, 'n')).toBe(4)
    expect(rawNumber(envelope, 'a')).toBeUndefined()
    expect(rawString(envelope, 'bad')).toBeUndefined()
  })
})

describe('the hook body readers read own fields only', () => {
  test('an inherited key is absent', () => {
    const envelope = normalizeHook('claude', { hook_event_name: 'Stop' })
    expect(rawValue(envelope, 'constructor')).toBeUndefined()
    expect(rawString(envelope, 'toString')).toBeUndefined()
    expect(rawNumber(envelope, 'valueOf')).toBeUndefined()
    expect(rawString(envelope, 'hook_event_name')).toBe('Stop')
  })
})
