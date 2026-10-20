/** Examples: the redaction marker and the Codex hook trust helpers. */

import { describe, expect, test } from 'vitest'

import { REDACTED, codexHookHash, snakeEvent } from '@osdlc/detect-harness'

describe('redaction', () => {
  test('a redacted value reads "<redacted>"', () => {
    expect(REDACTED).toBe('<redacted>')
  })
})

describe('codex hook trust', () => {
  test('snakeEvent gives the event segment of Codex trust keys', () => {
    expect(snakeEvent('PostToolUse')).toBe('post_tool_use')
  })

  test('codexHookHash gives the hash Codex records when a hook is approved', () => {
    const hook = { type: 'command', command: 'true' }
    const hash = codexHookHash('SessionStart', { hooks: [hook] }, hook)
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})
