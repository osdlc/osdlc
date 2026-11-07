import { describe, expect, test } from 'vitest'

import { fetchFailure, pushOutcome } from '../src/classify.ts'

import fetchCases from './conformance/fetch.json' with { type: 'json' }
import pushCases from './conformance/push.json' with { type: 'json' }

type Flag = Parameters<typeof pushOutcome>[1]['flag']
type Rejection = NonNullable<Parameters<typeof pushOutcome>[1]['rejection']>

describe('conformance: push.json', () => {
  test.each(pushCases.cases)('$name', ({ op, flag, rejection, expected }) => {
    const ref = {
      flag: flag as Flag,
      ...(rejection === null ? {} : { rejection: rejection as Rejection }),
    }
    expect(pushOutcome(op as 'create' | 'replace' | 'delete', ref)).toBe(expected)
  })
})

describe('conformance: fetch.json', () => {
  test.each(fetchCases.cases)('$name', ({ stderr, expected }) => {
    expect(fetchFailure(stderr)).toBe(expected)
  })
})
