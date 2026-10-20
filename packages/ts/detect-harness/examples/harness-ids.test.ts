/** Examples: the harness ids, their aliases, and which harness this process runs in. */

import { describe, expect, test } from 'vitest'

import {
  BUILTIN_HARNESSES,
  HARNESS_ALIASES,
  current,
  harnessId,
  type BuiltinHarnessId,
  type CurrentHarness,
} from '@osdlc/detect-harness'

describe('ids', () => {
  test('the built-in ids, in report order', () => {
    const first: BuiltinHarnessId = BUILTIN_HARNESSES[0]
    expect(first).toBe('claude')
    expect(BUILTIN_HARNESSES).toHaveLength(6)
  })

  test('harnessId takes an id or an alias', () => {
    expect(HARNESS_ALIASES['claude-code']).toBe('claude')
    expect(harnessId('codex-cli')).toBe('codex')
    expect(harnessId('cursor')).toBe('cursor')
    expect(harnessId('unknown')).toBeUndefined()
  })
})

describe('current', () => {
  test('the README example', () => {
    current(process.env) // { harness: 'claude', evidence: 'CLAUDECODE' } or null

    expect(current({ CLAUDECODE: '1' })).toEqual({ harness: 'claude', evidence: 'CLAUDECODE' })
  })

  test('no known variable gives null', () => {
    const none: CurrentHarness | null = current({})
    expect(none).toBeNull()
  })

  test('the cross-vendor AI_AGENT variable is mapped through harnessId', () => {
    expect(current({ AI_AGENT: 'codex-cli' })?.harness).toBe('codex')
  })
})
