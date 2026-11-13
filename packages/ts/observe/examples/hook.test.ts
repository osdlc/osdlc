/**
 * The hook entry: read the envelope of a harness's hook payload, then the
 * body fields a hook needs.
 */

import { expect, test } from 'vitest'

import {
  HOOK_ENVELOPE_FIELDS,
  HOOK_HARNESSES,
  HookEnvelopeSchema,
  isPermissionNotification,
  normalizeHook,
  normalizeHookText,
  rawNumber,
  rawString,
  rawValue,
  type HookEnvelope,
  type HookEnvelopeField,
  type HookHarness,
} from '@osdlc/observe/hook'

test('normalize a hook payload and read its body', () => {
  // What Codex writes to a PostToolUse hook's stdin.
  const stdin = JSON.stringify({
    hook_event_name: 'PostToolUse',
    session_id: 'b6f1c0de-2a4e-4c8f-9e51-3f7d2a1b0c99',
    turn_id: 'turn-7',
    cwd: '/work/repo',
    transcript_path: null,
    tool_name: 'Bash',
    tool_input: { command: 'npm test' },
    duration_ms: 812,
  })

  const envelope: HookEnvelope = normalizeHookText('codex', stdin)
  // envelope.event: 'PostToolUse', envelope.promptId: 'turn-7'
  // envelope.missing: ['transcript_path']

  const tool = rawString(envelope, 'tool_name') // 'Bash'
  const ms = rawNumber(envelope, 'duration_ms') // 812
  const input = rawValue(envelope, 'tool_input') // { command: 'npm test' }

  expect(envelope).toMatchObject({
    harness: 'codex',
    event: 'PostToolUse',
    sessionId: 'b6f1c0de-2a4e-4c8f-9e51-3f7d2a1b0c99',
    cwd: '/work/repo',
    transcriptPath: null,
    promptId: 'turn-7',
    missing: ['transcript_path'],
  })
  expect([tool, ms, input]).toEqual(['Bash', 812, { command: 'npm test' }])
})

test('a payload that is not an object still gives an envelope', () => {
  const envelope = normalizeHook('claude', 'not an object')

  expect(envelope.event).toBe('unknown')
  expect(envelope.raw).toBeNull()
  const missing: HookEnvelopeField[] = envelope.missing
  expect(missing).toEqual([...HOOK_ENVELOPE_FIELDS])
  expect(HookEnvelopeSchema.parse(envelope)).toEqual(envelope)
})

test('a Notification that waits on a person', () => {
  const envelope = normalizeHook('claude', {
    hook_event_name: 'Notification',
    session_id: 's-1',
    notification_type: 'permission_prompt',
  })

  expect(isPermissionNotification(rawString(envelope, 'notification_type'))).toBe(true)
  expect(isPermissionNotification('idle_prompt')).toBe(false)
})

test('the harness ids', () => {
  const harness: HookHarness = 'opencode'
  expect(HOOK_HARNESSES).toContain(harness)
})
