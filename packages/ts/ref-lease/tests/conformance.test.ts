import { describe, expect, test } from 'vitest'

import { classifyFetchFailure, classifyPush, type PushOutcome } from '@osdlc/ref-lease'

import fetchCases from './conformance/fetch.json' with { type: 'json' }
import pushCases from './conformance/push.json' with { type: 'json' }

describe('conformance: push.json', () => {
  test.each(pushCases.cases)('$name', ({ op, exitCode, stdout, stderr, expected }) => {
    const outcome: PushOutcome = classifyPush(op as 'create' | 'replace' | 'delete', {
      exitCode,
      stdout,
      stderr,
    })
    expect(outcome).toBe(expected)
  })
})

describe('conformance: fetch.json', () => {
  test.each(fetchCases.cases)('$name', ({ stderr, expected }) => {
    expect(classifyFetchFailure(stderr)).toBe(expected)
  })
})
